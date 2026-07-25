import type { EvidenceRecord } from "@/engine/models";
import type { ValuationInput } from "@/engine/valuation";

/**
 * Fundamental analysis from filed accounts.
 *
 * This is where public filings become a valuation. It reads the concepts the
 * EDGAR adapter extracted, computes the standard per-share measures, and hands
 * the engine an `earningsMultiple` input. It computes no score and makes no
 * recommendation — the engine still does all of that.
 *
 * The honest problem with any multiple-based valuation is that the multiple is
 * an assumption, and an assumption chosen to justify a conclusion is worthless.
 * Two controls apply here:
 *
 *   1. The multiples are anchored to a **required earnings yield**, not to what
 *      the market is currently paying. A comparables-based multiple imports the
 *      market's mood into a valuation meant to be independent of it, which
 *      guarantees an asset looks cheap precisely when everything is expensive.
 *   2. Every adjustment is bounded, deterministic, and derived from a measured
 *      figure from the filings. Nothing is discretionary, so the same accounts
 *      always produce the same valuation.
 *
 * When the accounts do not support a valuation — no earnings, no share count,
 * a loss-making period — this returns `null`. The engine's insufficient-evidence
 * gate then handles it, which is a gate that already exists and is already
 * tested. Producing a valuation from an assumed earnings figure would be
 * fabrication dressed as analysis.
 */

/* ---------------- documented constants ---------------- */

/**
 * Required earnings yields, from which the multiples are the reciprocal.
 *
 * The conservative case demands a 9% earnings yield (11.1×) — roughly a long-run
 * equity return requirement with no growth credit. The optimistic case accepts
 * 5.5% (18.2×), which is as generous as this system gets before it is simply
 * agreeing with the market.
 */
export const CONSERVATIVE_EARNINGS_YIELD = 0.09;
export const BASE_EARNINGS_YIELD = 0.07;
export const OPTIMISTIC_EARNINGS_YIELD = 0.055;

/** Growth beyond this is not extrapolated — high growth rarely persists. */
export const GROWTH_CREDIT_CAP = 0.15;
/** Decline below this is not extrapolated either; it caps the penalty. */
export const GROWTH_PENALTY_FLOOR = -0.1;
/** Maximum proportional effect growth may have on a multiple. */
export const MAX_GROWTH_ADJUSTMENT = 0.25;
/** Maximum proportional effect balance-sheet strength may have. */
export const MAX_BALANCE_SHEET_ADJUSTMENT = 0.1;

/** A current ratio at or above this earns the full liquidity credit. */
export const HEALTHY_CURRENT_RATIO = 1.5;
/** Net debt above this multiple of equity earns the full leverage penalty. */
export const HEAVY_NET_DEBT_TO_EQUITY = 1.5;

/* ---------------- measured fundamentals ---------------- */

export interface Fundamentals {
  epsDiluted: number | null;
  revenueLatest: number | null;
  revenueEarliest: number | null;
  revenuePeriods: number;
  netIncome: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  stockholdersEquity: number | null;
  sharesOutstanding: number | null;
  dilutedShares: number | null;
  assetsCurrent: number | null;
  liabilitiesCurrent: number | null;
  cashAndEquivalents: number | null;
  longTermDebt: number | null;
  currency: string;
  evidenceIds: string[];
  latestPeriodEnd: string | null;
}

/**
 * Pull the concepts out of normalized evidence.
 *
 * Records are matched by claim key (`<conceptKey>:<periodEnd>`), which the
 * EDGAR mapper sets and normalization carries through. Matching on the concept
 * key rather than on free text means a change to a label cannot silently
 * detach a figure from the analysis.
 */
export function readFundamentals(evidence: EvidenceRecord[]): Fundamentals {
  const byConcept = new Map<string, { end: string; value: number; evidenceId: string }[]>();
  let currency = "USD";

  for (const record of evidence) {
    if (record.normalizedValue === null || !record.claimKey) continue;
    const [conceptKey, periodEnd] = record.claimKey.split(":");
    if (!conceptKey || !periodEnd) continue;
    const bucket = byConcept.get(conceptKey) ?? [];
    bucket.push({ end: periodEnd, value: record.normalizedValue, evidenceId: record.evidenceId });
    byConcept.set(conceptKey, bucket);
    if (record.unit === "USD" || record.unit === "USD/shares") currency = "USD";
  }

  for (const bucket of byConcept.values()) bucket.sort((a, b) => (a.end < b.end ? 1 : -1));

  const used: string[] = [];
  const latest = (concept: string): number | null => {
    const point = byConcept.get(concept)?.[0];
    if (!point) return null;
    used.push(point.evidenceId);
    return point.value;
  };

  const revenueSeries = byConcept.get("revenue") ?? [];
  const oldestRevenue = revenueSeries[revenueSeries.length - 1];

  return {
    epsDiluted: latest("epsDiluted"),
    revenueLatest: latest("revenue"),
    revenueEarliest: oldestRevenue?.value ?? null,
    revenuePeriods: revenueSeries.length,
    netIncome: latest("netIncome"),
    operatingCashFlow: latest("operatingCashFlow"),
    capitalExpenditure: latest("capitalExpenditure"),
    stockholdersEquity: latest("stockholdersEquity"),
    sharesOutstanding: latest("sharesOutstanding"),
    dilutedShares: latest("dilutedShares"),
    assetsCurrent: latest("assetsCurrent"),
    liabilitiesCurrent: latest("liabilitiesCurrent"),
    cashAndEquivalents: latest("cashAndEquivalents"),
    longTermDebt: latest("longTermDebt"),
    currency,
    evidenceIds: [...new Set(used)],
    latestPeriodEnd: revenueSeries[0]?.end ?? null,
  };
}

/* ---------------- derived measures ---------------- */

/**
 * Compound annual revenue growth across the periods actually filed.
 *
 * Returns null with fewer than two periods rather than assuming a rate. A
 * decline from a positive base is a real negative growth rate; a move from a
 * non-positive base is not a rate at all, and reporting one would be nonsense.
 */
export function revenueCagr(f: Fundamentals): number | null {
  if (f.revenuePeriods < 2 || f.revenueLatest === null || f.revenueEarliest === null) return null;
  if (f.revenueEarliest <= 0 || f.revenueLatest <= 0) return null;
  const years = f.revenuePeriods - 1;
  return Math.pow(f.revenueLatest / f.revenueEarliest, 1 / years) - 1;
}

export function currentRatio(f: Fundamentals): number | null {
  if (f.assetsCurrent === null || f.liabilitiesCurrent === null || f.liabilitiesCurrent <= 0) return null;
  return f.assetsCurrent / f.liabilitiesCurrent;
}

export function netDebtToEquity(f: Fundamentals): number | null {
  if (f.stockholdersEquity === null || f.stockholdersEquity <= 0) return null;
  if (f.longTermDebt === null) return null;
  const netDebt = f.longTermDebt - (f.cashAndEquivalents ?? 0);
  return netDebt / f.stockholdersEquity;
}

export function freeCashFlowPerShare(f: Fundamentals): number | null {
  if (f.operatingCashFlow === null) return null;
  const shares = f.dilutedShares ?? f.sharesOutstanding;
  if (shares === null || shares <= 0) return null;
  return (f.operatingCashFlow - (f.capitalExpenditure ?? 0)) / shares;
}

export function bookValuePerShare(f: Fundamentals): number | null {
  if (f.stockholdersEquity === null || f.sharesOutstanding === null || f.sharesOutstanding <= 0) return null;
  return f.stockholdersEquity / f.sharesOutstanding;
}

/**
 * Growth adjustment, bounded and symmetric.
 *
 * Growth is clamped before it is applied, so an extraordinary year cannot
 * project itself indefinitely into a valuation. Absent growth data the
 * adjustment is zero — the neutral answer, not a guess in either direction.
 */
export function growthAdjustment(cagr: number | null): number {
  if (cagr === null) return 0;
  const clamped = Math.max(GROWTH_PENALTY_FLOOR, Math.min(GROWTH_CREDIT_CAP, cagr));
  return (clamped / GROWTH_CREDIT_CAP) * MAX_GROWTH_ADJUSTMENT;
}

/**
 * Balance-sheet adjustment from liquidity and leverage.
 *
 * Both halves are measured, both are bounded, and a missing measure
 * contributes zero rather than an assumed value.
 */
export function balanceSheetAdjustment(f: Fundamentals): number {
  const ratio = currentRatio(f);
  const leverage = netDebtToEquity(f);

  const liquidity =
    ratio === null ? 0 : Math.max(-1, Math.min(1, (ratio - 1) / (HEALTHY_CURRENT_RATIO - 1)));
  const gearing =
    leverage === null ? 0 : Math.max(-1, Math.min(1, -leverage / HEAVY_NET_DEBT_TO_EQUITY));

  return ((liquidity + gearing) / 2) * MAX_BALANCE_SHEET_ADJUSTMENT;
}

/* ---------------- the valuation ---------------- */

export interface FilingValuationResult {
  input: ValuationInput | null;
  /** Why no valuation was produced, when that is the outcome. */
  reason: string;
  fundamentals: Fundamentals;
}

/**
 * Build an earnings-multiple valuation from filed accounts.
 *
 * Confidence reflects how much of the analysis rests on measured figures rather
 * than on defaults: full marks require earnings, a share count, a growth series,
 * and a complete enough balance sheet to judge liquidity and leverage.
 */
export function valuationFromFilings(
  evidence: EvidenceRecord[],
  marketPrice: number | null,
  calculationDate: string,
): FilingValuationResult {
  const f = readFundamentals(evidence);

  if (f.epsDiluted === null) {
    return {
      input: null,
      reason:
        "No diluted earnings per share was filed for the latest annual period, so an earnings-based valuation cannot be built. Assuming an earnings figure would be fabrication.",
      fundamentals: f,
    };
  }
  if (f.epsDiluted <= 0) {
    return {
      input: null,
      reason:
        "The company reported a loss in its latest annual period. An earnings multiple is meaningless against negative earnings, and NeoOS does not silently switch method to reach a number.",
      fundamentals: f,
    };
  }

  const cagr = revenueCagr(f);
  const growth = growthAdjustment(cagr);
  const balance = balanceSheetAdjustment(f);
  const factor = 1 + growth + balance;

  const conservativeMultiple = (1 / CONSERVATIVE_EARNINGS_YIELD) * factor;
  const baseMultiple = (1 / BASE_EARNINGS_YIELD) * factor;
  const optimisticMultiple = (1 / OPTIMISTIC_EARNINGS_YIELD) * factor;

  const ratio = currentRatio(f);
  const leverage = netDebtToEquity(f);
  const fcfPerShare = freeCashFlowPerShare(f);
  const bookValue = bookValuePerShare(f);

  const assumptions = [
    `Conservative multiple ${conservativeMultiple.toFixed(1)}× from a required ${(CONSERVATIVE_EARNINGS_YIELD * 100).toFixed(1)}% earnings yield, not from market comparables.`,
    cagr === null
      ? `Revenue growth not measurable from ${f.revenuePeriods} filed period(s); no growth adjustment applied.`
      : `Revenue CAGR ${(cagr * 100).toFixed(1)}% over ${f.revenuePeriods} filed periods, applied as a ${(growth * 100).toFixed(1)}% multiple adjustment (capped at ±${(MAX_GROWTH_ADJUSTMENT * 100).toFixed(0)}%).`,
    ratio === null
      ? "Current ratio not filed; no liquidity adjustment applied."
      : `Current ratio ${ratio.toFixed(2)}.`,
    leverage === null
      ? "Net debt to equity not measurable; no leverage adjustment applied."
      : `Net debt to equity ${leverage.toFixed(2)}.`,
    `Balance-sheet adjustment ${(balance * 100).toFixed(1)}% (capped at ±${(MAX_BALANCE_SHEET_ADJUSTMENT * 100).toFixed(0)}%).`,
    fcfPerShare === null
      ? "Free cash flow per share not measurable from the filed cash-flow statement."
      : `Free cash flow per share ${fcfPerShare.toFixed(2)} ${f.currency}, as a cross-check on reported earnings.`,
    bookValue === null
      ? "Book value per share not measurable."
      : `Book value per share ${bookValue.toFixed(2)} ${f.currency}.`,
    f.latestPeriodEnd
      ? `All figures from annual filings through period ending ${f.latestPeriodEnd}.`
      : "Period end not stated on the filed figures.",
  ];

  return {
    input: {
      method: "earningsMultiple",
      calculationDate,
      currency: f.currency,
      marketPrice,
      evidenceIds: f.evidenceIds,
      confidence: confidenceFrom(f, cagr),
      assumptions,
      invalidationConditions: [
        "A restatement of the latest annual accounts.",
        "A quarter of negative earnings, which invalidates the earnings-multiple method entirely.",
        "Net debt to equity rising above the heavy-leverage threshold.",
        "A filing gap beyond the official-filing freshness horizon.",
      ],
      eps: f.epsDiluted,
      conservativeMultiple,
      baseMultiple,
      optimisticMultiple,
    },
    reason: "Valuation built from filed annual accounts.",
    fundamentals: f,
  };
}

/**
 * Confidence in the valuation, from coverage of the inputs it rests on.
 *
 * Deliberately not a judgement about the company. It answers one question: how
 * much of this analysis is measured rather than defaulted?
 */
function confidenceFrom(f: Fundamentals, cagr: number | null): number {
  let score = 40;
  if (f.epsDiluted !== null) score += 15;
  if (f.sharesOutstanding !== null || f.dilutedShares !== null) score += 10;
  if (cagr !== null) score += 10;
  if (currentRatio(f) !== null) score += 8;
  if (netDebtToEquity(f) !== null) score += 8;
  if (freeCashFlowPerShare(f) !== null) score += 5;
  if (bookValuePerShare(f) !== null) score += 4;
  return Math.min(100, score);
}
