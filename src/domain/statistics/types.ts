import { z } from "zod";

/**
 * Official statistics as evidence.
 *
 * A price is one number at one instant. A statistic is a claim about a past
 * period, published later, and revised afterwards. Four distinct times, and
 * collapsing them is the defect that makes most inflation-aware systems wrong —
 * see docs/PURCHASING_POWER_PROVIDER.md §1.
 *
 * These are `A1`/`A2`/`A6` source-class records under the country-pack
 * architecture. They are evidence about a jurisdiction, never knowledge, and
 * they reach an allocation only through the channels in COUNTRY_SOURCE_PACKS.md
 * §9.
 */

/* ---------------- what kind of thing is being evidenced ---------------- */

/**
 * Four kinds, deliberately never merged.
 *
 * Because a currency is pegged, its jurisdiction imports the anchor's
 * **monetary policy**. It does not import the anchor's **prices**. A year where
 * US CPI is 3% and local rents rise 20% is an ordinary year, not an anomaly,
 * and substituting one for the other produces a real-return figure that is
 * confidently wrong in the direction that flatters the position.
 */
export const statisticalEvidenceKinds = [
  "currency_regime",
  "domestic_price_level",
  "domestic_policy_rate",
  "imported_monetary_conditions",
] as const;
export type StatisticalEvidenceKind = (typeof statisticalEvidenceKinds)[number];

export const statisticalEvidenceKindLabels: Record<StatisticalEvidenceKind, string> = {
  currency_regime: "Currency regime",
  domestic_price_level: "Domestic price level",
  domestic_policy_rate: "Domestic policy rate",
  imported_monetary_conditions: "Imported monetary conditions",
};

/** Only this kind may deflate a nominal figure. The others never can. */
export const DEFLATOR_KIND: StatisticalEvidenceKind = "domestic_price_level";

/* ---------------- the record ---------------- */

export const statisticalUnits = [
  "index_level",
  "percent",
  "basis_points",
  "ratio",
  "currency_per_unit",
] as const;
export type StatisticalUnit = (typeof statisticalUnits)[number];

export const seasonalAdjustments = ["adjusted", "unadjusted", "not_applicable"] as const;
export type SeasonalAdjustment = (typeof seasonalAdjustments)[number];

export const STATISTICS_SCHEMA_VERSION = "1.0" as const;

export const statisticalObservationSchema = z.object({
  schemaVersion: z.literal(STATISTICS_SCHEMA_VERSION),
  observationId: z.string().min(1).max(120),
  /** Registry key, e.g. "ae.cpi.all-items". */
  seriesId: z.string().min(1).max(120),
  evidenceKind: z.enum(statisticalEvidenceKinds),
  /** The jurisdiction this describes. Never inferred from a peg. */
  jurisdiction: z.string().min(2).max(56),

  /** What period the figure describes. */
  referencePeriodStart: z.iso.date(),
  referencePeriodEnd: z.iso.date(),
  /** When the agency released it. */
  publishedAt: z.iso.date(),
  /** When NeoOS obtained it. */
  retrievedAt: z.iso.datetime({ offset: true }),
  /**
   * 0 is the first estimate. A revision is a new observation, never an
   * overwrite — otherwise "what did we believe in July" becomes unanswerable,
   * and every after-the-fact review of a decision needs exactly that.
   */
  vintage: z.number().int().min(0),
  /** The observation this revises, where it revises one. */
  supersedes: z.string().max(120).nullable(),

  value: z.number(),
  unit: z.enum(statisticalUnits),
  /**
   * Comparing an adjusted series with an unadjusted one is a mistake that looks
   * like a signal, so the two are never silently mixed.
   */
  seasonalAdjustment: z.enum(seasonalAdjustments),

  /** Resolvable location. No citation, no record. */
  sourceRef: z.string().min(1).max(500),
  sourceName: z.string().min(1).max(200),
  sourceClass: z.enum(["A1", "A2", "A3", "A4", "A5", "A6"]),
  notes: z.string().max(1000).nullable(),
});
export type StatisticalObservation = z.infer<typeof statisticalObservationSchema>;

/* ---------------- states ---------------- */

/**
 * A statistic is late far more often than it is missing, and the two mean
 * different things. Collapsing `delayed` into an error would make a normal
 * publication lag look like a broken system.
 */
export const observationStates = [
  "current",
  "delayed",
  "stale",
  "superseded",
  "unavailable",
] as const;
export type ObservationState = (typeof observationStates)[number];

export const observationStateMeaning: Record<ObservationState, string> = {
  current: "Published and inside its horizon.",
  delayed: "Past its expected publication date and not yet released. Normal, and named rather than hidden.",
  stale: "Published, but older than its horizon. Usable with decayed confidence, and said out loud.",
  superseded: "A later vintage exists. Historical only.",
  unavailable: "The source could not be reached. Treated as missing, never substituted.",
};

/** Whether a state permits the observation to be used in a live calculation. */
export function isUsable(state: ObservationState): boolean {
  return state === "current" || state === "delayed" || state === "stale";
}
