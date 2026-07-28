import { describe, expect, it } from "vitest";
import {
  assessEvidence,
  assessStrongBuy,
  buildOpportunity,
  EXTERNAL_CONSENSUS_UNVERIFIED,
  goodBuyDistance,
  goodBuyPrice,
  MAX_MARGIN_OF_SAFETY,
  MIN_MARGIN_OF_SAFETY,
  requiredMarginOfSafety,
  STRONG_BUY_GATES,
  type FairValue,
} from "@/domain/watchlist/opportunity";
import { PRICE_UNVERIFIED_MESSAGE, type MarketQuote } from "@/server/pricing/quote";

/**
 * The Watchlist is where a number turns into an instruction, so these tests are
 * mostly about refusal: the cases where NeoOS has something to say and must not
 * say it.
 */

function quote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    instrumentId: "inst-1",
    symbol: "TEST",
    assetType: "stock",
    price: 100,
    currency: "USD",
    quoteTimestamp: "2026-07-28T11:00:00.000Z",
    retrievedAt: "2026-07-28T11:01:00.000Z",
    sourceId: "src-1",
    sourceName: "Nasdaq Last Sale",
    marketState: "open",
    freshness: "delayed",
    ...overrides,
  };
}

function fairValue(overrides: Partial<FairValue> = {}): FairValue {
  return {
    value: 100,
    currency: "USD",
    valuationDate: "2026-07-20",
    method: "discounted_cash_flow",
    modelVersion: "v1",
    keyAssumptions: ["8% discount rate", "2% terminal growth"],
    marginOfSafetyRequired: 0.3,
    evidenceStatus: "current",
    externalCrossChecks: [],
    ...overrides,
  };
}

const ALL_GATES = Object.fromEntries(STRONG_BUY_GATES.map((g) => [g, true]));
const ALL_EVIDENCE = {
  verified_current_price: true,
  latest_official_filing: true,
  material_news: true,
  independent_neoos_valuation: true,
  macro_or_sector_evidence: true,
  external_research: true,
} as const;

describe("three numbers that must stay separate", () => {
  it("derives Good Buy Price from Fair Value and the required margin, not from price", () => {
    const fv = fairValue({ value: 200, marginOfSafetyRequired: 0.25 });
    expect(goodBuyPrice(fv)).toBe(150);
  });

  it("keeps Current Price, Fair Value and Good Buy Price as three distinct fields", () => {
    const opportunity = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 120 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.25 }),
      evidencePresent: ALL_EVIDENCE,
    });

    expect(opportunity.currentPrice).toBe(120);
    expect(opportunity.fairValue?.value).toBe(200);
    expect(opportunity.goodBuy).toBe(150);
    // Collapsing any two of these is what "buy below" used to do.
    expect(new Set([opportunity.currentPrice, opportunity.fairValue?.value, opportunity.goodBuy]).size).toBe(3);
  });

  it("treats an external target as a cross-check and never as the valuation", () => {
    const fv = fairValue({
      value: 200,
      externalCrossChecks: [{ source: "Broker X", value: 320, note: "Sell-side target" }],
    });
    // The cross-check is far higher and moves nothing.
    expect(goodBuyPrice(fv)).toBeCloseTo(140, 10);
  });
});

describe("margin of safety", () => {
  it("stays inside the floor and ceiling", () => {
    for (const level of [0, 0.25, 0.5, 0.75, 1]) {
      const { margin } = requiredMarginOfSafety({ business_quality: level, downside_risk: level });
      expect(margin).toBeGreaterThanOrEqual(MIN_MARGIN_OF_SAFETY);
      expect(margin).toBeLessThanOrEqual(MAX_MARGIN_OF_SAFETY);
    }
  });

  it("treats an unassessed factor as a reason for caution, not as zero concern", () => {
    const nothingKnown = requiredMarginOfSafety({});
    const allClear = requiredMarginOfSafety({
      business_quality: 0,
      balance_sheet_strength: 0,
      cash_flow_durability: 0,
      cyclicality: 0,
      valuation_uncertainty: 0,
      geopolitical_risk: 0,
      liquidity: 0,
      downside_risk: 0,
      portfolio_concentration: 0,
    });

    expect(nothingKnown.margin).toBeGreaterThan(allClear.margin);
    expect(allClear.margin).toBe(MIN_MARGIN_OF_SAFETY);
    expect(nothingKnown.unassessed).toHaveLength(9);
  });

  it("reaches the ceiling only when every factor is at maximum concern", () => {
    const maxed = requiredMarginOfSafety({
      business_quality: 1,
      balance_sheet_strength: 1,
      cash_flow_durability: 1,
      cyclicality: 1,
      valuation_uncertainty: 1,
      geopolitical_risk: 1,
      liquidity: 1,
      downside_risk: 1,
      portfolio_concentration: 1,
    });
    expect(maxed.margin).toBeCloseTo(MAX_MARGIN_OF_SAFETY, 10);
  });
});

describe("buy distance", () => {
  it("measures the gap as a percentage of the current price", () => {
    const d = goodBuyDistance({ currentPrice: 200, goodBuy: 150, strongBuy: null, valuationStale: false });
    expect(d.status).toBe("above_buy");
    expect(d.distancePercent).toBeCloseTo(25, 10);
    expect(d.label).toBe("25.0% above Buy range");
  });

  it("recognises a price inside the Buy range", () => {
    const d = goodBuyDistance({ currentPrice: 140, goodBuy: 150, strongBuy: 120, valuationStale: false });
    expect(d.status).toBe("inside_buy");
  });

  it("recognises a price inside the Strong Buy range", () => {
    const d = goodBuyDistance({ currentPrice: 110, goodBuy: 150, strongBuy: 120, valuationStale: false });
    expect(d.status).toBe("inside_strong_buy");
  });

  it("returns no distance at all when the price is missing", () => {
    const d = goodBuyDistance({ currentPrice: null, goodBuy: 150, strongBuy: null, valuationStale: false });
    expect(d.status).toBe("price_unavailable");
    expect(d.distancePercent).toBeNull();
  });

  it("returns no distance when the valuation is stale, even with a good price", () => {
    const d = goodBuyDistance({ currentPrice: 100, goodBuy: 150, strongBuy: null, valuationStale: true });
    expect(d.status).toBe("valuation_review_required");
    expect(d.distancePercent).toBeNull();
  });
});

describe("a missing price suspends the decision", () => {
  it("refuses a decision with no quote", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: null,
      fairValue: fairValue(),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
    });

    expect(o.decision).toBe("insufficient_evidence");
    expect(o.currentPrice).toBeNull();
    expect(o.suspendedReason).toBe(PRICE_UNVERIFIED_MESSAGE);
    expect(o.distance.status).toBe("price_unavailable");
  });

  it("refuses a decision on a stale quote, however good the valuation", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ freshness: "stale", price: 10 }),
      fairValue: fairValue({ value: 200 }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
    });
    // A 95% discount to fair value, and still no Buy.
    expect(o.decision).toBe("insufficient_evidence");
    expect(o.suspendedReason).toBe(PRICE_UNVERIFIED_MESSAGE);
  });

  it("refuses a decision on a manually entered price", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ freshness: "manual" }),
      fairValue: fairValue(),
      evidencePresent: ALL_EVIDENCE,
    });
    expect(o.decision).toBe("insufficient_evidence");
  });

  it("never invents a price to fill the gap", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: null,
      fairValue: fairValue(),
    });
    expect(o.currentPrice).toBeNull();
    expect(o.currentPrice).not.toBe(0);
  });
});

describe("a stale valuation suspends the ranking", () => {
  it("holds back a ranking when NeoOS's own valuation is stale", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 50 }),
      fairValue: fairValue({ value: 200, evidenceStatus: "stale" }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
    });

    expect(o.decision).toBe("insufficient_evidence");
    expect(o.distance.status).toBe("valuation_review_required");
    expect(o.suspendedReason).toContain("Valuation review required");
    // The verified price is still shown. It is the judgement that is withheld.
    expect(o.currentPrice).toBe(50);
  });

  it("treats an absent valuation the same as a stale one", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote(),
      fairValue: null,
      evidencePresent: ALL_EVIDENCE,
    });
    expect(o.distance.status).toBe("valuation_review_required");
    expect(o.goodBuy).toBeNull();
  });
});

describe("Strong Buy governance", () => {
  it("requires every gate, not most of them", () => {
    const oneShort = { ...ALL_GATES, portfolio_fit: false };
    const assessment = assessStrongBuy(oneShort);
    expect(assessment.permitted).toBe(false);
    expect(assessment.failed).toEqual(["portfolio_fit"]);
  });

  it("hides the Strong Buy threshold entirely when governance fails", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 60 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
      strongBuyPassed: { ...ALL_GATES, independent_external_research: false },
      evidencePresent: ALL_EVIDENCE,
    });

    // Omitted, not zero and not "n/a" — a threshold that could not be earned
    // must not appear as a number somebody could act on.
    expect(o.strongBuy).toBeNull();
    expect(o.decision).not.toBe("strong_buy");
    expect(assessStrongBuy({ ...ALL_GATES, independent_external_research: false }).message).toBe(
      "Strong Buy threshold unavailable",
    );
  });

  it("awards Strong Buy only when the price is inside the range and every gate passed", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 100 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
    });

    expect(o.goodBuy).toBeCloseTo(140, 10);
    expect(o.strongBuy).toBeCloseTo(119, 10);
    expect(o.decision).toBe("strong_buy");
  });

  it("falls back to Buy when the gates pass but the price is only inside the Buy range", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 130 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
    });
    expect(o.decision).toBe("buy");
  });
});

describe("evidence", () => {
  it("lowers confidence and says so when no independent research was verified", () => {
    const assessment = assessEvidence({ ...ALL_EVIDENCE, external_research: false });
    expect(assessment.sufficientForBuy).toBe(false);
    expect(assessment.notes).toContain(EXTERNAL_CONSENSUS_UNVERIFIED);
  });

  it("blocks a Buy on an otherwise attractive price when evidence is incomplete", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 100 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: { ...ALL_EVIDENCE, latest_official_filing: false },
    });
    expect(o.decision).toBe("insufficient_evidence");
  });
});

describe("what the card says", () => {
  it("renders an interpretation in plain language for every decision", () => {
    const cases = [
      buildOpportunity({
        instrumentId: "a",
        assetName: "A",
        quote: quote({ price: 100 }),
        fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
        strongBuyPassed: ALL_GATES,
        evidencePresent: ALL_EVIDENCE,
      }),
      buildOpportunity({
        instrumentId: "b",
        assetName: "B",
        quote: quote({ price: 300 }),
        fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
        evidencePresent: ALL_EVIDENCE,
      }),
      buildOpportunity({
        instrumentId: "c",
        assetName: "C",
        quote: null,
        fairValue: fairValue(),
      }),
    ];

    for (const o of cases) {
      expect(o.interpretation.length).toBeGreaterThan(20);
      // No status codes, no field names, no provenance vocabulary.
      expect(o.interpretation).not.toMatch(/insufficient_evidence|null|undefined|_[a-z]+_/);
    }
  });

  it("names the real source and verification time for the evidence view", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ sourceName: "Nasdaq Last Sale", quoteTimestamp: "2026-07-28T11:00:00.000Z" }),
      fairValue: fairValue(),
      evidencePresent: ALL_EVIDENCE,
    });

    expect(o.sourceName).toBe("Nasdaq Last Sale");
    expect(o.lastVerifiedAt).toBe("2026-07-28T11:00:00.000Z");
    expect(o.evidenceFreshness).toBe("delayed");
  });

  it("carries no source name when there was no quote to attribute", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: null,
      fairValue: fairValue(),
    });
    expect(o.sourceName).toBeNull();
    expect(o.lastVerifiedAt).toBeNull();
    expect(o.evidenceFreshness).toBe("unavailable");
  });
});

describe("avoid", () => {
  it("overrides an attractive price when the asset itself is unsuitable", () => {
    const o = buildOpportunity({
      instrumentId: "inst-1",
      assetName: "Test Co",
      quote: quote({ price: 60 }),
      fairValue: fairValue({ value: 200, marginOfSafetyRequired: 0.3 }),
      strongBuyPassed: ALL_GATES,
      evidencePresent: ALL_EVIDENCE,
      avoid: { reason: "Governance concerns at the parent company are unresolved." },
    });

    expect(o.decision).toBe("avoid");
    expect(o.interpretation).toContain("Governance concerns");
  });
});
