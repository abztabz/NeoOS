import { describe, expect, it } from "vitest";
import {
  assembleGoldBundle,
  basisIsSpot,
  bundleSupportsPostureChange,
  futuresBasisPercent,
  type GoldFuturesQuote,
} from "@/server/providers/gold/bundle";
import type { GoldPriceBasis } from "@/server/providers/gold/basis";

function spot(overrides: Partial<GoldPriceBasis> = {}): GoldPriceBasis {
  return {
    basis: "london_spot_unallocated",
    currency: "USD",
    unit: "troy_ounce",
    reference: "LBMA",
    quotedAt: "2026-07-24T15:00:00Z",
    pricePerTroyOunce: 2400,
    sourceName: "Test source",
    premiumOverSpotPercent: null,
    ...overrides,
  };
}

const futures: GoldFuturesQuote = {
  contractIdentifier: "GCQ6",
  exchange: "COMEX",
  expiry: "2026-08-27",
  settlementPerTroyOunce: 2418,
  currency: "USD",
  observedAt: "2026-07-24T18:30:00Z",
  sourceName: "Test exchange",
};

const macro = [
  {
    label: "Real rates",
    detail: "10-year TIPS yield fell 12bp over the month.",
    sourceName: "U.S. Treasury",
    observedAt: "2026-07-24T00:00:00Z",
    citation: "https://example.invalid/series",
  },
];

describe("spot and futures are structurally separate", () => {
  it("refuses a futures settlement offered as spot", () => {
    const bundle = assembleGoldBundle({
      spot: spot({ basis: "futures_settlement" }),
      spotProxy: null,
      futures: null,
      priorClose: null,
      referenceLevels: [],
      macroEvidence: [],
      structuralDemandEvidence: [],
    });

    expect(bundle.spot).toBeNull();
    expect(bundle.missing.some((m) => m.includes("refused"))).toBe(true);
    expect(bundle.missing.some((m) => m.includes("looks like rounding"))).toBe(true);
  });

  it("does not treat an ETF NAV as spot either", () => {
    expect(basisIsSpot("etf_nav")).toBe(false);
    expect(basisIsSpot("futures_settlement")).toBe(false);
    expect(basisIsSpot("london_spot_unallocated")).toBe(true);
    expect(basisIsSpot("physical_allocated")).toBe(true);
  });

  it("keeps a real futures quote alongside spot without merging them", () => {
    const bundle = assembleGoldBundle({
      spot: spot(),
      spotProxy: null,
      futures,
      priorClose: null,
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });

    expect(bundle.spot?.pricePerTroyOunce).toBe(2400);
    expect(bundle.futures?.settlementPerTroyOunce).toBe(2418);
    // The basis is reported as its own figure, not blended into either price.
    expect(futuresBasisPercent(bundle)).toBeCloseTo(0.75, 2);
  });

  it("declines to compute a basis across currencies", () => {
    const bundle = assembleGoldBundle({
      spot: spot(),
      spotProxy: null,
      futures: { ...futures, currency: "EUR" },
      priorClose: null,
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });
    expect(futuresBasisPercent(bundle)).toBeNull();
  });
});

describe("daily change", () => {
  it("computes it only against a prior close on the same basis", () => {
    const bundle = assembleGoldBundle({
      spot: spot({ pricePerTroyOunce: 2424 }),
      spotProxy: null,
      futures: null,
      priorClose: spot({ pricePerTroyOunce: 2400, quotedAt: "2026-07-23T15:00:00Z" }),
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });
    expect(bundle.dailyChangePercent).toBeCloseTo(1, 6);
    expect(bundle.priorClosePerTroyOunce).toBe(2400);
  });

  it("withholds the change when the prior quote is a different basis", () => {
    const bundle = assembleGoldBundle({
      spot: spot({ pricePerTroyOunce: 2424 }),
      spotProxy: null,
      futures: null,
      priorClose: spot({ basis: "etf_nav", pricePerTroyOunce: 2380 }),
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });

    // Otherwise the basis difference is reported to the user as a price move.
    expect(bundle.dailyChangePercent).toBeNull();
    expect(bundle.missing.some((m) => m.includes("report the basis difference as a price move"))).toBe(true);
  });
});

describe("proxies", () => {
  it("keeps a proxy out of the spot field and states its limitation", () => {
    const bundle = assembleGoldBundle({
      spot: null,
      spotProxy: {
        observation: {
          assetId: "gold",
          instrumentIdentifier: "GLD",
          instrumentName: "Gold ETF",
          venue: "Test",
          currency: "USD",
          price: 2390,
          priceUnit: "troy_ounce",
          observedAt: "2026-07-24T20:00:00Z",
          retrievedAt: "2026-07-24T20:05:00Z",
          observationClass: "end_of_day",
          sourceClass: "free_delayed_provider",
          providerId: "test",
          sourceName: "Test",
          knownDelayMinutes: null,
          adjustment: "unknown",
          corporateActionHandling: "n/a",
          freshness: "fresh",
          validationState: "validated",
          failureReason: null,
          previousClose: null,
          attribution: "test",
        },
        basis: "etf_nav",
        limitation: "An ETF NAV tracks metal after fees and is not a spot quote.",
      },
      futures: null,
      priorClose: null,
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });

    expect(bundle.spot).toBeNull();
    expect(bundle.spotProxy?.limitation).toContain("not a spot quote");
    expect(bundle.missing.some((m) => m.includes("An exact spot source"))).toBe(true);
  });
});

describe("posture changes need more than a price", () => {
  it("refuses a posture change from a price with no macro context", () => {
    const bundle = assembleGoldBundle({
      spot: spot(),
      spotProxy: null,
      futures,
      priorClose: spot({ pricePerTroyOunce: 2380 }),
      referenceLevels: [],
      macroEvidence: [],
      structuralDemandEvidence: [],
    });

    const verdict = bundleSupportsPostureChange(bundle);
    expect(verdict.supported).toBe(false);
    expect(verdict.reason).toContain("not a reason");
  });

  it("refuses a posture change built on a proxy", () => {
    const bundle = assembleGoldBundle({
      spot: null,
      spotProxy: null,
      futures: null,
      priorClose: null,
      referenceLevels: [],
      macroEvidence: macro,
      structuralDemandEvidence: [],
    });
    expect(bundleSupportsPostureChange(bundle).supported).toBe(false);
  });

  it("supports one when spot, prior close and macro context are all present", () => {
    const bundle = assembleGoldBundle({
      spot: spot(),
      spotProxy: null,
      futures,
      priorClose: spot({ pricePerTroyOunce: 2380 }),
      referenceLevels: [
        {
          label: "52-week high",
          pricePerTroyOunce: 2500,
          currency: "USD",
          asOf: "2026-05-01",
          sourceName: "Test",
        },
      ],
      macroEvidence: macro,
      structuralDemandEvidence: macro,
    });

    expect(bundleSupportsPostureChange(bundle).supported).toBe(true);
    expect(bundle.missing).toHaveLength(0);
  });
});
