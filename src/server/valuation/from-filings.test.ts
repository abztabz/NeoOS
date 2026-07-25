import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "@/engine/models";
import {
  balanceSheetAdjustment,
  bookValuePerShare,
  currentRatio,
  freeCashFlowPerShare,
  growthAdjustment,
  GROWTH_CREDIT_CAP,
  MAX_BALANCE_SHEET_ADJUSTMENT,
  MAX_GROWTH_ADJUSTMENT,
  netDebtToEquity,
  readFundamentals,
  revenueCagr,
  valuationFromFilings,
  CONSERVATIVE_EARNINGS_YIELD,
} from "@/server/valuation/from-filings";

const CALC_DATE = "2026-07-25T09:00:00.000Z";

/**
 * Units here are the CANONICAL ones the normalizer emits, not EDGAR's own
 * labels. An earlier version of this fixture used EDGAR's vocabulary, which
 * meant this suite and the mapper suite agreed with each other while neither
 * matched what the pipeline actually produces.
 */
function fact(conceptKey: string, periodEnd: string, value: number, unit = "currency"): EvidenceRecord {
  return {
    evidenceId: `ev-${conceptKey}-${periodEnd}`,
    assetId: "apple",
    evidenceType: "officialFiling",
    sourceTier: 1,
    sourceName: "EDGAR",
    sourceRef: "https://www.sec.gov/Archives/edgar/data/1234567/x/y.htm",
    publicationDate: "2024-11-01T00:00:00Z",
    retrievedAt: CALC_DATE,
    effectiveDate: null,
    expiresAt: null,
    factor: "valuation",
    claimKey: `${conceptKey}:${periodEnd}`,
    factualClaim: `${conceptKey} for period ending ${periodEnd}`,
    normalizedValue: value,
    unit,
    confidence: 90,
    verificationStatus: "verified",
    conflictGroupId: null,
    notes: null,
  };
}

/** A profitable, modestly geared issuer with three years of revenue history. */
function healthyAccounts(): EvidenceRecord[] {
  return [
    fact("revenue", "2024-09-28", 400_000_000_000),
    fact("revenue", "2023-09-30", 380_000_000_000),
    fact("revenue", "2022-10-01", 360_000_000_000),
    fact("epsDiluted", "2024-09-28", 6.25, "currency_per_share"),
    fact("netIncome", "2024-09-28", 95_000_000_000),
    fact("operatingCashFlow", "2024-09-28", 110_000_000_000),
    fact("capitalExpenditure", "2024-09-28", 11_000_000_000),
    fact("stockholdersEquity", "2024-09-28", 60_000_000_000),
    fact("sharesOutstanding", "2024-09-28", 1_000_000_000, "count"),
    fact("dilutedShares", "2024-09-28", 1_005_000_000, "count"),
    fact("assetsCurrent", "2024-09-28", 152_000_000_000),
    fact("liabilitiesCurrent", "2024-09-28", 176_000_000_000),
    fact("cashAndEquivalents", "2024-09-28", 30_000_000_000),
    fact("longTermDebt", "2024-09-28", 86_000_000_000),
  ];
}

describe("reading fundamentals from filings", () => {
  const f = readFundamentals(healthyAccounts());

  it("takes the most recent annual figure for each concept", () => {
    expect(f.revenueLatest).toBe(400_000_000_000);
    expect(f.epsDiluted).toBe(6.25);
    expect(f.latestPeriodEnd).toBe("2024-09-28");
  });

  it("keeps the oldest revenue period for the growth series", () => {
    expect(f.revenueEarliest).toBe(360_000_000_000);
    expect(f.revenuePeriods).toBe(3);
  });

  it("records which evidence it used, so the valuation is traceable", () => {
    expect(f.evidenceIds).toContain("ev-epsDiluted-2024-09-28");
    expect(new Set(f.evidenceIds).size).toBe(f.evidenceIds.length);
  });

  it("ignores records with no value or no claim key", () => {
    const noisy = [...healthyAccounts(), { ...fact("revenue", "2021-09-25", 0), normalizedValue: null }];
    expect(readFundamentals(noisy).revenuePeriods).toBe(3);
  });
});

describe("derived measures", () => {
  const f = readFundamentals(healthyAccounts());

  it("computes revenue CAGR across filed periods", () => {
    // (400/360)^(1/2) - 1 ≈ 5.41%
    expect(revenueCagr(f)).toBeCloseTo(0.0541, 3);
  });

  it("refuses a growth rate from a single period rather than assuming one", () => {
    const single = readFundamentals([fact("revenue", "2024-09-28", 400)]);
    expect(revenueCagr(single)).toBeNull();
  });

  it("refuses a growth rate from a non-positive base, which is not a rate", () => {
    const fromZero = readFundamentals([fact("revenue", "2024-09-28", 400), fact("revenue", "2023-09-30", 0)]);
    expect(revenueCagr(fromZero)).toBeNull();
  });

  it("computes the current ratio and flags a liquidity shortfall", () => {
    expect(currentRatio(f)).toBeCloseTo(152 / 176, 4);
    expect(currentRatio(f)!).toBeLessThan(1);
  });

  it("nets cash against debt before measuring leverage", () => {
    // (86 - 30) / 60
    expect(netDebtToEquity(f)).toBeCloseTo(56 / 60, 4);
  });

  it("computes free cash flow per share on the diluted count", () => {
    expect(freeCashFlowPerShare(f)).toBeCloseTo((110_000_000_000 - 11_000_000_000) / 1_005_000_000, 4);
  });

  it("computes book value per share", () => {
    expect(bookValuePerShare(f)).toBeCloseTo(60, 4);
  });

  it("returns null rather than dividing by a zero share count", () => {
    const noShares = readFundamentals([fact("stockholdersEquity", "2024-09-28", 60)]);
    expect(bookValuePerShare(noShares)).toBeNull();
    expect(freeCashFlowPerShare(noShares)).toBeNull();
  });
});

describe("bounded adjustments", () => {
  it("caps growth credit so an extraordinary year cannot extrapolate", () => {
    expect(growthAdjustment(GROWTH_CREDIT_CAP)).toBeCloseTo(MAX_GROWTH_ADJUSTMENT, 6);
    expect(growthAdjustment(3)).toBeCloseTo(MAX_GROWTH_ADJUSTMENT, 6);
  });

  it("caps the growth penalty symmetrically", () => {
    expect(growthAdjustment(-0.9)).toBeGreaterThanOrEqual(-MAX_GROWTH_ADJUSTMENT);
  });

  it("treats absent growth data as neutral, not as a guess", () => {
    expect(growthAdjustment(null)).toBe(0);
  });

  it("keeps the balance-sheet adjustment inside its bound", () => {
    // Full credit needs both halves at their extreme: comfortable liquidity
    // AND net cash of at least 1.5× equity. Net cash of half of equity earns
    // only part of the gearing credit, which is the intended behaviour.
    const strong = readFundamentals([
      fact("assetsCurrent", "2024-09-28", 300),
      fact("liabilitiesCurrent", "2024-09-28", 100),
      fact("stockholdersEquity", "2024-09-28", 100),
      fact("longTermDebt", "2024-09-28", 0),
      fact("cashAndEquivalents", "2024-09-28", 200),
    ]);
    const modestNetCash = readFundamentals([
      fact("assetsCurrent", "2024-09-28", 300),
      fact("liabilitiesCurrent", "2024-09-28", 100),
      fact("stockholdersEquity", "2024-09-28", 100),
      fact("longTermDebt", "2024-09-28", 0),
      fact("cashAndEquivalents", "2024-09-28", 50),
    ]);
    const weak = readFundamentals([
      fact("assetsCurrent", "2024-09-28", 50),
      fact("liabilitiesCurrent", "2024-09-28", 200),
      fact("stockholdersEquity", "2024-09-28", 100),
      fact("longTermDebt", "2024-09-28", 400),
      fact("cashAndEquivalents", "2024-09-28", 0),
    ]);
    expect(balanceSheetAdjustment(strong)).toBeCloseTo(MAX_BALANCE_SHEET_ADJUSTMENT, 6);
    expect(balanceSheetAdjustment(weak)).toBeCloseTo(-MAX_BALANCE_SHEET_ADJUSTMENT, 6);
    expect(balanceSheetAdjustment(readFundamentals([]))).toBe(0);
    // Partial strength earns partial credit rather than jumping to the cap.
    const partial = balanceSheetAdjustment(modestNetCash);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(MAX_BALANCE_SHEET_ADJUSTMENT);
  });
});

describe("valuation from filings", () => {
  it("builds an earnings-multiple input from filed accounts", () => {
    const result = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    expect(result.input).not.toBeNull();
    expect(result.input?.method).toBe("earningsMultiple");
    if (result.input?.method !== "earningsMultiple") return;
    expect(result.input.eps).toBe(6.25);
    expect(result.input.marketPrice).toBe(212.5);
  });

  it("anchors the conservative multiple to a required earnings yield", () => {
    // Growth and balance-sheet effects are bounded, so the multiple stays
    // within a documented band of the 1/yield anchor.
    const result = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    if (result.input?.method !== "earningsMultiple") throw new Error("expected earningsMultiple");
    const anchor = 1 / CONSERVATIVE_EARNINGS_YIELD;
    const bound = anchor * (MAX_GROWTH_ADJUSTMENT + MAX_BALANCE_SHEET_ADJUSTMENT);
    expect(Math.abs(result.input.conservativeMultiple - anchor)).toBeLessThanOrEqual(bound);
  });

  it("orders the three multiples", () => {
    const result = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    if (result.input?.method !== "earningsMultiple") throw new Error("expected earningsMultiple");
    expect(result.input.conservativeMultiple).toBeLessThan(result.input.baseMultiple);
    expect(result.input.baseMultiple).toBeLessThan(result.input.optimisticMultiple);
  });

  it("refuses to value a loss-making period instead of switching method to reach a number", () => {
    const loss = healthyAccounts().map((r) =>
      r.claimKey?.startsWith("epsDiluted") ? { ...r, normalizedValue: -1.2 } : r,
    );
    const result = valuationFromFilings(loss, 212.5, CALC_DATE);
    expect(result.input).toBeNull();
    expect(result.reason).toMatch(/does not silently switch method/);
  });

  it("refuses to value when no earnings were filed", () => {
    const noEps = healthyAccounts().filter((r) => !r.claimKey?.startsWith("epsDiluted"));
    const result = valuationFromFilings(noEps, 212.5, CALC_DATE);
    expect(result.input).toBeNull();
    expect(result.reason).toMatch(/would be fabrication/);
  });

  it("still values without a market price, leaving the comparison to the engine", () => {
    const result = valuationFromFilings(healthyAccounts(), null, CALC_DATE);
    expect(result.input?.marketPrice).toBeNull();
    expect(result.input).not.toBeNull();
  });

  it("cites the evidence behind every figure", () => {
    const result = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    expect(result.input?.evidenceIds.length).toBeGreaterThan(5);
  });

  it("states every assumption it made, including the ones it declined to make", () => {
    const sparse = [
      fact("epsDiluted", "2024-09-28", 6.25, "currency_per_share"),
      fact("revenue", "2024-09-28", 400),
    ];
    const result = valuationFromFilings(sparse, 200, CALC_DATE);
    const text = (result.input?.assumptions ?? []).join(" ");
    expect(text).toMatch(/not measurable|not filed|no growth adjustment/);
  });

  it("scores confidence by how much is measured rather than defaulted", () => {
    const full = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    const sparse = valuationFromFilings(
      [fact("epsDiluted", "2024-09-28", 6.25, "currency_per_share")],
      212.5,
      CALC_DATE,
    );
    expect(full.input!.confidence).toBeGreaterThan(sparse.input!.confidence);
    expect(sparse.input!.confidence).toBeLessThan(70);
  });

  it("is deterministic for the same accounts", () => {
    const a = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    const b = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    expect(JSON.stringify(a.input)).toBe(JSON.stringify(b.input));
  });

  it("names conditions that would invalidate the valuation", () => {
    const result = valuationFromFilings(healthyAccounts(), 212.5, CALC_DATE);
    expect(result.input?.invalidationConditions.length).toBeGreaterThanOrEqual(3);
    expect(result.input?.invalidationConditions.join(" ")).toMatch(/restatement/i);
  });
});
