import { assetTotals, concentrationBy, incomeBreakdown, liabilityTotals } from "@/domain/intake/assessment";
import {
  assetKindLabels,
  VALUATION_BASIS_CONFIDENCE,
  type AssetKind,
  type IntakeProfile,
} from "@/domain/intake/types";
import {
  assessSufficiency,
  OPPORTUNITY_SHARE_POINTS,
  OPPORTUNITY_VALUE_RELATIVE,
  SHARE_FLAT_BAND_POINTS,
  THREAT_SHARE_POINTS,
  THREAT_VALUE_RELATIVE,
  trendSufficiencyLabels,
  VALUE_FLAT_BAND,
  type AbsentTrend,
  type SeriesPoint,
  type StructuralCondition,
  type TrendDirection,
  type TrendObservation,
  type TrendSignal,
} from "@/domain/trends/types";

/**
 * Trends in the subject's own declared position, and the standing risks visible
 * without any history at all.
 *
 * This is the drift layer MORPHEUS_CHARACTER.md §6 calls the most valuable
 * connection: "Your equity concentration went from 40% to 68% over eighteen
 * months. You never decided that. It happened."
 *
 * Drift is the failure mode of a careful person. Nobody chooses to become
 * concentrated; they stop noticing. Detecting it needs the past and the present
 * held together, which is what the append-only profile history is for.
 *
 * Same currency discipline as everywhere else: series are per currency, never
 * summed across them. A net worth line built by adding dirhams to dollars would
 * trend on the exchange rate and look like a fact about the position.
 */

/* ---------------- thresholds for standing risks ---------------- */

/** Above this share held in months/years/illiquid, realisation is the problem. */
export const ILLIQUID_MAJORITY = 0.6;
/** Above this share resting on the subject's own figure rather than a market. */
export const SUBJECT_ESTIMATE_MAJORITY = 0.5;
/** Below this passive share, the position depends on the subject continuing to work. */
export const LOW_PASSIVE_SHARE = 0.25;
/** A basis at or below this confidence is the subject's estimate, not a valuation. */
const ESTIMATE_CONFIDENCE_CEILING = VALUATION_BASIS_CONFIDENCE.book_value;

export interface PositionTrendReport {
  trends: TrendObservation[];
  structural: StructuralCondition[];
  /** Sources that could have contributed and did not, with the reason. */
  absent: AbsentTrend[];
  /** Plain statement of what the history can support. */
  coverage: string;
}

/* ---------------- series definitions ---------------- */

interface SeriesSpec {
  id: string;
  label: string;
  unit: "share" | "currency";
  /** The direction that is bad for a generational objective. */
  adverse: TrendDirection;
  why: string;
  /** Value for one profile in one currency, or null when not measurable. */
  read: (profile: IntakeProfile, currency: string) => number | null;
}

const NET_POSITION: SeriesSpec = {
  id: "net-position",
  label: "Net position",
  unit: "currency",
  adverse: "falling",
  why: "Declared assets less declared liabilities. The base the whole objective rests on.",
  read: (profile, currency) => {
    const assets = assetTotals(profile).totals[currency];
    if (assets === undefined) return null;
    return assets - (liabilityTotals(profile).totals[currency] ?? 0);
  },
};

const LIQUID_SHARE: SeriesSpec = {
  id: "liquid-share",
  label: "Share realisable within days",
  unit: "share",
  adverse: "falling",
  why: "An illiquid position is fine until it has to be sold in the month it is worth least.",
  read: (profile, currency) => {
    let liquid = 0;
    let total = 0;
    for (const asset of profile.assets) {
      if (asset.value.amount === null || asset.value.currency !== currency) continue;
      total += asset.value.amount;
      if (!asset.restricted && (asset.liquidity === "immediate" || asset.liquidity === "days")) {
        liquid += asset.value.amount;
      }
    }
    return total > 0 ? liquid / total : null;
  },
};

const CURRENCY_SERIES = [NET_POSITION, LIQUID_SHARE];

/* ---------------- concentration, per named bucket ---------------- */

/**
 * Concentration is tracked one bucket at a time, not as "the largest share".
 *
 * A largest-share line is not measuring one thing: when equities overtake cash
 * the identity of the bucket changes underneath the line, so a position going
 * 40% → 68% equity reports an 8-point move rather than a 28-point one. The chart
 * looks entirely reasonable and understates the drift by two thirds. Found by
 * test, and it is exactly the failure docs/HISTORICAL_TRENDS.md §3 warns about.
 *
 * A named bucket is also what makes the sentence sayable: "your equity
 * concentration went from 40% to 68%, and you never decided that."
 */
interface BucketSpec {
  idPrefix: string;
  dimension: (asset: IntakeProfile["assets"][number]) => string | null;
  labelBucket: (bucket: string) => string;
  labelSuffix: string;
  why: string;
}

/** Below this peak share, a holding is a sliver rather than a concentration. */
export const MATERIAL_BUCKET_SHARE = 0.1;

const CONCENTRATION_DIMENSIONS: BucketSpec[] = [
  {
    idPrefix: "asset-kind-share",
    dimension: (asset) => asset.kind,
    labelBucket: (bucket) => assetKindLabels[bucket as AssetKind] ?? bucket,
    labelSuffix: "of value",
    why: "Concentration is how a good decade becomes an unrecoverable year. It rises by drift far more often than by decision.",
  },
  {
    idPrefix: "jurisdiction-share",
    dimension: (asset) => asset.jurisdiction,
    labelBucket: (bucket) => bucket,
    labelSuffix: "of value by jurisdiction",
    why: "Jurisdiction decides what can be transferred, taxed, frozen or inherited. A single legal change reaches everything held there at once, and it is invisible in any measure of return.",
  },
];

function buildBucketTrends(
  spec: BucketSpec,
  ordered: IntakeProfile[],
  currency: string,
): TrendObservation[] {
  // Shares per profile, per bucket. A bucket absent from a profile that holds
  // something in this currency is a real zero — the subject held none of it —
  // and must not be confused with a profile that holds nothing in the currency
  // at all, which is a gap.
  const perProfile = ordered.map((profile) => {
    const rows = concentrationBy(profile, spec.dimension).filter((r) => r.currency === currency);
    return {
      profile,
      shares: rows.length === 0 ? null : new Map(rows.map((r) => [r.bucket, r.share])),
    };
  });

  const buckets = [...new Set(perProfile.flatMap((p) => (p.shares ? [...p.shares.keys()] : [])))].sort();
  const observations: TrendObservation[] = [];

  for (const bucket of buckets) {
    const series: SeriesPoint[] = [];
    let gaps = 0;
    for (const { profile, shares } of perProfile) {
      if (shares === null) {
        gaps++;
        continue;
      }
      series.push({ at: profile.recordedAt, sourceId: profile.profileId, value: shares.get(bucket) ?? 0 });
    }
    if (series.length < 2) continue;
    if (Math.max(...series.map((p) => p.value)) < MATERIAL_BUCKET_SHARE) continue;

    const caveats: string[] = [];
    if (gaps > 0) {
      caveats.push(
        `${gaps} of ${ordered.length} recorded versions had nothing measurable in ${currency} and are not in this line.`,
      );
    }

    observations.push(
      finish({
        trendId: `${spec.idPrefix}-${slug(bucket)}-${currency.toLowerCase()}`,
        label: `${spec.labelBucket(bucket)} as a share ${spec.labelSuffix} (${currency})`,
        currency,
        unit: "share",
        adverse: "rising",
        why: spec.why,
        series,
        caveats,
      }),
    );
  }
  return observations;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ---------------- the report ---------------- */

export function computePositionTrends(profiles: IntakeProfile[]): PositionTrendReport {
  // Oldest first. The store returns newest first; a trend read backwards would
  // report every rise as a fall, which is the kind of defect that looks fine.
  const ordered = [...profiles].sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1));
  const latest = ordered[ordered.length - 1];

  if (!latest) {
    return {
      trends: [],
      structural: [],
      absent: absentSources(),
      coverage: "No position has been declared, so there is no history to read.",
    };
  }

  const trends: TrendObservation[] = [];

  if (ordered.length >= 2) {
    const currencies = [
      ...new Set(ordered.flatMap((p) => Object.keys(assetTotals(p).totals))),
    ].sort();

    for (const currency of currencies) {
      for (const spec of CURRENCY_SERIES) {
        const observation = buildTrend(spec, ordered, currency);
        if (observation) trends.push(observation);
      }
      for (const spec of CONCENTRATION_DIMENSIONS) {
        trends.push(...buildBucketTrends(spec, ordered, currency));
      }
    }

    const passive = buildPassiveShareTrend(ordered);
    if (passive) trends.push(passive);
  }

  return {
    trends: trends.sort(bySeverity),
    structural: detectStructuralConditions(latest),
    absent: absentSources(),
    coverage: coverageStatement(ordered),
  };
}

function buildTrend(spec: SeriesSpec, ordered: IntakeProfile[], currency: string): TrendObservation | null {
  const series: SeriesPoint[] = [];
  let gaps = 0;
  for (const profile of ordered) {
    const value = spec.read(profile, currency);
    if (value === null) {
      gaps++;
      continue;
    }
    series.push({ at: profile.recordedAt, sourceId: profile.profileId, value });
  }
  if (series.length < 2) return null;

  const caveats: string[] = [];
  if (gaps > 0) {
    caveats.push(
      `${gaps} of ${ordered.length} recorded versions had nothing measurable in ${currency} and are not in this line.`,
    );
  }
  const unvalued = new Set(ordered.flatMap((p) => assetTotals(p).unvalued));
  if (unvalued.size > 0) {
    caveats.push(
      `Excludes holdings with no declared value: ${[...unvalued].join(", ")}. They are not counted as zero.`,
    );
  }

  return finish({
    trendId: `${spec.id}-${currency.toLowerCase()}`,
    label: `${spec.label} (${currency})`,
    currency,
    unit: spec.unit,
    adverse: spec.adverse,
    why: spec.why,
    series,
    caveats,
  });
}

function buildPassiveShareTrend(ordered: IntakeProfile[]): TrendObservation | null {
  const series: SeriesPoint[] = [];
  let skipped = 0;
  for (const profile of ordered) {
    const share = incomeBreakdown(profile).passiveShare;
    if (share === null) {
      skipped++;
      continue;
    }
    series.push({ at: profile.recordedAt, sourceId: profile.profileId, value: share });
  }
  if (series.length < 2) return null;

  const caveats: string[] = [];
  if (skipped > 0) {
    // The ratio is only meaningful within one currency, so a version with income
    // in two currencies contributes nothing rather than a converted guess.
    caveats.push(
      `${skipped} recorded version(s) had income in more than one currency, where this share cannot be computed without a verified rate.`,
    );
  }

  return finish({
    trendId: "passive-income-share",
    label: "Share of income that survives you not working",
    currency: null,
    unit: "share",
    adverse: "falling",
    why: "The measure that decides whether capital supports the family or the subject's continued work does. Earned income stops; asset income persists and transfers.",
    series,
    caveats,
  });
}

interface TrendDraft {
  trendId: string;
  label: string;
  currency: string | null;
  unit: "share" | "currency";
  adverse: TrendDirection;
  why: string;
  series: SeriesPoint[];
  caveats: string[];
}

function finish(draft: TrendDraft): TrendObservation {
  const first = draft.series[0]!;
  const last = draft.series[draft.series.length - 1]!;
  const change = last.value - first.value;
  const changePoints = draft.unit === "share" ? change * 100 : null;
  const changeRelative = first.value !== 0 ? change / Math.abs(first.value) : null;

  const spanDays = Math.round(
    (Date.parse(last.at) - Date.parse(first.at)) / 86_400_000,
  );
  const sufficiency = assessSufficiency(draft.series.length, spanDays);

  const flat =
    draft.unit === "share"
      ? Math.abs(changePoints ?? 0) < SHARE_FLAT_BAND_POINTS
      : Math.abs(changeRelative ?? 0) < VALUE_FLAT_BAND;
  const direction: TrendDirection = flat ? "flat" : change > 0 ? "rising" : "falling";

  const caveats = [...draft.caveats];
  if (sufficiency !== "established") {
    caveats.unshift(
      `${trendSufficiencyLabels[sufficiency]}. ${draft.series.length} recorded versions over ${spanDays} days.`,
    );
  }

  return {
    trendId: draft.trendId,
    label: draft.label,
    source: "declared_position",
    currency: draft.currency,
    unit: draft.unit,
    series: draft.series,
    direction,
    change,
    changePoints,
    changeRelative,
    observationCount: draft.series.length,
    spanDays,
    sufficiency,
    signal: classify(direction, draft.adverse, draft.unit, changePoints, changeRelative),
    why: draft.why,
    caveats,
    decisionLinked: null,
    projection: null,
  };
}

/**
 * Signal, with the asymmetry that MORPHEUS_CHARACTER.md §2 requires.
 *
 * A movement in the adverse direction is named at half the magnitude of the same
 * movement the other way. A system that treats a 5% gain and a 5% loss alike is
 * optimising for return on behalf of someone who asked for preservation.
 *
 * A short series still signals. Suppressing a large move because the record is
 * thin would hide the threat and keep the caveat, which is the wrong way round —
 * the caveat travels with the observation instead.
 */
function classify(
  direction: TrendDirection,
  adverse: TrendDirection,
  unit: "share" | "currency",
  changePoints: number | null,
  changeRelative: number | null,
): TrendSignal {
  if (direction === "flat") return "neutral";
  const magnitude = unit === "share" ? Math.abs(changePoints ?? 0) : Math.abs(changeRelative ?? 0);
  const threatAt = unit === "share" ? THREAT_SHARE_POINTS : THREAT_VALUE_RELATIVE;
  const opportunityAt = unit === "share" ? OPPORTUNITY_SHARE_POINTS : OPPORTUNITY_VALUE_RELATIVE;

  if (direction === adverse) return magnitude >= threatAt ? "threat" : "neutral";
  return magnitude >= opportunityAt ? "opportunity" : "neutral";
}

/** Threats first, then opportunities. Ruin outranks improvement in the ordering too. */
function bySeverity(a: TrendObservation, b: TrendObservation): number {
  const rank = (t: TrendObservation) => (t.signal === "threat" ? 0 : t.signal === "opportunity" ? 1 : 2);
  return rank(a) - rank(b);
}

/* ---------------- standing risks, from a single profile ---------------- */

/**
 * Long-term threats that do not move.
 *
 * These need no history, which means the largest risks to a position can be
 * named on the first day it is declared. That is worth more than any trend line
 * and it is available immediately — see docs/HISTORICAL_TRENDS.md §6.
 */
export function detectStructuralConditions(profile: IntakeProfile): StructuralCondition[] {
  const conditions: StructuralCondition[] = [];
  const valued = profile.assets.filter((a) => a.value.amount !== null);
  if (valued.length === 0 && profile.incomeSources.length === 0) return conditions;

  const currencies = new Set(valued.map((a) => a.value.currency));
  if (currencies.size === 1 && valued.length > 0) {
    const only = [...currencies][0]!;
    conditions.push({
      conditionId: "single-currency-exposure",
      label: `Everything is denominated in ${only}`,
      signal: "threat",
      evidence: [`All ${valued.length} valued holding(s) are in ${only}.`],
      why: "One currency's monetary policy governs the entire position, and that policy is set by people with no interest in this family. Over a generation it is a larger determinant of purchasing power than any allocation decision inside it.",
      question: `What would this position be worth in real terms if ${only} lost a third of its purchasing power over twenty years?`,
    });
  }

  const jurisdictions = new Set(valued.map((a) => a.jurisdiction).filter((j): j is string => j !== null));
  if (jurisdictions.size === 1 && valued.length > 1) {
    const only = [...jurisdictions][0]!;
    conditions.push({
      conditionId: "single-jurisdiction",
      label: `Every asset sits in ${only}`,
      signal: "threat",
      evidence: [`${valued.length} valued holding(s), all in ${only}.`],
      why: "Jurisdiction decides what can be transferred, taxed, frozen or inherited. A single legal change reaches the whole position at once, and no allocation inside that jurisdiction diversifies it.",
      question: "Is any part of this capital held somewhere a single legal change could not reach?",
    });
  }

  const custodians = new Set(valued.map((a) => a.custodian).filter((c): c is string => c !== null));
  if (custodians.size === 1 && valued.length > 1) {
    const only = [...custodians][0]!;
    conditions.push({
      conditionId: "single-custodian",
      label: `Everything is held with ${only}`,
      signal: "threat",
      evidence: [`${valued.length} valued holding(s), all custodied with ${only}.`],
      why: "Counterparty failure, a frozen account, or a lost credential reaches every holding at once. Diversifying assets behind one custodian diversifies the market risk and none of the access risk.",
      question: "Could this family reach any capital at all if that one institution were unavailable for a month?",
    });
  }

  for (const [currency, share] of shareBy(valued, (a) =>
    a.liquidity === "months" || a.liquidity === "years" || a.liquidity === "illiquid",
  )) {
    if (share > ILLIQUID_MAJORITY) {
      conditions.push({
        conditionId: `illiquid-majority-${currency.toLowerCase()}`,
        label: `${Math.round(share * 100)}% of ${currency} value cannot be realised quickly`,
        signal: "threat",
        evidence: [`${Math.round(share * 100)}% held in assets stated as months, years, or not realistically sellable.`],
        why: "An illiquid position is fine until it has to be sold in the month it is worth least. Forced selling at the wrong time is how a sound position produces a permanent loss.",
        question: "If income stopped tomorrow, how many months could this household run without selling something slowly?",
      });
    }
  }

  for (const [currency, share] of shareBy(
    valued,
    (a) => VALUATION_BASIS_CONFIDENCE[a.value.basis] <= ESTIMATE_CONFIDENCE_CEILING,
  )) {
    if (share > SUBJECT_ESTIMATE_MAJORITY) {
      conditions.push({
        conditionId: `estimate-majority-${currency.toLowerCase()}`,
        label: `${Math.round(share * 100)}% of ${currency} value rests on an estimate, not a market`,
        signal: "threat",
        evidence: [`${Math.round(share * 100)}% valued on book value or your own estimate.`],
        // Not a criticism. A private business genuinely has no market price.
        why: "Not a doubt about the figures — a private business has no market price. But a net worth built mostly from estimates moves when the estimate is revised rather than when the world changes, and it can be wrong in the same direction for years.",
        question: "When was each of these last valued by someone with no stake in the answer?",
      });
    }
  }

  const passiveShare = incomeBreakdown(profile).passiveShare;
  const household = profile.household;
  const indefinite = household.dependents.filter((d) => d.financiallySupported && d.supportIsIndefinite);

  if (indefinite.length > 0 && (passiveShare === null || passiveShare < LOW_PASSIVE_SHARE)) {
    conditions.push({
      conditionId: "perpetual-obligation-finite-income",
      label: "Support that never ends, funded by income that does",
      signal: "threat",
      evidence: [
        `${indefinite.length} dependent(s) supported with no stated end.`,
        passiveShare === null
          ? "Passive income share could not be computed across currencies."
          : `Only ${Math.round(passiveShare * 100)}% of income continues without you working.`,
      ],
      why: "An indefinite obligation is a perpetuity, not a horizon. It cannot be solved by living long enough or by working longer — only by capital that produces income without being consumed.",
      question: "What would fund this obligation in a year when you could not work at all?",
    });
  } else if (passiveShare !== null && passiveShare < LOW_PASSIVE_SHARE && profile.incomeSources.length > 0) {
    conditions.push({
      conditionId: "earned-income-dependence",
      label: `${Math.round(passiveShare * 100)}% of income survives you not working`,
      signal: "threat",
      evidence: [`Annualised income is ${Math.round((1 - passiveShare) * 100)}% dependent on you continuing to work.`],
      why: "Earned income stops and does not transfer. Whatever the net worth, a position at this level is a job with savings attached rather than capital supporting a family.",
      question: "What share would have to be passive before stopping work was a choice rather than a crisis?",
    });
  }

  if (household.succession.structure === "none" || household.succession.structure === "unknown") {
    conditions.push({
      conditionId: "no-succession-structure",
      label:
        household.succession.structure === "none"
          ? "No succession structure is in place"
          : "Succession arrangements have not been recorded",
      signal: "threat",
      evidence: [`Declared succession structure: ${household.succession.structure}.`],
      why: "Wealth that cannot transfer is not generational, whatever its size. An estate that is large and unstructured can lose a great deal of itself in the passing, and that risk is invisible to every measure of return.",
      question: "Where would this capital actually go, and under whose law, if it passed tomorrow?",
    });
  }

  if (household.continuityContactExists === false) {
    conditions.push({
      conditionId: "no-continuity-contact",
      label: "Nobody else could take over these affairs",
      signal: "threat",
      evidence: ["You recorded that no one else could step in."],
      why: "A single point of failure in a family's finances is a preservation risk that no allocation offsets. It is also the one that materialises at the worst possible moment.",
      question: "Who would know what exists, where it is held, and how to reach it?",
    });
  }

  return conditions;
}

/** Share of valued holdings meeting a predicate, per currency. */
function shareBy(
  valued: IntakeProfile["assets"],
  predicate: (asset: IntakeProfile["assets"][number]) => boolean,
): [string, number][] {
  const totals: Record<string, { matching: number; all: number }> = {};
  for (const asset of valued) {
    const amount = asset.value.amount ?? 0;
    const bucket = (totals[asset.value.currency] ??= { matching: 0, all: 0 });
    bucket.all += amount;
    if (predicate(asset)) bucket.matching += amount;
  }
  return Object.entries(totals)
    .filter(([, t]) => t.all > 0)
    .map(([currency, t]) => [currency, t.matching / t.all]);
}

/* ---------------- what is missing, said out loud ---------------- */

/**
 * Sources that would change the picture and are not connected.
 *
 * A trend report missing purchasing power that does not say so reads as a
 * complete one, and the reader has no way to know otherwise.
 */
export function absentSources(): AbsentTrend[] {
  return [
    {
      source: "official_statistics",
      label: "Purchasing power and interest-rate regime",
      reason:
        "No statistics provider is connected. Central banks and statistics agencies publish these directly and free; until one is wired, NeoOS has no basis for any claim about inflation or real yields.",
      unlocks:
        "Whether this position is growing in real terms or only in nominal ones — the difference that decides a generational outcome.",
    },
    {
      source: "market_history",
      label: "Long-run valuation and drawdown history",
      reason: "No price history provider is connected.",
      unlocks: "Where current valuations sit against their own long history, and how far this position has fallen before.",
    },
    {
      source: "knowledge_precedent",
      label: "Historical precedent",
      reason:
        "The knowledge corpus is empty. Asserting a precedent from model recall is forbidden without a citation — see KNOWLEDGE_POLICY.md §3.",
      unlocks: "“This resembles X, and what mattered then was Y” — the thing a calculation cannot produce.",
    },
    {
      source: "filed_fundamentals",
      label: "Multi-year company fundamentals",
      reason:
        "SEC filings are retrieved and hold several years of history, but that history is not yet read as a series.",
      unlocks: "Margin, leverage and share-count trends in holdings — dilution in particular, which is silent and permanent.",
    },
  ];
}

function coverageStatement(ordered: IntakeProfile[]): string {
  if (ordered.length === 1) {
    return "One version of your position is recorded, so standing risks can be assessed but nothing can be compared over time yet.";
  }
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const days = Math.round((Date.parse(last.recordedAt) - Date.parse(first.recordedAt)) / 86_400_000);
  return `${ordered.length} versions of your position over ${days} days. For a generational objective this is a short record, and every trend below says how short.`;
}
