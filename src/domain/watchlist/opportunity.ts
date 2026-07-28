import { canUsePriceForDecision, PRICE_UNVERIFIED_MESSAGE, type MarketQuote } from "@/server/pricing/quote";

/**
 * The Watchlist, as the place a decision is actually made.
 *
 * "Buy below" was the old label and it was doing two jobs badly: it read like a
 * price target somebody else had published, and it gave no sense of *why* that
 * number rather than one 5% higher. **Good Buy Price** names the thing it is —
 * the price at which this asset is worth buying given how wrong the valuation
 * could be.
 *
 * Three numbers stay separate on screen and in this module, because collapsing
 * any two of them destroys the reasoning:
 *
 *   - **Current price** — what the market says, from a named source.
 *   - **Fair Value** — NeoOS's own conservative valuation, with its method and
 *     assumptions recorded.
 *   - **Good Buy Price** — Fair Value less the margin of safety this specific
 *     asset requires.
 *
 * An external analyst target is a cross-check and never a substitute for the
 * middle one. If NeoOS has not done the valuation, it does not have one.
 */

export const watchlistDecisions = [
  "strong_buy",
  "buy",
  "watch",
  "hold",
  "avoid",
  "insufficient_evidence",
] as const;
export type WatchlistDecision = (typeof watchlistDecisions)[number];

export const decisionLabels: Record<WatchlistDecision, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  watch: "Watch",
  hold: "Hold",
  avoid: "Avoid",
  insufficient_evidence: "Insufficient evidence",
};

export const decisionMeaning: Record<WatchlistDecision, string> = {
  strong_buy:
    "An exceptional, verified discount to conservative intrinsic value, with a substantial margin of safety, high-quality asset support, acceptable downside and clear portfolio fit.",
  buy: "An attractive price with adequate evidence and acceptable portfolio fit.",
  watch: "A desirable asset currently above its Good Buy Price.",
  hold: "Reasonably valued for somebody who already owns it, and not attractive for new capital.",
  avoid: "Quality, governance, downside, valuation or evidence risk is unacceptable.",
  insufficient_evidence:
    "Current price, identity, filings, valuation or research cannot be adequately verified.",
};

/* ---------------- margin of safety ---------------- */

/**
 * What the margin of safety is allowed to be built from.
 *
 * Deliberately none of: chart support, recent highs, a round percentage, or an
 * analyst's target. Those describe what a price has done or what somebody else
 * thinks; a margin of safety describes how wrong *this* valuation could be, and
 * the only honest inputs are the things that make it uncertain.
 */
export const MARGIN_FACTORS = [
  "business_quality",
  "balance_sheet_strength",
  "cash_flow_durability",
  "cyclicality",
  "valuation_uncertainty",
  "geopolitical_risk",
  "liquidity",
  "downside_risk",
  "portfolio_concentration",
] as const;
export type MarginFactor = (typeof MARGIN_FACTORS)[number];

/** Each factor's contribution, 0 (no concern) to 1 (maximum concern). */
export type MarginAssessment = Partial<Record<MarginFactor, number>>;

/** Floor and ceiling. A margin below the floor is not a margin. */
export const MIN_MARGIN_OF_SAFETY = 0.15;
export const MAX_MARGIN_OF_SAFETY = 0.6;

/**
 * The margin this asset requires.
 *
 * Averages the assessed factors and scales between the floor and the ceiling.
 * An unassessed factor is *not* treated as zero concern — an unknown is a
 * reason for more caution, not less, so missing factors pull toward the middle
 * rather than toward the floor.
 */
export function requiredMarginOfSafety(assessment: MarginAssessment): {
  margin: number;
  assessed: MarginFactor[];
  unassessed: MarginFactor[];
} {
  const assessed = MARGIN_FACTORS.filter((f) => typeof assessment[f] === "number");
  const unassessed = MARGIN_FACTORS.filter((f) => typeof assessment[f] !== "number");

  const scores = MARGIN_FACTORS.map((factor) => assessment[factor] ?? 0.5);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;

  const margin = MIN_MARGIN_OF_SAFETY + mean * (MAX_MARGIN_OF_SAFETY - MIN_MARGIN_OF_SAFETY);
  return { margin, assessed, unassessed };
}

/* ---------------- fair value ---------------- */

export interface FairValue {
  value: number;
  currency: string;
  valuationDate: string;
  method: string;
  modelVersion: string;
  keyAssumptions: string[];
  marginOfSafetyRequired: number;
  evidenceStatus: "current" | "aging" | "stale" | "absent";
  /** Cross-checks only. Never the source of `value`. */
  externalCrossChecks: { source: string; value: number; note: string }[];
}

export function goodBuyPrice(fairValue: FairValue): number {
  return fairValue.value * (1 - fairValue.marginOfSafetyRequired);
}

/* ---------------- distance ---------------- */

export type BuyRangeStatus =
  | "inside_strong_buy"
  | "inside_buy"
  | "above_buy"
  | "price_unavailable"
  | "valuation_review_required";

export interface BuyDistance {
  status: BuyRangeStatus;
  /** Percent above the Good Buy Price. Null when it cannot be computed. */
  distancePercent: number | null;
  label: string;
}

export function goodBuyDistance(input: {
  currentPrice: number | null;
  goodBuy: number | null;
  strongBuy: number | null;
  valuationStale: boolean;
}): BuyDistance {
  if (input.valuationStale) {
    return {
      status: "valuation_review_required",
      distancePercent: null,
      label: "Valuation review required",
    };
  }
  if (input.currentPrice === null || input.currentPrice <= 0 || input.goodBuy === null) {
    return { status: "price_unavailable", distancePercent: null, label: "Price unavailable" };
  }

  const distancePercent = ((input.currentPrice - input.goodBuy) / input.currentPrice) * 100;

  if (input.strongBuy !== null && input.currentPrice <= input.strongBuy) {
    return { status: "inside_strong_buy", distancePercent, label: "Inside Strong Buy range" };
  }
  if (input.currentPrice <= input.goodBuy) {
    return { status: "inside_buy", distancePercent, label: "Inside Buy range" };
  }
  return {
    status: "above_buy",
    distancePercent,
    label: `${distancePercent.toFixed(1)}% above Buy range`,
  };
}

/* ---------------- Strong Buy governance ---------------- */

/**
 * Every gate a Strong Buy must pass.
 *
 * All of them, not most. Strong Buy is meant to be rare, and a threshold shown
 * on an asset that could not actually earn one is an invitation to act on a
 * standard the system never applied.
 */
export const STRONG_BUY_GATES = [
  "substantial_discount",
  "meaningful_margin",
  "balance_sheet_or_asset_backing",
  "durable_economics",
  "cash_flow_or_liquidation_support",
  "acceptable_downside",
  "current_official_evidence",
  "independent_external_research",
  "portfolio_fit",
  "acceptable_concentration",
] as const;
export type StrongBuyGate = (typeof STRONG_BUY_GATES)[number];

export interface StrongBuyAssessment {
  permitted: boolean;
  failed: StrongBuyGate[];
  message: string | null;
}

export function assessStrongBuy(passed: Partial<Record<StrongBuyGate, boolean>>): StrongBuyAssessment {
  const failed = STRONG_BUY_GATES.filter((gate) => passed[gate] !== true);
  return {
    permitted: failed.length === 0,
    failed,
    // Omitted rather than shown as zero or "n/a". A threshold that cannot be
    // earned should not appear at all.
    message: failed.length === 0 ? null : "Strong Buy threshold unavailable",
  };
}

/* ---------------- required evidence ---------------- */

export const REQUIRED_EVIDENCE = [
  "verified_current_price",
  "latest_official_filing",
  "material_news",
  "independent_neoos_valuation",
  "macro_or_sector_evidence",
  "external_research",
] as const;
export type RequiredEvidence = (typeof REQUIRED_EVIDENCE)[number];

export const EXTERNAL_CONSENSUS_UNVERIFIED = "External consensus not verified.";

export interface EvidenceAssessment {
  sufficientForBuy: boolean;
  missing: RequiredEvidence[];
  /** Reduced when external research could not be verified. */
  confidence: "high" | "medium" | "low";
  notes: string[];
}

export function assessEvidence(present: Partial<Record<RequiredEvidence, boolean>>): EvidenceAssessment {
  const missing = REQUIRED_EVIDENCE.filter((item) => present[item] !== true);
  const notes: string[] = [];

  // NeoOS is not an external analyst, and cannot satisfy this requirement with
  // its own opinion. Where nobody independent has looked, confidence falls.
  if (present.external_research !== true) notes.push(EXTERNAL_CONSENSUS_UNVERIFIED);

  const confidence: "high" | "medium" | "low" =
    missing.length === 0 ? "high" : missing.length <= 2 ? "medium" : "low";

  return { sufficientForBuy: missing.length === 0, missing, confidence, notes };
}

/* ---------------- the opportunity ---------------- */

export interface Opportunity {
  instrumentId: string;
  assetName: string;
  ticker: string | null;
  currentPrice: number | null;
  currency: string;
  fairValue: FairValue | null;
  goodBuy: number | null;
  strongBuy: number | null;
  distance: BuyDistance;
  decision: WatchlistDecision;
  confidence: "high" | "medium" | "low";
  evidenceFreshness: string;
  sourceName: string | null;
  lastVerifiedAt: string | null;
  /** Plain language. The card's most-read line. */
  interpretation: string;
  suspendedReason: string | null;
}

/**
 * Decide, or refuse to.
 *
 * The gate runs first and it is absolute: without a usable price there is no
 * Buy, no Strong Buy, no distance and no ranking. `insufficient_evidence` is a
 * real answer here rather than a fallback, and the card says why.
 */
export function buildOpportunity(input: {
  instrumentId: string;
  assetName: string;
  ticker?: string | null;
  quote: MarketQuote | null;
  fairValue: FairValue | null;
  strongBuyPassed?: Partial<Record<StrongBuyGate, boolean>>;
  evidencePresent?: Partial<Record<RequiredEvidence, boolean>>;
  ownsIt?: boolean;
  avoid?: { reason: string } | null;
}): Opportunity {
  const usable = canUsePriceForDecision(input.quote);
  const evidence = assessEvidence(input.evidencePresent ?? {});
  const strongBuy = assessStrongBuy(input.strongBuyPassed ?? {});

  const fairValue = input.fairValue;
  const goodBuy = fairValue ? goodBuyPrice(fairValue) : null;
  const valuationStale = fairValue === null || fairValue.evidenceStatus === "stale" || fairValue.evidenceStatus === "absent";

  const base = {
    instrumentId: input.instrumentId,
    assetName: input.assetName,
    ticker: input.ticker ?? null,
    currency: input.quote?.currency ?? fairValue?.currency ?? "USD",
    fairValue,
    goodBuy,
    strongBuy: strongBuy.permitted && goodBuy !== null ? goodBuy * 0.85 : null,
    evidenceFreshness: input.quote?.freshness ?? "unavailable",
    sourceName: input.quote?.sourceName ?? null,
    lastVerifiedAt: input.quote?.quoteTimestamp ?? null,
  };

  if (!usable) {
    return {
      ...base,
      currentPrice: null,
      distance: { status: "price_unavailable", distancePercent: null, label: "Price unavailable" },
      decision: "insufficient_evidence",
      confidence: "low",
      interpretation:
        "I can't put a decision on this. Without a price I can verify, any view I gave you would be about a number I made up rather than one the market struck.",
      suspendedReason: PRICE_UNVERIFIED_MESSAGE,
    };
  }

  const currentPrice = input.quote!.price;
  const distance = goodBuyDistance({
    currentPrice,
    goodBuy,
    strongBuy: base.strongBuy,
    valuationStale,
  });

  if (input.avoid) {
    return {
      ...base,
      currentPrice,
      distance,
      decision: "avoid",
      confidence: evidence.confidence,
      interpretation: input.avoid.reason,
      suspendedReason: null,
    };
  }

  if (distance.status === "valuation_review_required") {
    return {
      ...base,
      currentPrice,
      distance,
      decision: "insufficient_evidence",
      confidence: "low",
      interpretation:
        "The price is verified but my own valuation is not current enough to measure it against. Ranking this would imply a judgement I have not refreshed.",
      suspendedReason: "Valuation review required before this opportunity can be ranked.",
    };
  }

  // Entering a Buy range is necessary and not sufficient. Evidence, portfolio
  // fit and the Strong Buy gates still have to pass on their own.
  const insideStrong = distance.status === "inside_strong_buy" && strongBuy.permitted;
  const insideBuy = distance.status === "inside_buy" || distance.status === "inside_strong_buy";

  const decision: WatchlistDecision = !evidence.sufficientForBuy
    ? "insufficient_evidence"
    : insideStrong
      ? "strong_buy"
      : insideBuy
        ? "buy"
        : input.ownsIt
          ? "hold"
          : "watch";

  return {
    ...base,
    currentPrice,
    distance,
    decision,
    confidence: evidence.confidence,
    interpretation: interpret(decision, distance, evidence, strongBuy),
    suspendedReason: null,
  };
}

function interpret(
  decision: WatchlistDecision,
  distance: BuyDistance,
  evidence: EvidenceAssessment,
  strongBuy: StrongBuyAssessment,
): string {
  switch (decision) {
    case "strong_buy":
      return "A rare one. The discount to my conservative valuation is large enough to absorb being wrong, and every governance gate passed.";
    case "buy":
      return `Inside the range where the price compensates for how wrong my valuation could be${
        strongBuy.permitted ? "" : ", though not by enough for a Strong Buy"
      }.`;
    case "watch":
      return `A good asset at the wrong price — ${distance.label.toLowerCase()}. Worth wanting, not worth paying for today.`;
    case "hold":
      return "Fairly priced. Fine to keep owning, not attractive for new capital.";
    case "avoid":
      return "Not a price problem. Something about the asset itself makes it unsuitable at any level.";
    case "insufficient_evidence":
      return evidence.missing.length > 0
        ? `I'm missing ${evidence.missing.length} piece${evidence.missing.length === 1 ? "" : "s"} of evidence I'd want before putting a view on this${evidence.notes.length > 0 ? `. ${evidence.notes[0]}` : "."}`
        : "Not enough verified evidence to take a view.";
  }
}
