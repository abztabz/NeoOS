/**
 * Every engine threshold lives here, with its rationale. No magic numbers in
 * calculation code. Changing any value is a scoring-methodology change and
 * must bump ENGINE_VERSION (see docs/SCORING_METHODOLOGY.md).
 */

/** Engine semver. Major bumps mean reports are not comparable across versions. */
export const ENGINE_VERSION = "2.0.0";

/**
 * Permanent factor weights (product directive). Must sum to exactly 1.
 * Valuation dominates because price paid is the primary controllable edge;
 * balance-sheet strength is second because it determines survivability.
 */
export const FACTOR_WEIGHTS = {
  valuation: 0.3,
  financialStrength: 0.2,
  businessQuality: 0.15,
  growth: 0.1,
  macro: 0.1,
  technical: 0.05,
  portfolioFit: 0.05,
  governance: 0.05,
} as const;

export type FactorName = keyof typeof FACTOR_WEIGHTS;
export const FACTOR_NAMES = Object.keys(FACTOR_WEIGHTS) as FactorName[];

/**
 * Factors whose absence makes a recommendation impossible rather than
 * imprecise. Missing evidence here triggers Insufficient Evidence, not a
 * default score.
 */
export const CRITICAL_FACTORS: FactorName[] = ["valuation", "financialStrength"];

/**
 * Evidence source tiers (1 = strongest). Lower-tier evidence never overrides
 * higher-tier evidence without an explicit conflict record.
 */
export const SOURCE_TIERS = {
  officialFiling: 1,
  marketData: 2,
  institutionalResearch: 3,
  macroIntelligence: 4,
  financialNews: 5,
  sentiment: 6,
} as const;
export type SourceTierName = keyof typeof SOURCE_TIERS;

/**
 * Freshness horizons per evidence type, in days. Past the horizon evidence is
 * "stale"; past 2× the horizon it is "expired" and contributes nothing.
 * Horizons reflect how quickly each class of fact decays: quarterly filings
 * stay valid for a quarter; market prices decay in days; sentiment in a week.
 */
export const FRESHNESS_HORIZON_DAYS: Record<SourceTierName, number> = {
  officialFiling: 120,
  marketData: 5,
  institutionalResearch: 90,
  macroIntelligence: 45,
  financialNews: 21,
  sentiment: 7,
};

/** Confidence multipliers by freshness. Expired evidence is excluded entirely. */
export const FRESHNESS_CONFIDENCE_MULTIPLIER = {
  fresh: 1,
  aging: 0.92, // past 2/3 of horizon
  stale: 0.75,
  expired: 0,
} as const;
export type FreshnessStatus = keyof typeof FRESHNESS_CONFIDENCE_MULTIPLIER;

/**
 * Factor score penalties (subtracted from the raw 0–100 factor score).
 * Sized so a fully stale factor loses about one rating band (~12 points)
 * and an unresolved conflict costs about half a band.
 */
export const PENALTIES = {
  /** Max points removed when every input to a factor is stale. */
  maxFreshness: 12,
  /** Max points removed when factor evidence coverage is thin. */
  maxCoverage: 10,
  /** Points removed per unresolved conflict touching the factor (capped). */
  perConflict: 6,
  maxConflict: 12,
} as const;

/**
 * Strong Buy eligibility gate. A numeric score is NEVER sufficient; every
 * check below must pass. Values chosen so Strong Buy stays rare: it demands
 * a verified, current, high-conviction case with a wide margin of safety.
 */
export const STRONG_BUY_GATE = {
  minScore: 95,
  minEvidenceIntegrity: 85,
  minConfidence: 85,
  /** Margin of safety vs the CONSERVATIVE value, not the base case. */
  minMarginOfSafety: 0.25,
  minFinancialStrength: 75,
  minGovernance: 70,
  minPortfolioFit: 60,
  /** Downside case may not lose more than this fraction of capital. */
  maxDownsideLoss: 0.35,
  /** Valuation evidence must include a source at this tier or stronger. */
  maxValuationEvidenceTier: 2,
} as const;

/**
 * Insufficient Evidence gate. Below these floors the engine refuses to emit
 * a rating rather than fabricate precision.
 */
export const INSUFFICIENT_EVIDENCE = {
  /** A critical factor with zero usable (non-expired) evidence blocks rating. */
  minCriticalCoverage: 0.25,
  minOverallConfidence: 35,
  minEvidenceIntegrity: 30,
} as const;

/** Governance raw score below this vetoes any rating above Reduce. */
export const GOVERNANCE_VETO_BELOW = 30;
/** An unresolved high-severity conflict caps the rating at Hold. */
export const CONFLICT_RATING_CAP = "Hold" as const;

/**
 * Capital deployment: hard constraints. High opportunity can NEVER override
 * these — each is a cap applied after the raw score, and every applied cap
 * is recorded in the posture's constraints list.
 */
export const DEPLOYMENT_CONSTRAINTS = {
  /** Reserves below this cap deployment at "Deploy Gradually". */
  reserveHealthFloor: 40,
  reserveCap: 40,
  /** Weak evidence caps deployment at "Deploy Gradually". */
  evidenceIntegrityFloor: 60,
  evidenceCap: 40,
  /** Concentration risk above this caps deployment at "Selective". */
  concentrationCeiling: 70,
  concentrationCap: 60,
  /** Liquidity risk above this caps deployment at "Selective". */
  liquidityRiskCeiling: 70,
  liquidityCap: 60,
  /** Maximum Deployment additionally requires these — else capped at 95. */
  maxDeployReserveHealth: 80,
  maxDeployEvidenceIntegrity: 90,
} as const;

/** Weights for the raw (pre-constraint) deployment score. Sum = 1. */
export const DEPLOYMENT_WEIGHTS = {
  /** Breadth and quality of the current opportunity set. */
  opportunity: 0.4,
  /** Inverse cash attractiveness — when cash scores high, deploy less. */
  cashInverse: 0.35,
  /** Market regime quality. */
  market: 0.25,
} as const;

/** Each qualified Strong Buy adds this many points (capped) — evidence-heavy conviction may press harder. */
export const STRONG_BUY_DEPLOYMENT_BONUS = { perStrongBuy: 4, cap: 8 } as const;
