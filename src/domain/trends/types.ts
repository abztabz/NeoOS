/**
 * Long-horizon trends and standing structural risks.
 *
 * The Capital Radar answers "what materially changed since the last report".
 * That is right for a daily briefing and structurally blind to a variable that
 * moves 0.3% a month and decides the outcome over twenty years. This module is
 * the other clock — see docs/HISTORICAL_TRENDS.md §1.
 *
 * Every type here carries how much it rests on. A trend without its window and
 * its point count is an assertion wearing a chart.
 */

/* ---------------- where a trend may come from ---------------- */

/**
 * Sources, ordered by how directly NeoOS can verify them.
 *
 * `official_statistics`, `market_history` and `knowledge_precedent` are declared
 * here and have no implementation. That is deliberate: they are named gaps, so
 * a caller can report them absent rather than quietly producing a picture that
 * omits purchasing power and calls itself complete.
 */
export const trendSources = [
  "declared_position",
  "filed_fundamentals",
  "market_history",
  "official_statistics",
  "knowledge_precedent",
] as const;
export type TrendSource = (typeof trendSources)[number];

export const trendSourceLabels: Record<TrendSource, string> = {
  declared_position: "Your declared position over time",
  filed_fundamentals: "Filed company fundamentals",
  market_history: "Market price history",
  official_statistics: "Official statistics",
  knowledge_precedent: "Historical precedent",
};

/* ---------------- how much a series can carry ---------------- */

/**
 * Whether a series is long enough to be called anything.
 *
 * The commonest way to mislead with a trend is to fit one to too few points over
 * too short a window, and the resulting chart looks identical to an honest one.
 */
export const trendSufficiencies = ["insufficient", "indicative", "established"] as const;
export type TrendSufficiency = (typeof trendSufficiencies)[number];

export const MINIMUM_TREND_OBSERVATIONS = 3;
export const MINIMUM_TREND_SPAN_DAYS = 90;
export const ESTABLISHED_TREND_OBSERVATIONS = 6;
export const ESTABLISHED_TREND_SPAN_DAYS = 730;

export const trendSufficiencyLabels: Record<TrendSufficiency, string> = {
  insufficient: "Not yet a trend — two points are a line",
  indicative: "A direction, not an established pattern",
  // Deliberately hedged. Two years is one market mood, and for a generational
  // objective that is short. The label describes the series, not the world.
  established: "A pattern in this record, over a short window for this horizon",
};

export function assessSufficiency(observationCount: number, spanDays: number): TrendSufficiency {
  if (observationCount < MINIMUM_TREND_OBSERVATIONS || spanDays < MINIMUM_TREND_SPAN_DAYS) {
    return "insufficient";
  }
  if (observationCount >= ESTABLISHED_TREND_OBSERVATIONS && spanDays >= ESTABLISHED_TREND_SPAN_DAYS) {
    return "established";
  }
  return "indicative";
}

/* ---------------- signals ---------------- */

export const trendSignals = ["opportunity", "threat", "neutral"] as const;
export type TrendSignal = (typeof trendSignals)[number];

/**
 * A threat is flagged at half the magnitude of an opportunity.
 *
 * Care, expressed as behaviour, is asymmetric attention to ruin
 * (MORPHEUS_CHARACTER.md §2). That is a threshold, not a tone. A system that
 * treats a 5% gain and a 5% loss alike is optimising for return on behalf of
 * someone who asked for preservation.
 */
export const THREAT_SENSITIVITY = 2;

/** Movement below this in a share is noise, not direction. Percentage points. */
export const SHARE_FLAT_BAND_POINTS = 1;
/** Movement below this in a magnitude is noise. Proportion, so 0.02 is 2%. */
export const VALUE_FLAT_BAND = 0.02;

/** Share movement that is worth naming as an opportunity. Percentage points. */
export const OPPORTUNITY_SHARE_POINTS = 10;
/** Halved, per the asymmetry above. */
export const THREAT_SHARE_POINTS = OPPORTUNITY_SHARE_POINTS / THREAT_SENSITIVITY;

/** The same asymmetry for magnitudes. Proportions, so 0.1 is 10%. */
export const OPPORTUNITY_VALUE_RELATIVE = 0.1;
export const THREAT_VALUE_RELATIVE = OPPORTUNITY_VALUE_RELATIVE / THREAT_SENSITIVITY;

export const trendDirections = ["rising", "falling", "flat"] as const;
export type TrendDirection = (typeof trendDirections)[number];

/* ---------------- observations ---------------- */

export interface SeriesPoint {
  /** When the value was true. */
  at: string;
  /** The record it came from — a profile id, a filing accession, a release. */
  sourceId: string;
  value: number;
}

/**
 * What a measured series shows.
 *
 * `projection` is null on every observation this module produces. Extending a
 * line past its last point is a separate act that must name its assumption and
 * be labelled a projection — see docs/HISTORICAL_TRENDS.md §2. Carrying the
 * field as an explicit null keeps that a decision rather than an omission.
 */
export interface TrendObservation {
  trendId: string;
  label: string;
  source: TrendSource;
  /** Currency for a magnitude; null for a share or ratio. */
  currency: string | null;
  /** "share" values are 0–1; "currency" values are amounts. */
  unit: "share" | "currency";
  series: SeriesPoint[];
  direction: TrendDirection;
  /** Change from first to last, in the series' own unit. */
  change: number;
  /** Change in percentage points. Null for magnitudes. */
  changePoints: number | null;
  /** Change as a proportion of the first value. Null when the first value is 0. */
  changeRelative: number | null;
  observationCount: number;
  spanDays: number;
  sufficiency: TrendSufficiency;
  signal: TrendSignal;
  /** Why this matters over a generational horizon, in plain words. */
  why: string;
  /** What weakens the reading. Always shown with it, never below the fold. */
  caveats: string[];
  /**
   * Whether a decision in the journal accounts for this movement. Null here:
   * the domain layer has no access to the journal, and the server layer sets it.
   *
   * It is the difference between "you moved to 68% equity" and "you never
   * decided that; it happened" — which is the whole point of drift detection.
   */
  decisionLinked: boolean | null;
  projection: null;
}

/* ---------------- standing risks ---------------- */

/**
 * A long-term threat that does not move.
 *
 * Not every generational risk is a trend. The entire position in one currency,
 * every asset behind one custodian, no succession structure — these are visible
 * from a single profile and are often larger than anything a series shows.
 *
 * Which means NeoOS can name the biggest threats to a position on the first day
 * it is declared, with no history at all.
 */
export interface StructuralCondition {
  conditionId: string;
  label: string;
  signal: TrendSignal;
  /** The measured facts behind it. Never a claim without them. */
  evidence: string[];
  why: string;
  /** What the subject should ask or establish. Never an instruction to buy. */
  question: string;
}

/* ---------------- absence, stated ---------------- */

/**
 * A trend NeoOS cannot produce, and precisely why.
 *
 * Returned alongside the trends it can produce. A picture missing purchasing
 * power that does not say so reads as a complete picture, and the reader has no
 * way to know otherwise.
 */
export interface AbsentTrend {
  source: TrendSource;
  label: string;
  /** Why it is absent. Not "coming soon" — what is actually missing. */
  reason: string;
  /** What it would let NeoOS say. */
  unlocks: string;
}
