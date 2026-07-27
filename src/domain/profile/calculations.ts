import {
  ANNUALISATION,
  assetKindLabels,
  COMMITMENT_PAYS_OUT,
  type AssetKind,
  type IntakeProfile,
} from "@/domain/intake/types";
import {
  calculated,
  derive,
  modelAssumption,
  unknown,
  userAssumption,
  userFact,
  type Attributed,
} from "@/domain/profile/provenance";

/**
 * The calculated profile.
 *
 * Every output carries where it came from. Nothing is defaulted, inferred, or
 * filled with a plausible midpoint: a measure whose inputs are absent returns
 * `missing` and names the fields that would answer it.
 *
 * Two rules run through the whole module.
 *
 * **Cross-currency arithmetic needs a rate the subject supplied**, and anything
 * resting on one is a `user_assumption`, never a calculation. NeoOS has no rate
 * provider and will not invent one.
 *
 * **A gap is never treated as a zero.** A holding with no declared value is
 * excluded and named, because counting it as nothing shrinks the position and
 * makes concentration look better than it is.
 */

export type CurrencyTotals = Record<string, number>;

/* ---------------- currency handling ---------------- */

interface Converted {
  total: number;
  currency: string;
  /** True when more than one currency was involved and a rate was applied. */
  usedRates: boolean;
  /** Currencies present with no rate to base. */
  unrated: string[];
}

/**
 * Fold per-currency totals into the base currency.
 *
 * Returns `unrated` rather than dropping what it cannot convert. Silently
 * omitting a currency would produce a smaller, cleaner, wrong number.
 */
export function toBase(totals: CurrencyTotals, profile: IntakeProfile): Converted | null {
  const base = profile.objective.baseCurrency;
  if (base === null) return null;

  const rates = profile.objective.exchangeRatesToBase;
  let total = 0;
  let usedRates = false;
  const unrated: string[] = [];

  for (const [currency, amount] of Object.entries(totals)) {
    if (currency === base) {
      total += amount;
      continue;
    }
    const rate = rates[currency];
    if (rate === undefined) {
      unrated.push(currency);
      continue;
    }
    total += amount * rate;
    usedRates = true;
  }
  return { total, currency: base, usedRates, unrated };
}

function addTo(totals: CurrencyTotals, currency: string, amount: number): void {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

/** Attach what was excluded without changing the value. */
function withGaps<T>(value: Attributed<T>, gaps: string[]): Attributed<T> {
  return gaps.length === 0 ? value : { ...value, missing: [...new Set([...value.missing, ...gaps])] };
}

/* ---------------- 1. net worth ---------------- */

export function netWorth(profile: IntakeProfile): Attributed<CurrencyTotals> {
  if (profile.assets.length === 0) {
    return unknown<CurrencyTotals>("Assets less liabilities.", ["assets"]);
  }

  const totals: CurrencyTotals = {};
  const excluded: string[] = [];
  for (const asset of profile.assets) {
    if (asset.value.amount === null) excluded.push(`Value of ${asset.label}`);
    else addTo(totals, asset.value.currency, asset.value.amount);
  }
  for (const liability of profile.liabilities) {
    if (liability.outstanding.amount === null) excluded.push(`Balance of ${liability.label}`);
    else addTo(totals, liability.outstanding.currency, -liability.outstanding.amount);
  }

  return withGaps(
    calculated(totals, "Declared assets less declared liabilities, per currency.", [
      "assets",
      "liabilities",
    ]),
    excluded,
  );
}

/* ---------------- 2. liquid net worth ---------------- */

/** Realisable without a forced discount. */
function isLiquid(liquidity: string, restricted: boolean): boolean {
  return !restricted && (liquidity === "immediate" || liquidity === "days");
}

export function liquidNetWorth(profile: IntakeProfile): Attributed<CurrencyTotals> {
  if (profile.assets.length === 0) {
    return unknown<CurrencyTotals>("Assets realisable within days, less near-term debt.", ["assets"]);
  }

  const totals: CurrencyTotals = {};
  const excluded: string[] = [];
  for (const asset of profile.assets) {
    if (asset.value.amount === null) {
      excluded.push(`Value of ${asset.label}`);
      continue;
    }
    if (isLiquid(asset.liquidity, asset.restricted)) {
      addTo(totals, asset.value.currency, asset.value.amount);
    }
  }

  // A liability with no stated maturity is treated as near-term. That is NeoOS
  // choosing the cautious reading, not something the subject said, so the whole
  // measure drops to a model assumption when any such liability exists.
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 1);
  let assumedNearTerm = 0;

  for (const liability of profile.liabilities) {
    if (liability.outstanding.amount === null) {
      excluded.push(`Balance of ${liability.label}`);
      continue;
    }
    const undated = liability.maturityDate === null;
    if (undated) assumedNearTerm++;
    const nearTerm = undated || Date.parse(liability.maturityDate!) <= horizon.getTime();
    if (nearTerm) addTo(totals, liability.outstanding.currency, -liability.outstanding.amount);
  }

  const basis = "Assets realisable within days, less debt maturing within a year.";
  const attributed =
    assumedNearTerm > 0
      ? modelAssumption(
          totals,
          `${basis} ${assumedNearTerm} debt(s) had no maturity date and were counted as near-term, which is the cautious reading rather than one you stated.`,
          ["assets", "liabilities"],
        )
      : calculated(totals, basis, ["assets", "liabilities"]);
  return withGaps(attributed, excluded);
}

/* ---------------- 3. monthly cash flow ---------------- */

export interface CashFlow {
  income: CurrencyTotals;
  debtService: CurrencyTotals;
  householdObligations: CurrencyTotals;
  commitmentPremiums: CurrencyTotals;
  net: CurrencyTotals;
}

function monthlyFrom(amount: number, frequency: keyof typeof ANNUALISATION): number | null {
  const multiplier = ANNUALISATION[frequency];
  return multiplier === null ? null : (amount * multiplier) / 12;
}

export function monthlyCashFlow(profile: IntakeProfile): Attributed<CashFlow> {
  if (profile.incomeSources.length === 0) {
    return unknown<CashFlow>("Income less debt service, household obligations and premiums.", [
      "incomeSources",
    ]);
  }

  const income: CurrencyTotals = {};
  const debtService: CurrencyTotals = {};
  const householdObligations: CurrencyTotals = {};
  const commitmentPremiums: CurrencyTotals = {};
  const excluded: string[] = [];

  for (const source of profile.incomeSources) {
    // Irregular income is not annualised. Turning something the subject called
    // irregular into a monthly figure invents a certainty they explicitly denied.
    if (source.gross.amount === null || source.frequency === "irregular") {
      excluded.push(`${source.label} (${source.frequency === "irregular" ? "irregular" : "no amount"})`);
      continue;
    }
    const monthly = monthlyFrom(source.gross.amount, source.frequency);
    if (monthly !== null) addTo(income, source.gross.currency, monthly);
  }

  for (const liability of profile.liabilities) {
    if (liability.paymentAmount === null || liability.paymentFrequency === null) {
      excluded.push(`Payment on ${liability.label}`);
      continue;
    }
    const monthly = monthlyFrom(liability.paymentAmount, liability.paymentFrequency);
    if (monthly !== null) addTo(debtService, liability.outstanding.currency, monthly);
  }

  const obligations = profile.household.monthlyObligations;
  if (obligations?.amount != null) {
    addTo(householdObligations, obligations.currency, obligations.amount);
  } else {
    excluded.push("Recurring household obligations");
  }

  for (const commitment of profile.commitments) {
    if (commitment.premium?.amount == null || commitment.premiumFrequency === null) continue;
    const monthly = monthlyFrom(commitment.premium.amount, commitment.premiumFrequency);
    if (monthly !== null) addTo(commitmentPremiums, commitment.premium.currency, monthly);
  }

  const net: CurrencyTotals = {};
  for (const bucket of [income]) for (const [c, v] of Object.entries(bucket)) addTo(net, c, v);
  for (const bucket of [debtService, householdObligations, commitmentPremiums]) {
    for (const [c, v] of Object.entries(bucket)) addTo(net, c, -v);
  }

  return withGaps(
    calculated(
      { income, debtService, householdObligations, commitmentPremiums, net },
      "Monthly income less debt service, household obligations and commitment premiums, per currency.",
      ["incomeSources", "liabilities", "household.monthlyObligations", "commitments"],
    ),
    excluded,
  );
}

/* ---------------- 4. reserve coverage ---------------- */

export interface ReserveCoverage {
  /** Months of outflow the liquid position covers. */
  months: number;
  /** Months the subject asked for. */
  required: number;
  monthlyOutflow: number;
  currency: string;
  funded: boolean;
}

export function reserveCoverage(profile: IntakeProfile): Attributed<ReserveCoverage> {
  const basis = "Liquid assets divided by monthly outflow, against the reserve you asked for.";
  const required = profile.objective.reserveMonths;
  const missing: string[] = [];
  if (required === null) missing.push("objective.reserveMonths");
  if (profile.objective.baseCurrency === null) missing.push("objective.baseCurrency");

  const flow = monthlyCashFlow(profile);
  const liquid = liquidNetWorth(profile);
  if (flow.value === null) missing.push(...flow.missing);
  if (liquid.value === null) missing.push(...liquid.missing);
  if (missing.length > 0) return unknown<ReserveCoverage>(basis, [...new Set(missing)]);

  const outflowTotals: CurrencyTotals = {};
  for (const bucket of [
    flow.value!.debtService,
    flow.value!.householdObligations,
    flow.value!.commitmentPremiums,
  ]) {
    for (const [c, v] of Object.entries(bucket)) addTo(outflowTotals, c, v);
  }

  const outflow = toBase(outflowTotals, profile);
  const liquidBase = toBase(liquid.value!, profile);
  if (!outflow || !liquidBase) return unknown<ReserveCoverage>(basis, ["objective.baseCurrency"]);
  if (outflow.unrated.length > 0 || liquidBase.unrated.length > 0) {
    return unknown<ReserveCoverage>(
      basis,
      [...new Set([...outflow.unrated, ...liquidBase.unrated])].map(
        (c) => `objective.exchangeRatesToBase.${c}`,
      ),
    );
  }

  if (outflow.total <= 0) {
    return unknown<ReserveCoverage>(basis, [
      "household.monthlyObligations",
      "liabilities (payment amounts)",
    ]);
  }

  const months = liquidBase.total / outflow.total;
  const result: ReserveCoverage = {
    months,
    required: required!,
    monthlyOutflow: outflow.total,
    currency: outflow.currency,
    funded: months >= required!,
  };

  return derive([liquid, flow, userFact(required, "objective.reserveMonths")], basis, () => result);
}

/* ---------------- 5. investable cash ---------------- */

export interface InvestableCash {
  amount: number;
  currency: string;
  liquid: number;
  reserveHeldBack: number;
  liquidityFloorHeldBack: number;
  nearTermObligationsHeldBack: number;
  /** Obligations within this many years are held back. */
  obligationHorizonYears: number;
  /**
   * Value excluded because it cannot legally leave its jurisdiction, by
   * jurisdiction. Deployable there, and nowhere else.
   */
  immobileByJurisdiction: CurrencyTotals;
}

/**
 * Value that cannot leave the jurisdiction it sits in.
 *
 * Distinct from liquidity, and worse. An illiquid asset can be sold slowly; an
 * asset behind a capital control can be sold instantly and the proceeds still
 * cannot fund anything abroad. Liquidity is about time; mobility is about
 * whether the door exists.
 *
 * Counting the two pools as one overstates what is available to allocate, and
 * overstates it in the direction that produces a confident recommendation to
 * deploy capital that cannot actually be deployed.
 */
function immobileValue(profile: IntakeProfile): { totals: CurrencyTotals; jurisdictions: string[] } {
  const restricted = new Set(
    profile.jurisdictionContext.constraints
      .filter((c) => c.outboundCapitalMobility === "restricted" || c.outboundCapitalMobility === "blocked")
      .map((c) => c.jurisdiction),
  );

  const totals: CurrencyTotals = {};
  const jurisdictions = new Set<string>();
  for (const asset of profile.assets) {
    if (asset.value.amount === null || asset.jurisdiction === null) continue;
    if (!restricted.has(asset.jurisdiction)) continue;
    if (!isLiquid(asset.liquidity, asset.restricted)) continue;
    addTo(totals, asset.value.currency, asset.value.amount);
    jurisdictions.add(asset.jurisdiction);
  }
  return { totals, jurisdictions: [...jurisdictions].sort() };
}

/** Committed costs inside this window are not deployable capital. */
export const NEAR_TERM_OBLIGATION_YEARS = 3;

export function investableCash(profile: IntakeProfile): Attributed<InvestableCash> {
  const basis =
    "Liquid assets, less the reserve you asked for, your liquidity floor, and committed obligations falling due soon.";
  const liquid = liquidNetWorth(profile);
  if (liquid.value === null) return unknown<InvestableCash>(basis, liquid.missing);

  const liquidBase = toBase(liquid.value, profile);
  if (!liquidBase) return unknown<InvestableCash>(basis, ["objective.baseCurrency"]);
  if (liquidBase.unrated.length > 0) {
    return unknown<InvestableCash>(
      basis,
      liquidBase.unrated.map((c) => `objective.exchangeRatesToBase.${c}`),
    );
  }

  const coverage = reserveCoverage(profile);
  const reserveHeldBack =
    coverage.value === null ? 0 : coverage.value.monthlyOutflow * coverage.value.required;

  const floor = profile.objective.minimumLiquidHolding;
  const liquidityFloorHeldBack =
    floor?.amount != null && floor.currency === liquidBase.currency ? floor.amount : 0;

  const horizonYear = new Date().getFullYear() + NEAR_TERM_OBLIGATION_YEARS;
  let nearTermObligationsHeldBack = 0;
  const gaps: string[] = [];
  for (const obligation of profile.futureObligations) {
    if (obligation.certainty !== "committed") continue;
    if (obligation.dueYear === null || obligation.dueYear > horizonYear) continue;
    if (obligation.amount?.amount == null) {
      gaps.push(`Amount of ${obligation.label}`);
      continue;
    }
    if (obligation.fundedByAssetId !== null) continue;
    const converted = toBase({ [obligation.amount.currency]: obligation.amount.amount }, profile);
    if (converted && converted.unrated.length === 0) nearTermObligationsHeldBack += converted.total;
    else gaps.push(`Rate for ${obligation.amount.currency}`);
  }

  // Capital that cannot leave its jurisdiction is removed before anything else.
  // It is not a smaller amount of the same thing — it is a different pool, and
  // it can only be deployed where it already sits.
  const immobile = immobileValue(profile);
  const immobileBase = toBase(immobile.totals, profile);
  const immobileTotal =
    immobileBase && immobileBase.unrated.length === 0 ? immobileBase.total : 0;
  if (immobileBase && immobileBase.unrated.length > 0) {
    gaps.push(...immobileBase.unrated.map((c) => `Rate for ${c}, to size immobile capital`));
  }

  const amount = Math.max(
    0,
    liquidBase.total -
      immobileTotal -
      reserveHeldBack -
      liquidityFloorHeldBack -
      nearTermObligationsHeldBack,
  );

  const result: InvestableCash = {
    amount,
    currency: liquidBase.currency,
    liquid: liquidBase.total,
    reserveHeldBack,
    liquidityFloorHeldBack,
    nearTermObligationsHeldBack,
    obligationHorizonYears: NEAR_TERM_OBLIGATION_YEARS,
    immobileByJurisdiction: immobile.totals,
  };

  // Reserve unresolved means nothing was held back for it. That is a materially
  // more optimistic figure than the subject would get with a reserve declared,
  // so it must not be presented as a plain calculation.
  const parts: Attributed<unknown>[] = [liquid];
  if (coverage.value === null) {
    parts.push(
      modelAssumption(0, "No reserve was deducted, because the reserve requirement is not yet known."),
    );
  } else {
    parts.push(coverage);
  }
  return withGaps(derive(parts, basis, () => result), gaps);
}

/* ---------------- 6. debt burden ---------------- */

export interface DebtBurden {
  totalDebt: CurrencyTotals;
  /** Monthly debt service as a share of monthly income, 0–1. */
  serviceRatio: number | null;
  /** Debt as a share of assets, 0–1. */
  debtToAssets: number | null;
  /** Balance-weighted interest rate, percent. */
  weightedRatePercent: number | null;
  currency: string | null;
}

export function debtBurden(profile: IntakeProfile): Attributed<DebtBurden> {
  const basis = "Total debt, what it costs to service, and what it costs to carry.";
  if (profile.liabilities.length === 0) {
    return calculated(
      {
        totalDebt: {},
        serviceRatio: 0,
        debtToAssets: 0,
        weightedRatePercent: null,
        currency: profile.objective.baseCurrency,
      },
      "No debt declared.",
      ["liabilities"],
    );
  }

  const totalDebt: CurrencyTotals = {};
  const gaps: string[] = [];
  let ratedBalance = 0;
  let rateWeighted = 0;

  for (const liability of profile.liabilities) {
    if (liability.outstanding.amount === null) {
      gaps.push(`Balance of ${liability.label}`);
      continue;
    }
    addTo(totalDebt, liability.outstanding.currency, liability.outstanding.amount);
    if (liability.interestRatePercent === null) {
      gaps.push(`Interest rate on ${liability.label}`);
    } else {
      ratedBalance += liability.outstanding.amount;
      rateWeighted += liability.outstanding.amount * liability.interestRatePercent;
    }
  }

  const flow = monthlyCashFlow(profile);
  const assets = netWorth(profile);
  const debtBase = toBase(totalDebt, profile);

  // A debt whose payment amount is unknown contributes nothing to debtService.
  // Dividing that incomplete total by income yields a number that looks like a
  // measurement and is not one — and a low service ratio is precisely the figure
  // that would justify deploying capital. The ratio is withheld instead.
  const unpricedPayments = profile.liabilities.filter((l) => l.paymentAmount === null);
  for (const liability of unpricedPayments) gaps.push(`Payment on ${liability.label}`);

  let serviceRatio: number | null = null;
  if (flow.value !== null && unpricedPayments.length === 0) {
    const income = toBase(flow.value.income, profile);
    const service = toBase(flow.value.debtService, profile);
    if (income && service && income.unrated.length === 0 && service.unrated.length === 0 && income.total > 0) {
      serviceRatio = service.total / income.total;
    }
  }

  let debtToAssets: number | null = null;
  if (assets.value !== null && debtBase && debtBase.unrated.length === 0) {
    const grossAssets: CurrencyTotals = {};
    for (const asset of profile.assets) {
      if (asset.value.amount !== null) addTo(grossAssets, asset.value.currency, asset.value.amount);
    }
    const assetBase = toBase(grossAssets, profile);
    if (assetBase && assetBase.unrated.length === 0 && assetBase.total > 0) {
      debtToAssets = debtBase.total / assetBase.total;
    }
  }

  const result: DebtBurden = {
    totalDebt,
    serviceRatio,
    debtToAssets,
    weightedRatePercent: ratedBalance > 0 ? rateWeighted / ratedBalance : null,
    currency: debtBase?.currency ?? null,
  };

  const usedRates = (debtBase?.usedRates ?? false) || serviceRatio !== null;
  const attributed = usedRates && (debtBase?.usedRates ?? false)
    ? userAssumption(result, `${basis} Converted at the rates you supplied.`, ["liabilities"])
    : calculated(result, basis, ["liabilities", "incomeSources", "assets"]);
  return withGaps(attributed, gaps);
}

/* ---------------- 7. portfolio allocation ---------------- */

export interface AllocationRow {
  bucket: string;
  label: string;
  value: number;
  share: number;
}

export function portfolioAllocation(profile: IntakeProfile): Attributed<AllocationRow[]> {
  const basis = "Share of declared value by asset kind, in your base currency.";
  const valued = profile.assets.filter((a) => a.value.amount !== null);
  if (valued.length === 0) return unknown<AllocationRow[]>(basis, ["assets"]);

  const byKind: Record<string, CurrencyTotals> = {};
  for (const asset of valued) {
    (byKind[asset.kind] ??= {});
    addTo(byKind[asset.kind]!, asset.value.currency, asset.value.amount!);
  }

  const rows: AllocationRow[] = [];
  let total = 0;
  let usedRates = false;
  const unrated = new Set<string>();

  for (const [kind, totals] of Object.entries(byKind)) {
    const converted = toBase(totals, profile);
    if (!converted) return unknown<AllocationRow[]>(basis, ["objective.baseCurrency"]);
    converted.unrated.forEach((c) => unrated.add(c));
    usedRates ||= converted.usedRates;
    rows.push({
      bucket: kind,
      label: assetKindLabels[kind as AssetKind] ?? kind,
      value: converted.total,
      share: 0,
    });
    total += converted.total;
  }

  if (unrated.size > 0) {
    return unknown<AllocationRow[]>(
      basis,
      [...unrated].map((c) => `objective.exchangeRatesToBase.${c}`),
    );
  }
  if (total <= 0) return unknown<AllocationRow[]>(basis, ["assets"]);

  for (const row of rows) row.share = row.value / total;
  rows.sort((a, b) => b.share - a.share);

  const gaps = profile.assets.filter((a) => a.value.amount === null).map((a) => `Value of ${a.label}`);
  return withGaps(
    usedRates
      ? userAssumption(rows, `${basis} Converted at the rates you supplied.`, ["assets"])
      : calculated(rows, basis, ["assets"]),
    gaps,
  );
}

/* ---------------- 8. concentration risk ---------------- */

export interface ConcentrationBreach {
  dimension: "asset_kind" | "single_asset" | "currency" | "jurisdiction";
  bucket: string;
  share: number;
  limit: number;
  overBy: number;
}

export interface ConcentrationRisk {
  breaches: ConcentrationBreach[];
  /** Limits the subject has not set, so nothing can be checked against them. */
  limitsNotSet: string[];
  largest: { dimension: string; bucket: string; share: number } | null;
}

export function concentrationRisk(profile: IntakeProfile): Attributed<ConcentrationRisk> {
  const basis = "Your position measured against the concentration limits you set.";
  const objective = profile.objective;

  const limitsNotSet: string[] = [];
  if (objective.maxAssetKindPercent === null) limitsNotSet.push("objective.maxAssetKindPercent");
  if (objective.maxSingleAssetPercent === null) limitsNotSet.push("objective.maxSingleAssetPercent");
  if (objective.maxCurrencyPercent === null) limitsNotSet.push("objective.maxCurrencyPercent");
  if (objective.maxJurisdictionPercent === null) limitsNotSet.push("objective.maxJurisdictionPercent");

  const allocation = portfolioAllocation(profile);
  if (allocation.value === null) return unknown<ConcentrationRisk>(basis, allocation.missing);

  const breaches: ConcentrationBreach[] = [];
  let largest: ConcentrationRisk["largest"] = null;

  const consider = (
    dimension: ConcentrationBreach["dimension"],
    bucket: string,
    share: number,
    limitPercent: number | null,
  ) => {
    if (largest === null || share > largest.share) largest = { dimension, bucket, share };
    if (limitPercent === null) return;
    const limit = limitPercent / 100;
    if (share > limit) {
      breaches.push({ dimension, bucket, share, limit, overBy: share - limit });
    }
  };

  for (const row of allocation.value) {
    consider("asset_kind", row.label, row.share, objective.maxAssetKindPercent);
  }

  const total = allocation.value.reduce((sum, row) => sum + row.value, 0);
  for (const [dimension, key] of [
    ["single_asset", "asset"],
    ["currency", "currency"],
    ["jurisdiction", "jurisdiction"],
  ] as const) {
    const buckets: Record<string, number> = {};
    for (const asset of profile.assets) {
      if (asset.value.amount === null) continue;
      const converted = toBase({ [asset.value.currency]: asset.value.amount }, profile);
      if (!converted || converted.unrated.length > 0) continue;
      const bucket =
        key === "asset" ? asset.label : key === "currency" ? asset.value.currency : (asset.jurisdiction ?? "Unspecified");
      buckets[bucket] = (buckets[bucket] ?? 0) + converted.total;
    }
    const limit =
      dimension === "single_asset"
        ? objective.maxSingleAssetPercent
        : dimension === "currency"
          ? objective.maxCurrencyPercent
          : objective.maxJurisdictionPercent;
    for (const [bucket, value] of Object.entries(buckets)) {
      if (total > 0) consider(dimension, bucket, value / total, limit);
    }
  }

  breaches.sort((a, b) => b.overBy - a.overBy);
  const result: ConcentrationRisk = { breaches, limitsNotSet, largest };

  // Deliberately not `missing` when limits are unset: the concentration itself
  // is measured and worth showing. What is missing is the subject's view of what
  // would be too much, which is a different absence and is named as one.
  return withGaps(derive([allocation], basis, () => result), limitsNotSet);
}

/* ---------------- 9. currency exposure ---------------- */

export interface ExposureRow {
  currency: string;
  value: number;
  share: number;
  isBase: boolean;
}

export function currencyExposure(profile: IntakeProfile): Attributed<ExposureRow[]> {
  const basis = "Share of declared value by currency.";
  const valued = profile.assets.filter((a) => a.value.amount !== null);
  if (valued.length === 0) return unknown<ExposureRow[]>(basis, ["assets"]);

  const base = profile.objective.baseCurrency;
  if (base === null) return unknown<ExposureRow[]>(basis, ["objective.baseCurrency"]);

  const byCurrency: CurrencyTotals = {};
  for (const asset of valued) addTo(byCurrency, asset.value.currency, asset.value.amount!);

  const converted = toBase(byCurrency, profile);
  if (!converted) return unknown<ExposureRow[]>(basis, ["objective.baseCurrency"]);
  if (converted.unrated.length > 0) {
    // A share is a share of one total, so this is the measure that genuinely
    // cannot be produced without conversion. It is reported missing rather than
    // computed over the subset that happens to be convertible.
    return unknown<ExposureRow[]>(
      basis,
      converted.unrated.map((c) => `objective.exchangeRatesToBase.${c}`),
    );
  }

  const rates = profile.objective.exchangeRatesToBase;
  const rows: ExposureRow[] = Object.entries(byCurrency)
    .map(([currency, amount]) => {
      const inBase = currency === base ? amount : amount * (rates[currency] ?? 1);
      return { currency, value: inBase, share: converted.total > 0 ? inBase / converted.total : 0, isBase: currency === base };
    })
    .sort((a, b) => b.share - a.share);

  const gaps = profile.assets.filter((a) => a.value.amount === null).map((a) => `Value of ${a.label}`);
  return withGaps(
    converted.usedRates
      ? userAssumption(rows, `${basis} Converted at the rates you supplied.`, ["assets"])
      : calculated(rows, basis, ["assets"]),
    gaps,
  );
}

/* ---------------- 10. deployment status ---------------- */

export const deploymentStatuses = [
  "unknown",
  "reserve_first",
  "obligations_first",
  "limited",
  "ready",
] as const;
export type DeploymentStatusKind = (typeof deploymentStatuses)[number];

export interface DeploymentStatus {
  status: DeploymentStatusKind;
  headline: string;
  /** Why, in order. The first is the binding constraint. */
  reasons: string[];
  investable: number | null;
  currency: string | null;
}

/**
 * Whether capital should be deployed at all, before any question of into what.
 *
 * Capital posture precedes asset selection. An unfunded reserve outranks every
 * opportunity in the market, because the cost of being wrong about it is forced
 * selling at the worst moment rather than a lower return.
 */
export function deploymentStatus(profile: IntakeProfile): Attributed<DeploymentStatus> {
  const basis = "Whether capital should be deployed today, before any question of into what.";
  const investable = investableCash(profile);
  const coverage = reserveCoverage(profile);
  const concentration = concentrationRisk(profile);

  if (investable.value === null) {
    return unknown<DeploymentStatus>(basis, investable.missing);
  }

  const reasons: string[] = [];
  let status: DeploymentStatusKind = "ready";

  if (coverage.value === null) {
    status = "unknown";
    reasons.push("Reserve coverage cannot be assessed yet, so deployable capital is overstated.");
  } else if (!coverage.value.funded) {
    status = "reserve_first";
    reasons.push(
      `Reserve is ${coverage.value.months.toFixed(1)} months against the ${coverage.value.required} you asked for. Funding it comes before deploying.`,
    );
  }

  const immobileTotal = Object.values(investable.value.immobileByJurisdiction).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (immobileTotal > 0) {
    // Named whatever the status, because it changes what "deployable" means
    // rather than merely reducing it. Two pools, not one smaller pool.
    reasons.push(
      `Capital in ${Object.keys(investable.value.immobileByJurisdiction).join(", ")} cannot leave its jurisdiction and is not part of what can be allocated globally. It can still be deployed where it sits.`,
    );
  }

  if (investable.value.nearTermObligationsHeldBack > 0 && status === "ready") {
    reasons.push(
      `${Math.round(investable.value.nearTermObligationsHeldBack).toLocaleString()} ${investable.value.currency} is held back for committed obligations within ${investable.value.obligationHorizonYears} years.`,
    );
  }

  if (investable.value.amount <= 0 && status === "ready") {
    status = "obligations_first";
    reasons.push("Nothing is deployable once the reserve, your liquidity floor and committed obligations are set aside.");
  }

  if (concentration.value !== null && concentration.value.breaches.length > 0 && status === "ready") {
    status = "limited";
    const worst = concentration.value.breaches[0]!;
    reasons.push(
      `${worst.bucket} is ${Math.round(worst.share * 100)}% against your ${Math.round(worst.limit * 100)}% limit. New capital should not go there.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      `Reserve is funded and ${Math.round(investable.value.amount).toLocaleString()} ${investable.value.currency} is deployable within your limits.`,
    );
  }

  const headline: Record<DeploymentStatusKind, string> = {
    unknown: "Not enough is known to say",
    reserve_first: "Fund the reserve first",
    obligations_first: "Committed obligations come first",
    limited: "Deployable, but not everywhere",
    ready: "Deployable",
  };

  const result: DeploymentStatus = {
    status,
    headline: headline[status],
    reasons,
    investable: investable.value.amount,
    currency: investable.value.currency,
  };

  return derive([investable], basis, () => result);
}

/* ---------------- risk capacity: stated and calculated ---------------- */

export interface RiskCapacity {
  calculated: "low" | "moderate" | "high";
  stated: "low" | "moderate" | "high" | null;
  /** True when the subject believes they can take more risk than the structure supports. */
  disagreement: boolean;
  factors: string[];
}

/**
 * Capacity is structural: whether a fall can be survived. Tolerance is
 * psychological: whether it can be sat through. People routinely have more of
 * one than the other, and the gap is where forced selling comes from, so both
 * are carried and the disagreement is reported rather than reconciled.
 */
export function riskCapacity(profile: IntakeProfile): Attributed<RiskCapacity> {
  const basis = "Capacity to take risk, from reserve coverage, income durability, horizon and dependents.";
  const coverage = reserveCoverage(profile);
  if (coverage.value === null) return unknown<RiskCapacity>(basis, coverage.missing);

  const factors: string[] = [];
  let score = 0;

  if (coverage.value.funded) {
    score += 2;
    factors.push(`Reserve funded at ${coverage.value.months.toFixed(1)} months.`);
  } else {
    factors.push(`Reserve short at ${coverage.value.months.toFixed(1)} of ${coverage.value.required} months.`);
  }

  const horizon = profile.objective.horizonYears;
  if (horizon !== null && horizon >= 15) {
    score += 2;
    factors.push(`${horizon}-year horizon allows a fall to be waited out.`);
  } else if (horizon !== null && horizon >= 7) {
    score += 1;
    factors.push(`${horizon}-year horizon gives some room.`);
  } else if (horizon !== null) {
    factors.push(`${horizon}-year horizon is short for equity risk.`);
  }

  const supported = profile.household.dependents.filter((d) => d.financiallySupported).length;
  if (supported === 0) score += 1;
  else factors.push(`${supported} dependent(s) rely on this capital.`);

  const payingPolicies = profile.commitments.filter((c) => COMMITMENT_PAYS_OUT[c.kind]);
  const protection = payingPolicies.filter((c) => c.coverAmount?.amount != null).length;
  if (protection > 0) {
    score += 1;
    factors.push(`${protection} policy/policies pay out if things go wrong.`);
  } else if (payingPolicies.length > 0) {
    // The policy cannot be counted as protection without a figure, so the score
    // is unchanged. But saying none is recorded would contradict what the subject
    // just declared, and a system caught misstating the subject's own data loses
    // the standing to be believed about anything harder.
    factors.push(
      `${payingPolicies.length} policy/policies recorded with no cover amount, so the protection cannot be counted.`,
    );
  } else {
    factors.push("No insurance cover recorded, so a shock lands directly on the portfolio.");
  }

  const calculatedLevel = score >= 5 ? "high" : score >= 3 ? "moderate" : "low";
  const stated = profile.objective.statedRiskCapacity;
  const rank = { low: 0, moderate: 1, high: 2 } as const;

  return derive([coverage], basis, () => ({
    calculated: calculatedLevel,
    stated,
    disagreement: stated !== null && rank[stated] > rank[calculatedLevel],
    factors,
  }));
}

/* ---------------- the whole set ---------------- */

export interface ProfileCalculations {
  netWorth: Attributed<CurrencyTotals>;
  liquidNetWorth: Attributed<CurrencyTotals>;
  monthlyCashFlow: Attributed<CashFlow>;
  reserveCoverage: Attributed<ReserveCoverage>;
  investableCash: Attributed<InvestableCash>;
  debtBurden: Attributed<DebtBurden>;
  portfolioAllocation: Attributed<AllocationRow[]>;
  concentrationRisk: Attributed<ConcentrationRisk>;
  currencyExposure: Attributed<ExposureRow[]>;
  deploymentStatus: Attributed<DeploymentStatus>;
  riskCapacity: Attributed<RiskCapacity>;
}

export function calculateProfile(profile: IntakeProfile): ProfileCalculations {
  return {
    netWorth: netWorth(profile),
    liquidNetWorth: liquidNetWorth(profile),
    monthlyCashFlow: monthlyCashFlow(profile),
    reserveCoverage: reserveCoverage(profile),
    investableCash: investableCash(profile),
    debtBurden: debtBurden(profile),
    portfolioAllocation: portfolioAllocation(profile),
    concentrationRisk: concentrationRisk(profile),
    currencyExposure: currencyExposure(profile),
    deploymentStatus: deploymentStatus(profile),
    riskCapacity: riskCapacity(profile),
  };
}
