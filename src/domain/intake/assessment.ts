import {
  ANNUALISATION,
  ASSET_KIND_PRICEABLE,
  type AssetHolding,
  type AssetKind,
  type Dependent,
  type IntakeProfile,
} from "@/domain/intake/types";

/**
 * What the profile can and cannot support, and the measures that answer the
 * subject's actual question.
 *
 * Two rules run through this module.
 *
 * **Missing is missing.** No figure is defaulted, inferred, or filled with a
 * plausible midpoint. Every measure returns null when its inputs are absent,
 * and the caller must say so rather than show a number.
 *
 * **Currencies are never mixed without a verified rate.** Totals are returned
 * per currency. A single "net worth" number built by silently adding dirhams to
 * dollars is worse than no number, because it looks like an answer.
 */

/* ---------------- what the profile can support ---------------- */

/**
 * How far NeoOS may go with what it has been told.
 *
 * The gap between `general` and `personal` is the whole product. A general view
 * presented as personal advice is the specific failure this guards.
 */
export const guidanceLevels = ["general", "directional", "personal"] as const;
export type GuidanceLevel = (typeof guidanceLevels)[number];

export const guidanceLevelLabels: Record<GuidanceLevel, string> = {
  general: "General view — NeoOS does not know your position",
  directional: "Directional — some of your position is known",
  personal: "Personal — grounded in your declared position",
};

export interface MissingInput {
  field: string;
  /** What answering it makes possible. Never a nag without a payoff. */
  unlocks: string;
  /** Whether the answer is blocked without it, or merely weaker. */
  severity: "blocking" | "limiting";
}

export interface CompletenessAssessment {
  level: GuidanceLevel;
  /** 0–100. How much of the answer rests on declared facts, not defaults. */
  completeness: number;
  missing: MissingInput[];
  /** Plain statement for the interface. Never a percentage on its own. */
  summary: string;
}

export function assessCompleteness(profile: IntakeProfile): CompletenessAssessment {
  const missing: MissingInput[] = [];

  const hasAssets = profile.assets.length > 0;
  const hasIncome = profile.incomeSources.length > 0;
  const hasBaseCurrency = profile.objective.baseCurrency !== null;
  const hasHousehold =
    profile.household.dependents.length > 0 || profile.household.monthlyObligations !== null;
  const hasReserve = profile.objective.reserveMonths !== null;
  const hasHorizon = profile.objective.horizonYears !== null;

  if (!hasAssets) {
    missing.push({
      field: "assets",
      unlocks: "Net worth, concentration, and whether any allocation advice can be personal at all.",
      severity: "blocking",
    });
  }
  if (!hasIncome) {
    missing.push({
      field: "incomeSources",
      unlocks: "Deployable surplus each month, and how much of your income survives you not working.",
      severity: "blocking",
    });
  }
  if (!hasBaseCurrency) {
    missing.push({
      field: "objective.baseCurrency",
      unlocks: "The currency your returns are measured in. Without it, currency risk cannot be assessed.",
      severity: "blocking",
    });
  }
  if (!hasReserve) {
    missing.push({
      field: "objective.reserveMonths",
      unlocks: "How much cash is genuinely deployable rather than reserved.",
      severity: "limiting",
    });
  }
  if (!hasHorizon) {
    missing.push({
      field: "objective.horizonYears",
      unlocks: "Weighting between growing capital and protecting it over your actual timeframe.",
      severity: "limiting",
    });
  }
  if (profile.objective.maxDrawdownTolerancePercent === null) {
    missing.push({
      field: "objective.maxDrawdownTolerancePercent",
      unlocks: "Whether a recommended position is one you could hold through a fall without selling.",
      severity: "limiting",
    });
  }
  if (!hasHousehold) {
    missing.push({
      field: "household",
      unlocks:
        "Who this capital is for. Dependents change the reserve, the horizon, and what preservation means.",
      severity: "limiting",
    });
  }
  if (profile.household.succession.structure === "unknown") {
    missing.push({
      field: "household.succession",
      unlocks:
        "Whether capital would actually reach your family. Wealth that cannot transfer is not generational, whatever its size.",
      severity: "limiting",
    });
  }
  if (hasAssets && profile.liabilities.length === 0) {
    missing.push({
      field: "liabilities",
      unlocks: "Net rather than gross position. If you genuinely have none, record that.",
      severity: "limiting",
    });
  }

  const blocking = missing.filter((m) => m.severity === "blocking").length;
  const level: GuidanceLevel =
    blocking === 0 ? "personal" : blocking <= 1 ? "directional" : "general";

  // Weighted by how much each input contributes to a personal answer.
  const weights: [boolean, number][] = [
    [hasAssets, 26],
    [hasIncome, 22],
    [hasBaseCurrency, 13],
    [hasHousehold, 12],
    [hasReserve, 9],
    [hasHorizon, 7],
    [profile.household.succession.structure !== "unknown", 6],
    [profile.objective.maxDrawdownTolerancePercent !== null, 5],
    [profile.liabilities.length > 0, 5],
  ];
  const completeness = weights.reduce((sum, [present, w]) => sum + (present ? w : 0), 0);

  return {
    level,
    completeness,
    missing,
    summary:
      level === "personal"
        ? "Grounded in your declared position."
        : level === "directional"
          ? "Partly grounded. Some conclusions are still model-based rather than yours."
          : "NeoOS does not know your position. This is a general view, not advice about your capital.",
  };
}

/* ---------------- measures ---------------- */

/** Totals per currency. Never summed across currencies without a verified rate. */
export type CurrencyTotals = Record<string, number>;

function addTo(totals: CurrencyTotals, currency: string, amount: number): void {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

/**
 * Declared asset value per currency, and what could not be counted.
 *
 * An asset whose value is unknown is listed rather than treated as zero. Zero
 * would quietly shrink the subject's position and make concentration look
 * better than it is.
 */
export function assetTotals(profile: IntakeProfile): {
  totals: CurrencyTotals;
  unvalued: string[];
} {
  const totals: CurrencyTotals = {};
  const unvalued: string[] = [];
  for (const asset of profile.assets) {
    if (asset.value.amount === null) unvalued.push(asset.label);
    else addTo(totals, asset.value.currency, asset.value.amount);
  }
  return { totals, unvalued };
}

export function liabilityTotals(profile: IntakeProfile): {
  totals: CurrencyTotals;
  unvalued: string[];
} {
  const totals: CurrencyTotals = {};
  const unvalued: string[] = [];
  for (const liability of profile.liabilities) {
    if (liability.outstanding.amount === null) unvalued.push(liability.label);
    else addTo(totals, liability.outstanding.currency, liability.outstanding.amount);
  }
  return { totals, unvalued };
}

/**
 * Annualised income, split by whether it survives the subject not working.
 *
 * This is the single most important measure for a generational objective.
 * Earned income stops. Asset income persists and transfers. A subject whose
 * income is 95% salary has a different problem from one at 40%, whatever their
 * net worth.
 *
 * Irregular income is excluded from the annualised figure and reported
 * separately — annualising something the subject called irregular would invent
 * a certainty they explicitly denied.
 */
export interface IncomeBreakdown {
  /** Per currency, income that continues without the subject working. */
  passive: CurrencyTotals;
  /** Per currency, income that stops or degrades. */
  earned: CurrencyTotals;
  /** Per currency, income the subject said degrades partly. Counted separately. */
  partial: CurrencyTotals;
  /** Labels of income sources excluded because they are irregular or unvalued. */
  excluded: string[];
  /**
   * Share of annualised income that survives the subject not working, 0–1.
   * Null when currencies differ, since the ratio would be meaningless, or when
   * there is nothing to measure.
   */
  passiveShare: number | null;
}

export function incomeBreakdown(profile: IntakeProfile): IncomeBreakdown {
  const passive: CurrencyTotals = {};
  const earned: CurrencyTotals = {};
  const partial: CurrencyTotals = {};
  const excluded: string[] = [];

  for (const source of profile.incomeSources) {
    const multiplier = ANNUALISATION[source.frequency];
    if (multiplier === null || source.gross.amount === null) {
      excluded.push(source.label);
      continue;
    }
    const annual = source.gross.amount * multiplier;
    const bucket =
      source.dependsOnSubjectWorking === "no"
        ? passive
        : source.dependsOnSubjectWorking === "yes"
          ? earned
          : partial;
    addTo(bucket, source.gross.currency, annual);
  }

  const currencies = new Set([
    ...Object.keys(passive),
    ...Object.keys(earned),
    ...Object.keys(partial),
  ]);

  // A ratio across currencies would require a rate NeoOS has not verified.
  let passiveShare: number | null = null;
  if (currencies.size === 1) {
    const only = [...currencies][0]!;
    const total = (passive[only] ?? 0) + (earned[only] ?? 0) + (partial[only] ?? 0);
    passiveShare = total > 0 ? (passive[only] ?? 0) / total : null;
  }

  return { passive, earned, partial, excluded, passiveShare };
}

/**
 * Concentration by a chosen dimension, as a share of declared value.
 *
 * Computed per currency for the same reason as everything else here. Returns
 * null shares rather than a false total when values are missing.
 */
export function concentrationBy(
  profile: IntakeProfile,
  dimension: (asset: AssetHolding) => string | null,
): { bucket: string; currency: string; value: number; share: number }[] {
  const byCurrency: Record<string, Record<string, number>> = {};
  for (const asset of profile.assets) {
    if (asset.value.amount === null) continue;
    const bucket = dimension(asset) ?? "Unspecified";
    const currency = asset.value.currency;
    byCurrency[currency] ??= {};
    byCurrency[currency][bucket] = (byCurrency[currency][bucket] ?? 0) + asset.value.amount;
  }

  const rows: { bucket: string; currency: string; value: number; share: number }[] = [];
  for (const [currency, buckets] of Object.entries(byCurrency)) {
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    for (const [bucket, value] of Object.entries(buckets)) {
      rows.push({ bucket, currency, value, share: value / total });
    }
  }
  return rows.sort((a, b) => b.share - a.share);
}

export const byAssetKind = (asset: AssetHolding): string => asset.kind;
export const byJurisdiction = (asset: AssetHolding): string | null => asset.jurisdiction;
export const byCustodian = (asset: AssetHolding): string | null => asset.custodian;

/**
 * Value NeoOS can price itself, versus value resting on the subject's own
 * figure.
 *
 * Not a criticism of the subject's numbers — a private business genuinely has
 * no market price. It tells the reader how much of their net worth is a
 * verifiable quantity and how much is an estimate that ages.
 */
export function priceableSplit(profile: IntakeProfile): {
  priceable: CurrencyTotals;
  subjectStated: CurrencyTotals;
} {
  const priceable: CurrencyTotals = {};
  const subjectStated: CurrencyTotals = {};
  for (const asset of profile.assets) {
    if (asset.value.amount === null) continue;
    const target = ASSET_KIND_PRICEABLE[asset.kind] ? priceable : subjectStated;
    addTo(target, asset.value.currency, asset.value.amount);
  }
  return { priceable, subjectStated };
}

/**
 * Capital available now without forced selling.
 *
 * Reserve is deducted only when the subject has stated both a reserve
 * requirement and their obligations. Otherwise the figure is returned with
 * `reserveApplied: false` and the caller must say so, rather than presenting
 * gross liquidity as deployable.
 */
export function deployableCapital(profile: IntakeProfile): {
  totals: CurrencyTotals;
  reserveApplied: boolean;
  reason: string;
} {
  const totals: CurrencyTotals = {};
  for (const asset of profile.assets) {
    if (asset.value.amount === null) continue;
    if (asset.restricted) continue;
    if (asset.liquidity !== "immediate" && asset.liquidity !== "days") continue;
    addTo(totals, asset.value.currency, asset.value.amount);
  }

  const reserveMonths = profile.objective.reserveMonths;
  if (reserveMonths === null) {
    return {
      totals,
      reserveApplied: false,
      reason: "No reserve requirement declared, so this is liquid capital before any reserve is set aside.",
    };
  }

  const monthlyObligation = profile.liabilities.reduce((sum, liability) => {
    if (liability.paymentAmount === null || liability.paymentFrequency === null) return sum;
    const multiplier = ANNUALISATION[liability.paymentFrequency];
    return multiplier === null ? sum : sum + (liability.paymentAmount * multiplier) / 12;
  }, 0);

  if (monthlyObligation <= 0) {
    return {
      totals,
      reserveApplied: false,
      reason: "No recurring obligations declared, so the reserve requirement cannot be sized.",
    };
  }

  const reserve = monthlyObligation * reserveMonths;
  const base = profile.objective.baseCurrency;
  if (base === null || totals[base] === undefined) {
    return {
      totals,
      reserveApplied: false,
      reason: "Reserve not deducted: liquid capital is not held in the declared base currency.",
    };
  }

  return {
    totals: { ...totals, [base]: Math.max(0, totals[base] - reserve) },
    reserveApplied: true,
    reason: `${reserveMonths} months of obligations held back as reserve.`,
  };
}

/** Asset kinds the subject holds. Used to see what the position is missing. */
export function heldKinds(profile: IntakeProfile): AssetKind[] {
  return [...new Set(profile.assets.map((a) => a.kind))];
}


/* ---------------- the family the capital is for ---------------- */

/**
 * Obligations that outlast the subject's working life.
 *
 * A dependent supported indefinitely turns a horizon into a perpetuity, which
 * is a different problem from funding a finite goal: it cannot be solved by
 * living long enough, only by capital that produces income without being
 * consumed.
 */
export interface HouseholdAssessment {
  dependentCount: number;
  supportedCount: number;
  /** Dependents whose support has no stated end. */
  indefiniteSupport: Dependent[];
  /**
   * The year the last known finite support obligation ends. Null when there are
   * none, or when any support is indefinite — in which case there is no such
   * year, and reporting one would be false comfort.
   */
  lastSupportYear: number | null;
  /** Costs the subject has already named as coming. */
  anticipatedObligations: string[];
  /** Whether capital would actually reach the family. */
  successionInPlace: boolean;
  /** Risks to that, whether structural or stated by the subject. */
  successionConcerns: string[];
}

export function assessHousehold(profile: IntakeProfile): HouseholdAssessment {
  const dependents = profile.household.dependents;
  const supported = dependents.filter((d) => d.financiallySupported);
  const indefinite = supported.filter((d) => d.supportIsIndefinite);

  const finiteYears = supported
    .filter((d) => !d.supportIsIndefinite)
    .map((d) => d.supportExpectedUntilYear)
    .filter((y): y is number => y !== null);

  const structure = profile.household.succession.structure;
  const concerns: string[] = [...profile.household.succession.knownTransferRisks];

  if (structure === "none") {
    concerns.push("No succession structure is in place, so distribution would follow default law.");
  }
  if (structure === "unknown") {
    concerns.push("Succession arrangements have not been recorded, so transfer cannot be assessed.");
  }
  if (profile.household.succession.reviewedRecently === false) {
    concerns.push("The succession structure has not been reviewed recently and may not reflect current intent.");
  }
  if (profile.household.continuityContactExists === false) {
    concerns.push(
      "Nobody else can take over these affairs. A single point of failure in a family's finances is a preservation risk no allocation offsets.",
    );
  }
  // Assets NeoOS cannot price are also usually the hardest to transfer.
  const illiquidShare = profile.assets.filter(
    (a) => a.liquidity === "illiquid" || a.liquidity === "years",
  );
  if (illiquidShare.length > 0 && structure !== "trust" && structure !== "foundation") {
    concerns.push(
      `${illiquidShare.length} holding(s) would be slow or impossible to realise, with no structure holding them.`,
    );
  }

  return {
    dependentCount: dependents.length,
    supportedCount: supported.length,
    indefiniteSupport: indefinite,
    lastSupportYear: indefinite.length > 0 || finiteYears.length === 0 ? null : Math.max(...finiteYears),
    anticipatedObligations: dependents
      .map((d) => d.anticipatedObligation)
      .filter((o): o is string => o !== null && o.length > 0),
    successionInPlace: structure !== "none" && structure !== "unknown",
    successionConcerns: concerns,
  };
}
