import { describe, expect, it } from "vitest";
import { describeMarketCapability, resolveObservation } from "@/server/providers/market/resolver";
import type {
  MarketAssetClass,
  MarketDataProvider,
  MarketFetchOutcome,
  MarketProviderDescriptor,
} from "@/server/providers/market/provider";
import { freelyCoveredAssetClasses, unsupportedAssetClasses } from "@/server/providers/market/hierarchy";
import type {
  MarketObservation,
  ObservationClass,
  ObservationSourceClass,
} from "@/server/types/market-observation";

const NOW = new Date("2026-07-24T18:00:00Z");

function observation(overrides: Partial<MarketObservation> = {}): MarketObservation {
  return {
    assetId: "fx-eur-usd",
    instrumentIdentifier: "EURUSD",
    instrumentName: "EUR/USD",
    venue: "Test venue",
    currency: "USD",
    price: 1.0845,
    priceUnit: "1 EUR",
    observedAt: "2026-07-24T00:00:00Z",
    retrievedAt: "2026-07-24T18:00:00Z",
    observationClass: "latest_official",
    sourceClass: "official_primary",
    providerId: "test",
    sourceName: "Test source",
    knownDelayMinutes: null,
    adjustment: "not_applicable",
    corporateActionHandling: "n/a",
    freshness: "unknown",
    validationState: "validated",
    failureReason: null,
    previousClose: null,
    attribution: "test",
    ...overrides,
  };
}

interface StubOptions {
  providerId: string;
  sourceClass: ObservationSourceClass;
  observationClass?: ObservationClass;
  assetClasses?: MarketAssetClass[];
  configured?: boolean;
  unavailableReason?: string | null;
  requiresPaidSubscription?: boolean;
  requiresCredentials?: boolean;
  result?: () => Promise<MarketFetchOutcome>;
}

function stub(options: StubOptions): MarketDataProvider & { calls: number } {
  const provider = {
    calls: 0,
    describe(): MarketProviderDescriptor {
      return {
        providerId: options.providerId,
        providerName: options.providerId,
        sourceName: options.providerId,
        sourceClass: options.sourceClass,
        observationClass: options.observationClass ?? "latest_official",
        knownDelayMinutes: null,
        assetClasses: options.assetClasses ?? ["fx_pair"],
        configured: options.configured ?? true,
        requiresCredentials: options.requiresCredentials ?? false,
        requiresPaidSubscription: options.requiresPaidSubscription ?? false,
        outboundHosts: [],
        attribution: "test",
        unavailableReason: options.unavailableReason ?? null,
      };
    },
    async observe(): Promise<MarketFetchOutcome> {
      provider.calls += 1;
      if (options.result) return options.result();
      return { observations: [observation({ providerId: options.providerId })], failures: [] };
    },
  };
  return provider;
}

const request = {
  assetId: "fx-eur-usd",
  assetClass: "fx_pair" as MarketAssetClass,
  asOf: "2026-07-24T18:00:00Z",
  horizon: "daily" as const,
  now: NOW,
};

describe("fallback resolution", () => {
  it("prefers the official primary source over a licensed feed for FX", async () => {
    const licensed = stub({ providerId: "licensed", sourceClass: "licensed_market_data" });
    const official = stub({ providerId: "official", sourceClass: "official_primary" });

    const { result, trail } = await resolveObservation([licensed, official], request);

    expect(result.ok).toBe(true);
    expect(result.ok && result.observation.providerId).toBe("official");
    // The preferred source answered, so the paid one was never called: a
    // hierarchy that queried everything would rate-limit and bill for answers
    // it discards.
    expect(licensed.calls).toBe(0);
    expect(trail.at(-1)?.outcome).toBe("observed");
  });

  it("continues past a provider that throws instead of ending the walk", async () => {
    const broken = stub({
      providerId: "broken",
      sourceClass: "official_primary",
      result: async () => {
        throw new Error("CONNECT tunnel failed, response 403");
      },
    });
    const backup = stub({ providerId: "backup", sourceClass: "free_delayed_provider" });

    const { result, trail } = await resolveObservation([broken, backup], request);

    expect(result.ok).toBe(true);
    expect(result.ok && result.observation.providerId).toBe("backup");
    expect(trail[0]!.outcome).toBe("failed");
  });

  it("skips a provider that is present but unreachable, and records why", async () => {
    const blocked = stub({
      providerId: "blocked",
      sourceClass: "official_primary",
      unavailableReason: "Egress disabled in this environment.",
    });
    const manual = stub({
      providerId: "manual",
      sourceClass: "manual_operator_entry",
      observationClass: "manual",
      result: async () => ({
        observations: [observation({ providerId: "manual", observationClass: "manual" })],
        failures: [],
      }),
    });

    const { result, trail } = await resolveObservation([blocked, manual], request);

    expect(blocked.calls).toBe(0);
    expect(trail[0]!.detail).toContain("Egress disabled");
    expect(result.ok && result.observation.providerId).toBe("manual");
  });

  it("falls back to another source, never to another number", async () => {
    const wrongInstrument = stub({
      providerId: "wrong",
      sourceClass: "official_primary",
      result: async () => ({
        // Answers about a different instrument entirely.
        observations: [observation({ assetId: "fx-eur-inr" })],
        failures: [],
      }),
    });
    const correct = stub({ providerId: "correct", sourceClass: "free_delayed_provider" });

    const { result } = await resolveObservation([wrongInstrument, correct], request);

    expect(result.ok && result.observation.assetId).toBe("fx-eur-usd");
    expect(result.ok && result.observation.providerId).toBe("correct");
  });

  it("rejects an expired observation but keeps its reason for the failure", async () => {
    const ancient = stub({
      providerId: "ancient",
      sourceClass: "official_primary",
      result: async () => ({
        observations: [observation({ providerId: "ancient", observedAt: "2025-01-01T00:00:00Z" })],
        failures: [],
      }),
    });

    const { result } = await resolveObservation([ancient], request);

    expect(result.ok).toBe(false);
    // Downgrade, not discard: the briefing can say why the rating is withheld
    // rather than showing an unexplained blank.
    expect(!result.ok && result.failure.kind).toBe("expired");
    expect(!result.ok && result.failure.message).toContain("days");
  });

  it("stamps the resolved freshness onto the returned observation", async () => {
    const fresh = stub({ providerId: "fresh", sourceClass: "official_primary" });
    const { result } = await resolveObservation([fresh], request);
    expect(result.ok && result.observation.freshness).toBe("fresh");
  });

  it("reports an uncovered asset class without consulting anyone", async () => {
    const anyProvider = stub({
      providerId: "any",
      sourceClass: "official_primary",
      assetClasses: ["crypto"],
    });

    const { result } = await resolveObservation([anyProvider], { ...request, assetClass: "crypto" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("instrument_not_covered");
    expect(anyProvider.calls).toBe(0);
  });
});

describe("coverage claims", () => {
  it("claims free coverage only where an adapter exists", () => {
    const free = freelyCoveredAssetClasses();
    expect(free).toContain("fx_pair");
    expect(free).toContain("government_bond_yield");
    // No adapter, so no claim — including for asset classes this household holds.
    expect(free).not.toContain("ae_listed_equity");
    expect(free).not.toContain("np_listed_equity");
    expect(free).not.toContain("gold_spot");
  });

  it("names unsupported classes rather than degrading them into a guess", () => {
    expect(unsupportedAssetClasses()).toEqual(expect.arrayContaining(["market_index", "crypto"]));
  });
});

describe("capability reporting", () => {
  it("separates a blocked environment from a missing subscription", () => {
    const report = describeMarketCapability([
      stub({
        providerId: "ecb-fx",
        sourceClass: "official_primary",
        unavailableReason: "Egress disabled in this environment.",
      }),
      stub({
        providerId: "licensed",
        sourceClass: "licensed_market_data",
        configured: false,
        requiresPaidSubscription: true,
        requiresCredentials: true,
        unavailableReason: "No licensed credentials configured.",
      }),
    ]);

    expect(report.anyProviderUsable).toBe(false);
    expect(report.blocked.map((b) => b.providerId)).toEqual(["ecb-fx", "licensed"]);
    expect(report.detail).toContain("egress restriction rather than a missing subscription");
  });

  it("says a free-only deployment has market data, not that it lacks it", () => {
    const report = describeMarketCapability([
      stub({ providerId: "ecb-fx", sourceClass: "official_primary" }),
      stub({ providerId: "us-treasury", sourceClass: "official_primary" }),
    ]);

    expect(report.anyProviderUsable).toBe(true);
    expect(report.freeProvidersUsable).toEqual(["ecb-fx", "us-treasury"]);
    expect(report.licensedProvidersUsable).toEqual([]);
    expect(report.detail).toContain("free or official provider");
    expect(report.detail).toContain("no daily briefing depends on");
  });
});
