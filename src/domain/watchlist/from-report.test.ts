import { describe, expect, it } from "vitest";
import {
  opportunityFromReport,
  priceEvidenceFor,
  quoteFromReport,
  rankOpportunities,
  valuationEvidenceStatus,
  type ReportOpportunity,
} from "@/domain/watchlist/from-report";
import { demoEngineReport, demoReport } from "@/data/demo-report";
import type { EngineReport, EvidenceRecord, ValuationResult } from "@/engine/models";
import type { NeoosAsset } from "@/schemas/neoos-report";

/**
 * The adapter is where a report row becomes a recommendation, so it is the last
 * place an unattributed number can slip through wearing a source's clothes.
 */

const NOW = new Date("2026-07-28T12:00:00.000Z");

function marketDataEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    evidenceId: "ev-price-1",
    assetId: "asset-1",
    evidenceType: "marketData",
    sourceTier: 2,
    sourceName: "Nasdaq Last Sale",
    sourceRef: "nasdaq:last-sale",
    publicationDate: "2026-07-28T09:00:00.000Z",
    retrievedAt: "2026-07-28T09:05:00.000Z",
    effectiveDate: null,
    expiresAt: null,
    factor: null,
    claimKey: null,
    factualClaim: "Closing price",
    normalizedValue: 120,
    unit: "USD",
    confidence: 90,
    verificationStatus: "verified",
    conflictGroupId: null,
    notes: null,
    ...overrides,
  };
}

function valuation(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    method: "discountedCashFlow",
    modelVersion: "2.0.0",
    calculationDate: "2026-07-20T00:00:00.000Z",
    inputs: {},
    assumptions: ["8% discount rate"],
    evidenceIds: ["ev-price-1"],
    conservativeValue: 200,
    baseValue: 240,
    optimisticValue: 300,
    marketPrice: 120,
    currency: "USD",
    marginOfSafety: 0.4,
    sensitivity: "±4 points per 10% move in discount rate",
    confidence: 80,
    invalidationConditions: ["Discount rate above 12%"],
    limitations: [],
    ...overrides,
  };
}

function asset(overrides: Partial<NeoosAsset> = {}): NeoosAsset {
  return {
    id: "asset-1",
    name: "Test Co",
    ticker: "TST",
    score: 80,
    rating: "Buy",
    confidence: 80,
    ...overrides,
  } as NeoosAsset;
}

const TEMPLATE_RECOMMENDATION = demoEngineReport.recommendations[0]!;

function engineWith(records: EvidenceRecord[], val: ValuationResult | null): EngineReport {
  return {
    ...demoEngineReport,
    evidence: records,
    recommendations: [
      {
        ...TEMPLATE_RECOMMENDATION,
        assetId: "asset-1",
        status: "rated",
        valuation: val,
        vetoes: [],
      },
    ],
  };
}

describe("a price is only shown when the report can attribute it", () => {
  it("finds the verified market-data record for an asset", () => {
    const engine = engineWith([marketDataEvidence()], valuation());
    expect(priceEvidenceFor(engine, "asset-1")?.sourceName).toBe("Nasdaq Last Sale");
  });

  it("ignores an unverified market-data record", () => {
    const engine = engineWith(
      [marketDataEvidence({ verificationStatus: "unverified" })],
      valuation(),
    );
    expect(priceEvidenceFor(engine, "asset-1")).toBeNull();
  });

  it("ignores evidence belonging to a different asset", () => {
    const engine = engineWith([marketDataEvidence({ assetId: "asset-2" })], valuation());
    expect(priceEvidenceFor(engine, "asset-1")).toBeNull();
  });

  it("prefers the most recently published record", () => {
    const engine = engineWith(
      [
        marketDataEvidence({ evidenceId: "old", publicationDate: "2026-07-01T09:00:00.000Z", sourceName: "Old feed" }),
        marketDataEvidence({ evidenceId: "new", sourceName: "Current feed" }),
      ],
      valuation(),
    );
    expect(priceEvidenceFor(engine, "asset-1")?.sourceName).toBe("Current feed");
  });

  it("refuses to build a quote from a marketPrice with no evidence record", () => {
    // The load-bearing case. `marketPrice` is a real number in the report and
    // showing it as the current market price is exactly the old bug.
    const quote = quoteFromReport({
      assetId: "asset-1",
      ticker: "TST",
      assetType: "stock",
      valuation: valuation(),
      evidence: null,
      now: NOW,
    });
    expect(quote).toBeNull();
  });

  it("never labels a report price as live", () => {
    const quote = quoteFromReport({
      assetId: "asset-1",
      ticker: "TST",
      assetType: "stock",
      valuation: valuation(),
      evidence: marketDataEvidence(),
      now: NOW,
    });
    expect(quote?.freshness).not.toBe("live");
    expect(quote?.sourceName).toBe("Nasdaq Last Sale");
    expect(quote?.quoteTimestamp).toBe("2026-07-28T09:00:00.000Z");
  });

  it("lets an old report go stale on its own", () => {
    const quote = quoteFromReport({
      assetId: "asset-1",
      ticker: "TST",
      assetType: "stock",
      valuation: valuation(),
      evidence: marketDataEvidence({
        publicationDate: "2026-06-01T09:00:00.000Z",
        retrievedAt: "2026-06-01T09:05:00.000Z",
      }),
      now: NOW,
    });
    expect(quote?.freshness).toBe("stale");
  });
});

describe("how current NeoOS's own valuation is", () => {
  it("ages from its calculation date", () => {
    expect(valuationEvidenceStatus("2026-07-20T00:00:00.000Z", NOW)).toBe("current");
    expect(valuationEvidenceStatus("2026-06-01T00:00:00.000Z", NOW)).toBe("aging");
    expect(valuationEvidenceStatus("2025-01-01T00:00:00.000Z", NOW)).toBe("stale");
  });
});

describe("building the card", () => {
  it("suspends the decision when the price cannot be attributed", () => {
    const engine = engineWith([], valuation());
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.currentPrice).toBeNull();
    expect(o.decision).toBe("insufficient_evidence");
    expect(o.suspendedReason).toContain("could not be verified");
  });

  it("takes Fair Value from the valuation trace and never from the report row", () => {
    const engine = engineWith([marketDataEvidence()], valuation({ conservativeValue: 200 }));
    // The row asserts a wildly different number with nothing behind it.
    const o = opportunityFromReport(asset({ buyBelow: 9_999 } as Partial<NeoosAsset>), engine, NOW);
    expect(o.fairValue?.value).toBe(200);
    expect(o.goodBuy).toBeCloseTo(200 * (1 - 35 / 140), 10);
  });

  it("withholds Fair Value entirely when there is no valuation trace", () => {
    // The report carries the price inside the valuation trace, so an asset with
    // no valuation has neither a Fair Value nor a price. Both are withheld
    // rather than one being improvised from the other.
    const engine = engineWith([marketDataEvidence()], null);
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.fairValue).toBeNull();
    expect(o.goodBuy).toBeNull();
    expect(o.currentPrice).toBeNull();
    expect(o.distance.status).toBe("price_unavailable");
  });

  it("shows a verified price but withholds the ranking when the valuation has gone stale", () => {
    const engine = engineWith(
      [marketDataEvidence()],
      valuation({ calculationDate: "2024-01-01T00:00:00.000Z" }),
    );
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.currentPrice).toBe(120);
    expect(o.fairValue?.evidenceStatus).toBe("stale");
    expect(o.distance.status).toBe("valuation_review_required");
    expect(o.suspendedReason).toContain("Valuation review required");
  });

  it("carries the valuation trace through for the evidence disclosure", () => {
    const engine = engineWith([marketDataEvidence()], valuation());
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.valuationTrace?.modelVersion).toBe("2.0.0");
    expect(o.valuationTrace?.assumptions).toContain("8% discount rate");
  });

  it("refuses a Strong Buy when no independent research was verified", () => {
    // Price is deep inside every range and the valuation is current.
    const engine = engineWith([marketDataEvidence()], valuation({ marketPrice: 60 }));
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.strongBuy).toBeNull();
    expect(o.decision).not.toBe("strong_buy");
  });

  it("turns an engine veto into an Avoid rather than a price question", () => {
    const base = engineWith([marketDataEvidence()], valuation());
    const engine: EngineReport = {
      ...base,
      recommendations: [{ ...base.recommendations[0]!, vetoes: ["Auditor resigned without explanation"] }],
    };
    const o = opportunityFromReport(asset(), engine, NOW);
    expect(o.decision).toBe("avoid");
    expect(o.interpretation).toContain("Auditor resigned");
  });

  it("produces no decision at all with no engine report", () => {
    const o = opportunityFromReport(asset(), null, NOW);
    expect(o.decision).toBe("insufficient_evidence");
    expect(o.currentPrice).toBeNull();
    expect(o.fairValue).toBeNull();
    expect(o.sourceName).toBeNull();
  });
});

describe("ranking", () => {
  function stub(decision: ReportOpportunity["decision"], distance: number | null, name: string) {
    return {
      decision,
      assetName: name,
      distance: { status: "above_buy", distancePercent: distance, label: "" },
    } as ReportOpportunity;
  }

  it("orders by decision first, then by how close the price is", () => {
    const ranked = rankOpportunities([
      stub("watch", 40, "D"),
      stub("buy", 5, "B"),
      stub("strong_buy", 2, "A"),
      stub("watch", 10, "C"),
    ]);
    expect(ranked.map((o) => o.assetName)).toEqual(["A", "B", "C", "D"]);
  });

  it("sinks suspended cards to the bottom rather than hiding them", () => {
    const ranked = rankOpportunities([
      stub("insufficient_evidence", null, "Suspended"),
      stub("watch", 10, "Watched"),
    ]);
    expect(ranked.map((o) => o.assetName)).toEqual(["Watched", "Suspended"]);
    expect(ranked).toHaveLength(2);
  });
});

describe("against the shipped demo report", () => {
  it("builds a card for every asset without throwing", () => {
    for (const a of demoReport.assets) {
      const o = opportunityFromReport(a, demoEngineReport, NOW);
      expect(o.instrumentId).toBe(a.id);
      expect(o.interpretation.length).toBeGreaterThan(0);
    }
  });

  it("never emits a zero or negative current price", () => {
    for (const a of demoReport.assets) {
      const o = opportunityFromReport(a, demoEngineReport, NOW);
      if (o.currentPrice !== null) expect(o.currentPrice).toBeGreaterThan(0);
    }
  });
});
