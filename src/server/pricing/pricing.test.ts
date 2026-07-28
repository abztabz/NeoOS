import { describe, expect, it } from "vitest";
import {
  canUsePriceForDecision,
  classifyQuoteFreshness,
  validateQuote,
  withCurrentFreshness,
  type MarketQuote,
} from "@/server/pricing/quote";
import { mayRequestPrice, resolveIdentity } from "@/server/pricing/instrument";
import { checkPricingStartup, pricingPolicy } from "@/server/pricing/environment";
import { PricingService, QuoteCache } from "@/server/pricing/service";
import type { PricingProvider, ProviderDescriptor } from "@/server/pricing/provider";

/**
 * Pricing, held to the rule that matters: a price NeoOS cannot verify is not a
 * cheaper kind of price, it is no price. Nothing in this suite lets a fixture,
 * a zero, an undated figure or a stale quote reach a decision.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function quote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    instrumentId: "instrument-AAPL-XNAS",
    symbol: "AAPL",
    name: "Apple Inc.",
    venue: "NASDAQ",
    mic: "XNAS",
    assetType: "stock",
    price: 210.5,
    currency: "USD",
    quoteTimestamp: "2026-07-28T11:55:00.000Z",
    retrievedAt: "2026-07-28T11:59:00.000Z",
    sourceId: "test-source",
    sourceName: "Test Source",
    marketState: "open",
    freshness: "live",
    ...overrides,
  };
}

describe("quote validation", () => {
  it("accepts a complete live quote", () => {
    const result = validateQuote(quote());
    expect(result.ok).toBe(true);
  });

  it("rejects a zero price", () => {
    const result = validateQuote(quote({ price: 0 }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.rejection.field).toBe("price");
  });

  it("rejects a negative price", () => {
    expect(validateQuote(quote({ price: -12 })).ok).toBe(false);
  });

  it("rejects a quote with no timestamp", () => {
    const withoutTimestamp: Record<string, unknown> = { ...quote() };
    delete withoutTimestamp.quoteTimestamp;
    const result = validateQuote(withoutTimestamp);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.rejection.field).toBe("quoteTimestamp");
  });

  it("rejects a quote with no source", () => {
    const withoutSource: Record<string, unknown> = { ...quote() };
    delete withoutSource.sourceId;
    expect(validateQuote(withoutSource).ok).toBe(false);
  });

  it("rejects a quote struck after it was retrieved", () => {
    // A future-dated price never ages, so it would read as current forever.
    const result = validateQuote(
      quote({ quoteTimestamp: "2026-07-28T13:00:00.000Z", retrievedAt: "2026-07-28T11:00:00.000Z" }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.rejection.reason).toContain("timestamped after");
  });

  it("rejects a malformed provider response", () => {
    expect(validateQuote({ nonsense: true }).ok).toBe(false);
    expect(validateQuote(null).ok).toBe(false);
    expect(validateQuote("a string").ok).toBe(false);
  });
});

describe("the decision gate", () => {
  it("accepts live, delayed and previous close", () => {
    for (const freshness of ["live", "delayed", "previous_close"] as const) {
      expect(canUsePriceForDecision(quote({ freshness })), freshness).toBe(true);
    }
  });

  it("refuses stale, manual and unavailable", () => {
    for (const freshness of ["stale", "manual", "unavailable"] as const) {
      expect(canUsePriceForDecision(quote({ freshness })), freshness).toBe(false);
    }
  });

  it("refuses a null quote", () => {
    expect(canUsePriceForDecision(null)).toBe(false);
  });
});

describe("freshness by age", () => {
  it("keeps a recent quote live during an open session", () => {
    expect(classifyQuoteFreshness(quote(), NOW)).toBe("live");
  });

  it("goes stale once past the asset's open-session limit", () => {
    const old = quote({ quoteTimestamp: "2026-07-28T10:00:00.000Z" });
    expect(classifyQuoteFreshness(old, NOW)).toBe("stale");
  });

  it("labels an out-of-session quote previous close rather than live", () => {
    const closed = quote({ marketState: "closed", quoteTimestamp: "2026-07-27T20:00:00.000Z" });
    expect(classifyQuoteFreshness(closed, NOW)).toBe("previous_close");
  });

  it("treats an undatable quote as stale rather than current", () => {
    expect(classifyQuoteFreshness(quote({ quoteTimestamp: "not-a-date" }), NOW)).toBe("stale");
  });

  it("never re-stamps the quote timestamp when reclassifying", () => {
    const original = quote({ quoteTimestamp: "2026-07-28T10:00:00.000Z" });
    const reclassified = withCurrentFreshness(original, NOW);
    expect(reclassified.quoteTimestamp).toBe(original.quoteTimestamp);
    expect(reclassified.freshness).toBe("stale");
  });
});

describe("instrument identity", () => {
  it("verifies a fully-specified instrument", () => {
    const identity = resolveIdentity({
      symbol: "aapl",
      name: "Apple Inc.",
      assetType: "stock",
      exchange: "NASDAQ",
      mic: "XNAS",
      currency: "USD",
      providerMappings: { "test-provider": "AAPL" },
    });
    expect(identity.identityStatus).toBe("verified");
    expect(identity.symbol).toBe("AAPL");
    expect(mayRequestPrice(identity)).toBe(true);
  });

  it("refuses to price a bare ticker with no venue", () => {
    // The same string is a different asset on a different venue, and the
    // subject holding "40,000 AED of stocks" has not said which market.
    const identity = resolveIdentity({
      symbol: "ABC",
      providerMappings: { "test-provider": "ABC" },
    });
    expect(identity.identityStatus).toBe("ambiguous");
    expect(mayRequestPrice(identity)).toBe(false);
  });

  it("marks an instrument with no provider mapping unresolved", () => {
    expect(resolveIdentity({ symbol: "XYZ" }).identityStatus).toBe("unresolved");
  });
});

describe("production safety", () => {
  it("permits nothing fake in production", () => {
    const policy = pricingPolicy("production");
    expect(policy.allowMockPricing).toBe(false);
    expect(policy.allowFixturePricing).toBe(false);
    expect(policy.allowSeededQuotes).toBe(false);
    expect(policy.allowFallbackPriceConstants).toBe(false);
  });

  it("permits fixtures in test and development, where they cannot escape", () => {
    expect(pricingPolicy("test").allowFixturePricing).toBe(true);
    expect(pricingPolicy("development").allowFixturePricing).toBe(true);
  });

  it("fails the startup check when a fake pricing flag is set in production", () => {
    const check = checkPricingStartup("production", { NEOOS_ALLOW_FIXTURE_PRICING: "1" });
    expect(check.ok).toBe(false);
    expect(check.violations[0]).toContain("NEOOS_ALLOW_FIXTURE_PRICING");
  });

  it("passes a clean production configuration", () => {
    expect(checkPricingStartup("production", {}).ok).toBe(true);
  });

  it("throws when a service is constructed against a bad production config", () => {
    const saved = process.env.NEOOS_ALLOW_MOCK_PRICING;
    process.env.NEOOS_ALLOW_MOCK_PRICING = "1";
    expect(() => new PricingService({ providers: [], environment: "production" })).toThrow(
      /refused to start/,
    );
    if (saved === undefined) delete process.env.NEOOS_ALLOW_MOCK_PRICING;
    else process.env.NEOOS_ALLOW_MOCK_PRICING = saved;
  });
});

/* ---------------- the service ---------------- */

function stubProvider(options: {
  providerId: string;
  priority: number;
  assetTypes?: string[];
  result?: () => Promise<unknown>;
  health?: "ok" | "failing" | "unconfigured";
}): PricingProvider {
  const descriptor: ProviderDescriptor = {
    providerId: options.providerId,
    providerName: options.providerId,
    sourceName: options.providerId,
    assetTypes: options.assetTypes ?? ["stock"],
    requiresCredentials: false,
    requiresPaidSubscription: false,
    outboundHosts: [],
    attribution: "test",
    priority: options.priority,
  };
  return {
    describe: () => descriptor,
    getQuote: async () =>
      (await (options.result?.() ?? Promise.resolve(quote({ sourceId: options.providerId })))) as MarketQuote,
    getHealthStatus: async () => ({
      providerId: options.providerId,
      providerName: options.providerId,
      state: options.health ?? "ok",
      reason: options.health === "unconfigured" ? "No credentials configured." : null,
      lastSuccessAt: null,
      lastFailureAt: null,
    }),
  };
}

const identity = resolveIdentity({
  symbol: "AAPL",
  name: "Apple Inc.",
  assetType: "stock",
  exchange: "NASDAQ",
  mic: "XNAS",
  currency: "USD",
  providerMappings: { primary: "AAPL", secondary: "AAPL" },
});

describe("the pricing service", () => {
  it("returns a validated quote from the preferred provider", async () => {
    const service = new PricingService({
      providers: [stubProvider({ providerId: "primary", priority: 1 })],
      environment: "test",
      now: () => NOW,
    });
    const result = await service.getPrice(identity);
    expect(result.quote?.price).toBe(210.5);
    expect(result.usableForDecision).toBe(true);
    expect(result.evidence?.sourceName).toBeTruthy();
  });

  it("refuses to price an ambiguous instrument", async () => {
    const service = new PricingService({
      providers: [stubProvider({ providerId: "primary", priority: 1 })],
      environment: "test",
      now: () => NOW,
    });
    const ambiguous = resolveIdentity({ symbol: "ABC", providerMappings: { primary: "ABC" } });
    const result = await service.getPrice(ambiguous);
    expect(result.quote).toBeNull();
    expect(result.unavailableReason).toContain("identity not verified");
  });

  it("falls back to a secondary source and records the switch", async () => {
    const service = new PricingService({
      providers: [
        stubProvider({
          providerId: "primary",
          priority: 1,
          result: () => Promise.reject(new Error("provider timeout")),
        }),
        stubProvider({ providerId: "secondary", priority: 2 }),
      ],
      environment: "test",
      now: () => NOW,
    });

    const result = await service.getPrice(identity);
    expect(result.quote?.sourceId).toBe("secondary");
    // Silent switching would let the evidence view credit a source that never
    // answered.
    expect(result.evidence?.sourceSwitches).toHaveLength(1);
    expect(result.evidence?.sourceSwitches[0]?.reason).toContain("timeout");
  });

  it("skips an unconfigured provider without treating it as a failure", async () => {
    const service = new PricingService({
      providers: [
        stubProvider({ providerId: "primary", priority: 1, health: "unconfigured" }),
        stubProvider({ providerId: "secondary", priority: 2 }),
      ],
      environment: "test",
      now: () => NOW,
    });
    const result = await service.getPrice(identity);
    expect(result.quote?.sourceId).toBe("secondary");
    expect(result.trail[0]?.outcome).toBe("unavailable");
  });

  it("returns price unavailable rather than a fixture when everything fails", async () => {
    const service = new PricingService({
      providers: [
        stubProvider({
          providerId: "primary",
          priority: 1,
          result: () => Promise.reject(new Error("down")),
        }),
      ],
      environment: "test",
      now: () => NOW,
    });
    const result = await service.getPrice(identity);
    expect(result.quote).toBeNull();
    expect(result.unavailableReason).toBe("Price unavailable");
    expect(result.usableForDecision).toBe(false);
  });

  it("rejects a malformed provider response instead of passing it through", async () => {
    const service = new PricingService({
      providers: [
        stubProvider({ providerId: "primary", priority: 1, result: async () => ({ price: 0 }) }),
      ],
      environment: "test",
      now: () => NOW,
    });
    const result = await service.getPrice(identity);
    expect(result.quote).toBeNull();
    expect(result.trail[0]?.outcome).toBe("rejected");
  });

  it("reports live pricing inactive when no provider is registered", () => {
    const service = new PricingService({ providers: [], environment: "test" });
    expect(service.describeCapability().detail).toContain(
      "live pricing remains inactive until approved provider credentials are configured",
    );
  });
});

describe("the quote cache", () => {
  it("keeps the original quote timestamp on a cache hit", () => {
    const cache = new QuoteCache(300);
    const original = quote({ quoteTimestamp: "2026-07-28T11:00:00.000Z" });
    cache.set("instrument-AAPL-XNAS", original, "primary", NOW);

    const later = new Date("2026-07-28T12:04:00.000Z");
    const entry = cache.get("instrument-AAPL-XNAS", later);
    // The timestamp is a fact about the market, not about the cache.
    expect(entry?.quote.quoteTimestamp).toBe("2026-07-28T11:00:00.000Z");
  });

  it("expires an entry and reports nothing rather than something old", () => {
    const cache = new QuoteCache(60);
    cache.set("instrument-AAPL-XNAS", quote(), "primary", NOW);
    const wellLater = new Date(NOW.getTime() + 10 * 60_000);
    expect(cache.get("instrument-AAPL-XNAS", wellLater)).toBeNull();
  });

  it("lets a cached quote go stale by sitting still", () => {
    const cache = new QuoteCache(3600);
    cache.set("instrument-AAPL-XNAS", quote({ quoteTimestamp: "2026-07-28T11:00:00.000Z" }), "p", NOW);
    const later = new Date("2026-07-28T12:30:00.000Z");
    const entry = cache.get("instrument-AAPL-XNAS", later)!;
    expect(classifyQuoteFreshness(entry.quote, later)).toBe("stale");
    expect(canUsePriceForDecision(withCurrentFreshness(entry.quote, later))).toBe(false);
  });
});
