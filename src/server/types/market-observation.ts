import { z } from "zod";

/**
 * Market observations — what NeoOS knows about a price, and how well it knows it.
 *
 * This module exists to retire a word. "Live" was doing too much work: it was
 * used for *the run retrieved something*, for *the quote is real-time*, and for
 * *the environment has outbound network access*. Those are three different
 * facts, and collapsing them produced a false conclusion — that NeoOS cannot
 * obtain current market data without a paid exchange licence.
 *
 * The truth is narrower and better. Exchange-grade **real-time streaming** is
 * licensed and usually paid. Almost everything else a long-horizon allocator
 * needs — official filings, central bank series, government debt yields, fund
 * disclosures, end-of-day marks, delayed quotes — is published by the primary
 * source itself, free, under terms that permit exactly this use.
 *
 * A generational-wealth system does not decide Buy or Hold on the last tick. It
 * decides on the last *disclosed* observation, provided the observation states
 * when it was struck, how delayed it is, and where it came from. That is what
 * the type below forces every price to carry.
 *
 * The one thing NeoOS still refuses is silence dressed as knowledge: an
 * observation with no timestamp, no source, or no stated latency is not a
 * cheaper kind of price. It is `unavailable`.
 */

/* ---------------- observation class: the latency spectrum ---------------- */

/**
 * How close to the market this observation actually is.
 *
 * Ordered from most immediate to least. `latest_official` sits deliberately
 * below `end_of_day`: a central bank's daily reference rate or a fund's last
 * published NAV is authoritative but may be a day or more old, and its age is a
 * property of the publication schedule rather than of the retrieval.
 *
 * `unavailable` is a first-class member. A missing price is a state to report,
 * not an absence to paper over.
 */
export const observationClasses = [
  "real_time",
  "delayed",
  "end_of_day",
  "latest_official",
  "manual",
  "unavailable",
] as const;
export type ObservationClass = (typeof observationClasses)[number];

export const observationClassLabels: Record<ObservationClass, string> = {
  real_time: "Real-time",
  delayed: "Delayed",
  end_of_day: "End of day",
  latest_official: "Latest official observation",
  manual: "Manually entered",
  unavailable: "Unavailable",
};

export const observationClassMeaning: Record<ObservationClass, string> = {
  real_time:
    "Struck on the venue and delivered without deliberate delay. Requires an exchange licence in most markets, and is the only class NeoOS will not claim without the operator stating the licence grants it.",
  delayed:
    "A genuine venue price, deliberately held back by a stated interval — typically 15 to 20 minutes. Widely available without an exchange licence and entirely sufficient for a decision measured in years.",
  end_of_day:
    "The session's closing or settlement mark. Published by exchanges, funds and index providers, usually free, and the basis on which most valuation work is actually done.",
  latest_official:
    "The most recent observation the primary institution has published — a central bank reference rate, a government yield curve, a fund NAV. Authoritative, dated, and often a day or more old by design.",
  manual:
    "Entered by the operator with a citation. Never provider-verified, never silently promoted, and always visibly labelled as manual.",
  unavailable:
    "No source in the configured hierarchy produced a usable observation. The reason is recorded and the dependent recommendation is withheld or downgraded.",
};

/** Whether a class carries an actual number. `unavailable` does not. */
export function classCarriesPrice(observationClass: ObservationClass): boolean {
  return observationClass !== "unavailable";
}

/**
 * Whether a class may be described to the user as real-time.
 *
 * Exactly one qualifies, and only when the operator has stated the licence
 * grants it. Everything else is delayed, end-of-day, or official — all of which
 * are honest words that do not require anyone's permission to use.
 */
export function mayClaimRealTime(observationClass: ObservationClass): boolean {
  return observationClass === "real_time";
}

/* ---------------- source class: who published it ---------------- */

/**
 * The kind of institution behind the observation, which is what determines how
 * much weight it may carry — separately from how fresh it is.
 *
 * Freshness and authority are independent axes. A real-time quote from an
 * unaccountable aggregator is worse evidence than yesterday's settlement from
 * the exchange that struck it, and a hierarchy that ranked on latency alone
 * would get that backwards.
 */
export const observationSourceClasses = [
  "official_primary",
  "official_republished",
  "licensed_market_data",
  "free_delayed_provider",
  "verified_secondary",
  "manual_operator_entry",
] as const;
export type ObservationSourceClass = (typeof observationSourceClasses)[number];

export const observationSourceClassLabels: Record<ObservationSourceClass, string> = {
  official_primary: "Official primary source",
  official_republished: "Official source, republished",
  licensed_market_data: "Licensed market-data provider",
  free_delayed_provider: "Free or delayed market-data provider",
  verified_secondary: "Independently verified secondary source",
  manual_operator_entry: "Manual operator entry",
};

export const observationSourceClassMeaning: Record<ObservationSourceClass, string> = {
  official_primary:
    "The institution that creates the fact publishes it: the exchange that struck the trade, the central bank that set the rate, the treasury that issued the debt, the fund that holds the assets, the regulator that received the filing.",
  official_republished:
    "An official body restating another official body's series — accurate, attributable, but one step from the origin and subject to that body's own revision schedule.",
  licensed_market_data:
    "A commercial vendor operating under exchange licences. Optional in NeoOS, never a prerequisite for a daily briefing.",
  free_delayed_provider:
    "A provider offering delayed quotes, end-of-day marks, historical series or reference data at no cost. Usable and useful; not authoritative merely because it is convenient.",
  verified_secondary:
    "A secondary source whose figure has been checked against a primary one. The verification is what makes it admissible, not the source's reputation.",
  manual_operator_entry:
    "The operator typed it in. Carries provenance, a citation where one exists, and an expiry, and is never treated as provider-verified.",
};

/**
 * Rank within the source hierarchy. Lower is stronger.
 *
 * Used by the resolver to order fallback. It is not a quality score and does not
 * reach valuation — it decides which source is consulted first, and which
 * observation wins when two disagree.
 */
export const OBSERVATION_SOURCE_RANK: Record<ObservationSourceClass, number> = {
  official_primary: 1,
  licensed_market_data: 2,
  official_republished: 3,
  free_delayed_provider: 4,
  verified_secondary: 5,
  manual_operator_entry: 6,
};

/* ---------------- decision horizon ---------------- */

/**
 * How long the decision this observation feeds is meant to hold.
 *
 * NeoOS is a generational-wealth system, so `strategic` and `daily` are the
 * normal cases and `intraday` is the exception. The horizon is what makes a
 * freshness rule meaningful: a two-hour-old quote is stale for a trade and
 * entirely adequate for a decision measured in years.
 *
 * This is the mechanism that stops "not real-time" from being treated as "not
 * usable".
 */
export const decisionHorizons = ["intraday", "daily", "strategic"] as const;
export type DecisionHorizon = (typeof decisionHorizons)[number];

export const decisionHorizonLabels: Record<DecisionHorizon, string> = {
  intraday: "Intraday",
  daily: "Daily briefing",
  strategic: "Strategic, multi-year",
};

/** NeoOS's default. Stated once, here, rather than assumed at each call site. */
export const DEFAULT_DECISION_HORIZON: DecisionHorizon = "daily";

/* ---------------- freshness ---------------- */

export const freshnessStates = ["fresh", "aging", "stale", "expired", "unknown"] as const;
export type FreshnessState = (typeof freshnessStates)[number];

export const freshnessStateLabels: Record<FreshnessState, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  expired: "Expired",
  unknown: "Age not determinable",
};

/**
 * Maximum age, in minutes, at which an observation of each class is still
 * `fresh` for each decision horizon. Beyond `fresh` it ages, then goes stale,
 * then expires — the multipliers are below.
 *
 * The end-of-day and latest-official rows are the substantive correction. An
 * end-of-day mark is expected to be up to a session old; treating that as
 * staleness would reject the exact data most valuation work is built on. Over a
 * weekend or a holiday it may legitimately be three days old, which the
 * `strategic` column allows for.
 *
 * `unavailable` has no threshold because it has no observation to age.
 */
export const FRESH_WITHIN_MINUTES: Record<
  Exclude<ObservationClass, "unavailable">,
  Record<DecisionHorizon, number>
> = {
  real_time: { intraday: 5, daily: 60, strategic: 24 * 60 },
  delayed: { intraday: 30, daily: 6 * 60, strategic: 3 * 24 * 60 },
  end_of_day: { intraday: 0, daily: 36 * 60, strategic: 5 * 24 * 60 },
  latest_official: { intraday: 0, daily: 4 * 24 * 60, strategic: 21 * 24 * 60 },
  manual: { intraday: 0, daily: 7 * 24 * 60, strategic: 30 * 24 * 60 },
};

/** Past `fresh`, an observation ages for this multiple before it is stale. */
export const AGING_MULTIPLIER = 2;
/** Past `stale`, it expires at this multiple and can no longer support a rating. */
export const EXPIRED_MULTIPLIER = 6;

/**
 * Classify an observation's age against the horizon it is being used for.
 *
 * An `intraday` threshold of zero means the class cannot serve that horizon at
 * all: an end-of-day mark is never fresh for an intraday decision, at any age.
 * That returns `expired` rather than `stale`, because no amount of waiting
 * improves it — the wrong instrument is being used for the job.
 */
export function classifyFreshness(input: {
  observationClass: ObservationClass;
  observedAt: string;
  now: Date;
  horizon?: DecisionHorizon;
}): { state: FreshnessState; ageMinutes: number | null; reason: string } {
  const horizon = input.horizon ?? DEFAULT_DECISION_HORIZON;

  if (input.observationClass === "unavailable") {
    return { state: "unknown", ageMinutes: null, reason: "No observation was retrieved." };
  }

  const observed = new Date(input.observedAt).getTime();
  if (Number.isNaN(observed)) {
    return {
      state: "unknown",
      ageMinutes: null,
      reason:
        "The observation carries no parsable timestamp, so its age cannot be established and it cannot be trusted as current.",
    };
  }

  const ageMinutes = Math.max(0, (input.now.getTime() - observed) / 60_000);
  const freshWithin = FRESH_WITHIN_MINUTES[input.observationClass][horizon];
  const label = observationClassLabels[input.observationClass].toLowerCase();

  if (freshWithin === 0) {
    return {
      state: "expired",
      ageMinutes,
      reason: `A ${label} observation cannot support an ${decisionHorizonLabels[horizon].toLowerCase()} decision at any age.`,
    };
  }
  if (ageMinutes <= freshWithin) {
    return {
      state: "fresh",
      ageMinutes,
      reason: `A ${label} observation ${formatAge(ageMinutes)} old is within the ${freshWithin}-minute freshness window for a ${decisionHorizonLabels[horizon].toLowerCase()} decision.`,
    };
  }
  if (ageMinutes <= freshWithin * AGING_MULTIPLIER) {
    return {
      state: "aging",
      ageMinutes,
      reason: `A ${label} observation ${formatAge(ageMinutes)} old is past its freshness window but still usable with reduced confidence.`,
    };
  }
  if (ageMinutes <= freshWithin * EXPIRED_MULTIPLIER) {
    return {
      state: "stale",
      ageMinutes,
      reason: `A ${label} observation ${formatAge(ageMinutes)} old is stale for a ${decisionHorizonLabels[horizon].toLowerCase()} decision. Confidence is reduced and upgrades are blocked.`,
    };
  }
  return {
    state: "expired",
    ageMinutes,
    reason: `A ${label} observation ${formatAge(ageMinutes)} old has expired and cannot support a rating.`,
  };
}

function formatAge(minutes: number): string {
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * What a freshness state permits.
 *
 * The asymmetry is deliberate and is the safeguard the task's acceptance
 * criteria turn on: aging and stale evidence may still support *holding* or
 * *reducing*, because those are the conservative directions, but may never
 * support a new Buy and never a Strong Buy. Deploying capital on evidence you
 * have already admitted is stale is the specific mistake worth engineering
 * against.
 */
export interface FreshnessPermissions {
  mayRate: boolean;
  mayUpgrade: boolean;
  maySupportStrongBuy: boolean;
  confidenceMultiplier: number;
  note: string;
}

export const FRESHNESS_PERMISSIONS: Record<FreshnessState, FreshnessPermissions> = {
  fresh: {
    mayRate: true,
    mayUpgrade: true,
    maySupportStrongBuy: true,
    confidenceMultiplier: 1,
    note: "Within the freshness window for this decision horizon.",
  },
  aging: {
    mayRate: true,
    mayUpgrade: true,
    maySupportStrongBuy: false,
    confidenceMultiplier: 0.85,
    note: "Past the freshness window. Ratings stand with reduced confidence; Strong Buy is withheld because it requires current evidence.",
  },
  stale: {
    mayRate: true,
    mayUpgrade: false,
    maySupportStrongBuy: false,
    confidenceMultiplier: 0.6,
    note: "Stale. Existing ratings hold or reduce; no upgrade may be issued on evidence this old.",
  },
  expired: {
    mayRate: false,
    mayUpgrade: false,
    maySupportStrongBuy: false,
    confidenceMultiplier: 0,
    note: "Expired. No rating may be issued from this observation.",
  },
  unknown: {
    mayRate: false,
    mayUpgrade: false,
    maySupportStrongBuy: false,
    confidenceMultiplier: 0,
    note: "Age not determinable. An observation that cannot be dated is treated as unusable rather than as current.",
  },
};

/* ---------------- validation and adjustment ---------------- */

export const validationStates = ["validated", "unvalidated", "rejected"] as const;
export type ValidationState = (typeof validationStates)[number];

/**
 * Whether the series accounts for splits and distributions.
 *
 * Comparing an adjusted history to an unadjusted current price silently
 * manufactures a gain or a loss at every corporate action, so the status
 * travels with the observation rather than being assumed by whoever reads it.
 */
export const priceAdjustments = ["adjusted", "unadjusted", "not_applicable", "unknown"] as const;
export type PriceAdjustment = (typeof priceAdjustments)[number];

export const priceAdjustmentLabels: Record<PriceAdjustment, string> = {
  adjusted: "Adjusted for splits and distributions",
  unadjusted: "As traded, unadjusted",
  not_applicable: "Corporate actions do not apply",
  unknown: "Adjustment basis not stated by the source",
};

/* ---------------- failure and insufficiency ---------------- */

/**
 * Why an observation is unavailable.
 *
 * `environment_no_network` is listed first because it is the case that was
 * previously misreported as a product limitation. A build or CI sandbox with
 * egress disabled produces exactly this, and it says nothing whatsoever about
 * whether free data exists for the instrument.
 */
export const observationFailureKinds = [
  "environment_no_network",
  "no_provider_configured",
  "instrument_not_covered",
  "provider_unauthorized",
  "provider_rate_limited",
  "provider_timeout",
  "provider_bad_status",
  "malformed_response",
  "implausible_value",
  "missing_timestamp",
  "missing_currency",
  "expired",
] as const;
export type ObservationFailureKind = (typeof observationFailureKinds)[number];

export const observationFailureMeaning: Record<ObservationFailureKind, string> = {
  environment_no_network:
    "This execution environment cannot make outbound requests. That is a property of where NeoOS is running, not of the instrument or of data availability, and it is resolved by deploying with network access rather than by buying a licence.",
  no_provider_configured:
    "No provider covering this instrument is configured in this deployment.",
  instrument_not_covered:
    "Every configured provider was consulted and none covers this instrument. Coverage is not claimed where no provider path exists.",
  provider_unauthorized: "The provider rejected the credentials supplied.",
  provider_rate_limited: "The provider's rate limit was reached.",
  provider_timeout: "The provider did not respond within the timeout.",
  provider_bad_status: "The provider returned an error status.",
  malformed_response: "The provider's response could not be parsed into an observation.",
  implausible_value: "The value returned failed the plausibility guard and was refused rather than used.",
  missing_timestamp:
    "The source did not state when the observation was struck. Retrieval time is not a substitute, because it would make an old figure look current.",
  missing_currency: "The source did not state a currency, so the figure cannot be compared to a valuation.",
  expired: "The best available observation is older than any rule permits for this decision.",
};

/** Failures the operator can fix by configuration or deployment, not by paying. */
export const OPERATOR_RESOLVABLE_FAILURES: ObservationFailureKind[] = [
  "environment_no_network",
  "no_provider_configured",
  "provider_unauthorized",
];

/* ---------------- the observation ---------------- */

/**
 * One market observation, from any source class, at any latency.
 *
 * Every field that a reader would need in order to disagree with the number is
 * mandatory. Nothing here is optional-but-usually-present: a source that cannot
 * supply a timestamp, a currency, or its own latency does not produce a weaker
 * observation, it produces a failure.
 */
export const marketObservationSchema = z.object({
  /** Canonical NeoOS asset id. */
  assetId: z.string(),
  /** Identifier as the source knows it, kept for the audit trail. */
  instrumentIdentifier: z.string(),
  /** Human-readable instrument name, so a report never shows a bare symbol. */
  instrumentName: z.string(),
  /** Exchange, benchmark or publishing institution the figure is struck against. */
  venue: z.string(),
  currency: z.string().length(3),
  price: z.number().positive(),
  /** What one unit of price buys: "share", "unit", "troy_ounce", "percent_per_annum". */
  priceUnit: z.string(),

  /** When the market or the institution struck the figure. Never the fetch time. */
  observedAt: z.iso.datetime({ offset: true }),
  /** When NeoOS retrieved it. Recorded separately, never substituted for the above. */
  retrievedAt: z.iso.datetime({ offset: true }),

  observationClass: z.enum(observationClasses),
  sourceClass: z.enum(observationSourceClasses),
  /** Provider id and the publishing institution's own name. */
  providerId: z.string(),
  sourceName: z.string(),
  /** Stated delay in minutes where the source discloses one. Never inferred. */
  knownDelayMinutes: z.number().int().min(0).nullable(),

  adjustment: z.enum(priceAdjustments),
  /** How splits and distributions are handled in this series, in words. */
  corporateActionHandling: z.string(),

  freshness: z.enum(freshnessStates),
  validationState: z.enum(validationStates),
  /** Populated only when the observation is unusable. */
  failureReason: z.string().nullable(),

  /** Prior published close, where the source supplies it. Never inferred. */
  previousClose: z.number().positive().nullable(),
  /** Terms and attribution the source requires. Displayed, never hidden. */
  attribution: z.string(),
});
export type MarketObservation = z.infer<typeof marketObservationSchema>;

/**
 * An instrument NeoOS could not observe, with the reason and what would fix it.
 *
 * A first-class result rather than an exception, so a briefing can report "gold
 * is unavailable because the environment has no egress" in the same shape it
 * reports a price.
 */
export interface ObservationUnavailable {
  assetId: string;
  kind: ObservationFailureKind;
  message: string;
  /** Providers consulted before giving up, in the order they were tried. */
  attemptedProviders: string[];
  /** Whether deploying or configuring differently would resolve this. */
  operatorResolvable: boolean;
}

export type ObservationResult =
  | { ok: true; observation: MarketObservation }
  | { ok: false; failure: ObservationUnavailable };

export function unavailable(
  assetId: string,
  kind: ObservationFailureKind,
  attemptedProviders: string[],
  extra?: string,
): ObservationUnavailable {
  return {
    assetId,
    kind,
    message: extra ? `${observationFailureMeaning[kind]} ${extra}` : observationFailureMeaning[kind],
    attemptedProviders,
    operatorResolvable: OPERATOR_RESOLVABLE_FAILURES.includes(kind),
  };
}

/* ---------------- plausibility ---------------- */

export function observationIsPlausible(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/**
 * The loose corruption guard, retained from the licensed-feed path and applied
 * to every source class. A decimal shift or a currency mix-up is a feed error
 * whoever published it; free sources are not exempt from the check, and neither
 * are official ones.
 */
export const MAX_PLAUSIBLE_SINGLE_STEP_MOVE = 0.6;

export function moveIsPlausible(price: number, previous: number | null): boolean {
  if (previous === null || previous <= 0) return true;
  return Math.abs(price - previous) / previous <= MAX_PLAUSIBLE_SINGLE_STEP_MOVE;
}

/**
 * Describe an observation in one sentence, with everything a reader needs to
 * judge it. Used verbatim in the UI so the latency and the source cannot be
 * separated from the number by a layout change.
 */
export function describeObservation(observation: MarketObservation): string {
  const delay =
    observation.knownDelayMinutes !== null && observation.knownDelayMinutes > 0
      ? `, delayed ${observation.knownDelayMinutes} minutes`
      : "";
  return (
    `${observation.price} ${observation.currency} per ${observation.priceUnit} for ${observation.instrumentName} ` +
    `(${observation.venue}) — ${observationClassLabels[observation.observationClass].toLowerCase()}${delay}, ` +
    `observed ${observation.observedAt}, from ${observation.sourceName}. ` +
    `${freshnessStateLabels[observation.freshness]}. ${priceAdjustmentLabels[observation.adjustment]}.`
  );
}
