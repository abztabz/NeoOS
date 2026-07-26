import { z } from "zod";

/**
 * The subject's financial position.
 *
 * This is the input that makes every downstream number personal. Without it
 * NeoOS produces general commentary and must say so — see
 * docs/PRODUCT_DEFINITION.md §5.
 *
 * Two modelling decisions shape everything here.
 *
 * **Income and assets are separate, and linked.** Rent comes from property;
 * interest comes from cash or bonds; salary comes from the subject working.
 * Collapsing them loses the single most important fact for generational wealth:
 * how much income survives the subject not working. Earned income stops. Asset
 * income persists and transfers.
 *
 * **Every figure is evidence, not fact.** A property value the subject typed is
 * a claim with a source, a date, and a confidence — exactly as a filing is. It
 * ages, it can be stale, and it says how it was arrived at. Applying the same
 * discipline to personal data as to market data is what stops a five-year-old
 * appraisal being treated as today's net worth.
 */

/* ---------------- subject scoping ---------------- */

/**
 * Every record carries a subject. There is exactly one today; clients come
 * later. Building single-subject and retrofitting is the migration this
 * decision exists to avoid.
 */
export const subjectIdSchema = z.string().min(1).max(64);
export type SubjectId = z.infer<typeof subjectIdSchema>;

export const currencySchema = z.string().length(3).toUpperCase();

/**
 * Where the asset or income legally sits. Not cosmetic: jurisdiction
 * concentration is one of the preservation measures, and for a UAE-based
 * subject it is a live question rather than a footnote.
 */
export const jurisdictionSchema = z.string().min(2).max(56);

/* ---------------- how a figure is known ---------------- */

/**
 * How a value was arrived at. Ordered strongest first.
 *
 * A market price and a number someone remembers are both "the value" in casual
 * use, and treating them the same is how a portfolio drifts from reality
 * without anyone noticing.
 */
export const valuationBases = [
  "market_price",
  "recent_transaction",
  "professional_appraisal",
  "statement_balance",
  "book_value",
  "subject_estimate",
] as const;
export type ValuationBasis = (typeof valuationBases)[number];

export const valuationBasisLabels: Record<ValuationBasis, string> = {
  market_price: "Market price",
  recent_transaction: "Recent transaction",
  professional_appraisal: "Professional appraisal",
  statement_balance: "Statement balance",
  book_value: "Book value",
  subject_estimate: "Your estimate",
};

/** Confidence NeoOS assigns a figure by how it was established. */
export const VALUATION_BASIS_CONFIDENCE: Record<ValuationBasis, number> = {
  market_price: 95,
  recent_transaction: 88,
  professional_appraisal: 82,
  statement_balance: 90,
  book_value: 70,
  subject_estimate: 55,
};

/** How long a figure established this way stays usable, in days. */
export const VALUATION_BASIS_HORIZON_DAYS: Record<ValuationBasis, number> = {
  market_price: 7,
  recent_transaction: 365,
  professional_appraisal: 365,
  statement_balance: 90,
  book_value: 365,
  subject_estimate: 180,
};

/**
 * A stated amount, with how and when it was established.
 *
 * `amount` is nullable on purpose. "I hold this but do not know its current
 * value" is a real and common position, and it is very different from zero.
 */
export const statedAmountSchema = z.object({
  amount: z.number().nonnegative().nullable(),
  currency: currencySchema,
  basis: z.enum(valuationBases),
  /** When this figure was true, not when it was typed in. */
  asOf: z.iso.date(),
  note: z.string().max(500).nullable(),
});
export type StatedAmount = z.infer<typeof statedAmountSchema>;

/* ---------------- income ---------------- */

/**
 * Income kinds.
 *
 * `dependsOnSubjectWorking` is the field that matters most for a generational
 * objective: it separates income that stops when the subject stops from income
 * the capital itself produces.
 */
export const incomeKinds = [
  "salary",
  "business_revenue",
  "rent",
  "interest",
  "dividend",
  "royalty",
  "pension",
  "other",
] as const;
export type IncomeKind = (typeof incomeKinds)[number];

export const incomeKindLabels: Record<IncomeKind, string> = {
  salary: "Salary",
  business_revenue: "Business revenue",
  rent: "Rent",
  interest: "Interest",
  dividend: "Dividends",
  royalty: "Royalties",
  pension: "Pension",
  other: "Other income",
};

/**
 * Whether the income continues if the subject stops working.
 *
 * Business revenue is deliberately `partly`: an owner-operated business usually
 * degrades without its owner, while a managed one does not. The subject states
 * which, rather than NeoOS assuming.
 */
export const INCOME_DEPENDS_ON_WORKING: Record<IncomeKind, "yes" | "no" | "partly"> = {
  salary: "yes",
  business_revenue: "partly",
  rent: "no",
  interest: "no",
  dividend: "no",
  royalty: "no",
  pension: "no",
  other: "partly",
};

export const incomeFrequencies = ["monthly", "quarterly", "annual", "irregular"] as const;
export type IncomeFrequency = (typeof incomeFrequencies)[number];

/** Multiplier to an annual figure. Irregular income is not annualised. */
export const ANNUALISATION: Record<IncomeFrequency, number | null> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
  irregular: null,
};

/** How reliably the income is expected to continue. Stated, never inferred. */
export const incomeStability = ["contracted", "stable", "variable", "at_risk", "ending"] as const;
export type IncomeStability = (typeof incomeStability)[number];

export const incomeSourceSchema = z.object({
  incomeId: z.string().min(1).max(64),
  subjectId: subjectIdSchema,
  kind: z.enum(incomeKinds),
  /** The subject's own name for it — "Dubai flat", "consulting retainer". */
  label: z.string().min(1).max(120),
  gross: statedAmountSchema,
  frequency: z.enum(incomeFrequencies),
  stability: z.enum(incomeStability),
  /**
   * Set when this income is produced by an asset the subject holds. Rent
   * belongs to a property; interest belongs to a deposit. Linking them lets
   * NeoOS reason about yield and about what happens if the asset is sold.
   */
  producedByAssetId: z.string().max(64).nullable(),
  /**
   * Whether it continues if the subject stops working. Defaults from the kind
   * but the subject may override — only they know if the business runs itself.
   */
  dependsOnSubjectWorking: z.enum(["yes", "no", "partly"]),
  jurisdiction: jurisdictionSchema.nullable(),
  /** Expected end, where one is known. A contract ending is a planning fact. */
  expectedUntil: z.iso.date().nullable(),
  notes: z.string().max(1000).nullable(),
});
export type IncomeSource = z.infer<typeof incomeSourceSchema>;

/* ---------------- assets ---------------- */

/**
 * Asset kinds.
 *
 * Broader than the six-asset test registry on purpose. Over a generational
 * horizon the split between these categories swamps the choice of instrument
 * inside any one of them — see docs/PRODUCT_DEFINITION.md §3.
 */
export const assetKinds = [
  "cash",
  "fixed_income",
  "listed_equity",
  "fund",
  "private_business",
  "real_estate",
  "metals",
  "crypto",
  "collectible",
  "other",
] as const;
export type AssetKind = (typeof assetKinds)[number];

export const assetKindLabels: Record<AssetKind, string> = {
  cash: "Cash and deposits",
  fixed_income: "Bonds and fixed income",
  listed_equity: "Listed shares",
  fund: "Funds and ETFs",
  private_business: "Private or operating business",
  real_estate: "Real estate",
  metals: "Precious metals",
  crypto: "Digital assets",
  collectible: "Collectibles",
  other: "Other assets",
};

/**
 * How quickly the asset converts to cash without a forced discount.
 *
 * A preservation measure, not a convenience one: an illiquid position is fine
 * until it has to be sold in the month it is worth least.
 */
export const liquidityTiers = ["immediate", "days", "weeks", "months", "years", "illiquid"] as const;
export type LiquidityTier = (typeof liquidityTiers)[number];

export const liquidityTierLabels: Record<LiquidityTier, string> = {
  immediate: "Immediate",
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  years: "Years",
  illiquid: "Not realistically sellable",
};

/** Default liquidity by kind. The subject may override; a flat may be quick or slow. */
export const DEFAULT_LIQUIDITY: Record<AssetKind, LiquidityTier> = {
  cash: "immediate",
  fixed_income: "days",
  listed_equity: "days",
  fund: "days",
  private_business: "years",
  real_estate: "months",
  metals: "days",
  crypto: "immediate",
  collectible: "months",
  other: "months",
};

/**
 * Whether NeoOS can price the asset itself.
 *
 * An asset it cannot price is not excluded — it is carried with the subject's
 * own figure and reported as `unsupported` for market valuation, so it still
 * counts toward concentration and net worth. Dropping it would make the
 * remaining assets look like the whole picture.
 */
export const ASSET_KIND_PRICEABLE: Record<AssetKind, boolean> = {
  cash: true,
  fixed_income: true,
  listed_equity: true,
  fund: true,
  private_business: false,
  real_estate: false,
  metals: true,
  crypto: true,
  collectible: false,
  other: false,
};

export const assetHoldingSchema = z.object({
  assetHoldingId: z.string().min(1).max(64),
  subjectId: subjectIdSchema,
  kind: z.enum(assetKinds),
  label: z.string().min(1).max(120),
  value: statedAmountSchema,
  /** Canonical asset in the registry, when NeoOS recognises the instrument. */
  registryAssetId: z.string().max(64).nullable(),
  /** Ticker, ISIN, address, or whatever identifies it. Never guessed. */
  identifier: z.string().max(120).nullable(),
  quantity: z.number().positive().nullable(),
  liquidity: z.enum(liquidityTiers),
  jurisdiction: jurisdictionSchema.nullable(),
  /** Who stands between the subject and the asset — bank, broker, vault, none. */
  custodian: z.string().max(120).nullable(),
  /** Debt secured against this asset. A mortgaged flat is not an unencumbered one. */
  encumberedBy: z.string().max(64).nullable(),
  /** True where the subject cannot sell — vesting, lock-up, legal restriction. */
  restricted: z.boolean(),
  notes: z.string().max(1000).nullable(),
});
export type AssetHolding = z.infer<typeof assetHoldingSchema>;

/* ---------------- liabilities ---------------- */

export const liabilityKinds = [
  "mortgage",
  "business_loan",
  "personal_loan",
  "credit_facility",
  "tax_due",
  "other",
] as const;
export type LiabilityKind = (typeof liabilityKinds)[number];

export const liabilitySchema = z.object({
  liabilityId: z.string().min(1).max(64),
  subjectId: subjectIdSchema,
  kind: z.enum(liabilityKinds),
  label: z.string().min(1).max(120),
  outstanding: statedAmountSchema,
  /** Periodic payment. Feeds the obligation side of deployable surplus. */
  paymentAmount: z.number().nonnegative().nullable(),
  paymentFrequency: z.enum(incomeFrequencies).nullable(),
  interestRatePercent: z.number().nullable(),
  /** Asset this debt is secured against, where it is secured. */
  securedAgainstAssetId: z.string().max(64).nullable(),
  maturityDate: z.iso.date().nullable(),
  notes: z.string().max(1000).nullable(),
});
export type Liability = z.infer<typeof liabilitySchema>;

/* ---------------- household ---------------- */

/**
 * Who the capital is actually for.
 *
 * A generational objective is not about the subject. It is about the people who
 * depend on them now and the people who inherit later, and neither is knowable
 * from a balance sheet. Dependents change the reserve requirement, the horizon,
 * the tolerable drawdown, and what "preservation" even means.
 *
 * In this region in particular, support commonly flows to parents and siblings
 * as well as downward, so the model does not assume dependents are children.
 */
export const dependentRelationships = [
  "child",
  "spouse",
  "parent",
  "sibling",
  "extended_family",
  "other",
] as const;
export type DependentRelationship = (typeof dependentRelationships)[number];

export const dependentSchema = z.object({
  dependentId: z.string().min(1).max(64),
  relationship: z.enum(dependentRelationships),
  /** The subject's own label. Never required to be a real name. */
  label: z.string().min(1).max(120),
  /** Year of birth, where relevant to horizon. Null when not applicable. */
  birthYear: z.number().int().min(1900).max(2200).nullable(),
  /**
   * Whether the subject currently supports them financially, and until when.
   * A child at university and an adult sibling are different obligations.
   */
  financiallySupported: z.boolean(),
  supportExpectedUntilYear: z.number().int().min(1900).max(2200).nullable(),
  /**
   * Support that does not end — a disability, a lifelong commitment. It changes
   * the objective from a horizon to a perpetuity, which is a different problem.
   */
  supportIsIndefinite: z.boolean(),
  /** Known future cost the subject is planning for: education, care, a home. */
  anticipatedObligation: z.string().max(300).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type Dependent = z.infer<typeof dependentSchema>;

/**
 * How capital passes on.
 *
 * Wealth that cannot transfer is not generational, whatever its size. An estate
 * that is large and unstructured can lose a great deal of itself in the passing,
 * and that risk is invisible to any measure of return.
 */
export const successionStructures = [
  "none",
  "will",
  "trust",
  "foundation",
  "company",
  "mixed",
  "unknown",
] as const;
export type SuccessionStructure = (typeof successionStructures)[number];

export const successionStructureLabels: Record<SuccessionStructure, string> = {
  none: "Nothing in place",
  will: "Will",
  trust: "Trust",
  foundation: "Foundation",
  company: "Holding company",
  mixed: "More than one structure",
  unknown: "Not established",
};

export const householdSchema = z.object({
  dependents: z.array(dependentSchema),
  /**
   * Recurring household cost, separate from debt service. The other half of
   * sizing a reserve: obligations are not only what is owed to lenders.
   */
  monthlyObligations: statedAmountSchema.nullable(),
  succession: z.object({
    structure: z.enum(successionStructures),
    /** Where succession would be administered. Jurisdiction decides outcomes. */
    jurisdiction: jurisdictionSchema.nullable(),
    /** Whether the subject believes it reflects their current intent. */
    reviewedRecently: z.boolean().nullable(),
    /** Assets the subject knows would be hard to transfer. */
    knownTransferRisks: z.array(z.string().max(300)),
    notes: z.string().max(1000).nullable(),
  }),
  /**
   * Whether anyone else could take over the subject's affairs if they could
   * not. A single point of failure in a family's finances is a preservation
   * risk that no allocation can offset.
   */
  continuityContactExists: z.boolean().nullable(),
  notes: z.string().max(2000).nullable(),
});
export type Household = z.infer<typeof householdSchema>;

export function emptyHousehold(): Household {
  return {
    dependents: [],
    monthlyObligations: null,
    succession: {
      structure: "unknown",
      jurisdiction: null,
      reviewedRecently: null,
      knownTransferRisks: [],
      notes: null,
    },
    continuityContactExists: null,
    notes: null,
  };
}

/* ---------------- insurance and long-term commitments ---------------- */

/**
 * Commitments that run for years and are invisible on a balance sheet.
 *
 * Insurance is the one people forget to record and the one that decides whether
 * a family survives the worst case. A policy is two facts, not one: what it
 * costs every month, which reduces investable surplus, and what it pays out,
 * which is the only asset that appears exactly when income stops. Recording
 * only the premium makes insurance look like a pure cost.
 */
export const commitmentKinds = [
  "life_insurance",
  "health_insurance",
  "property_insurance",
  "critical_illness",
  "income_protection",
  "education_plan",
  "pension_contribution",
  "lease",
  "support_undertaking",
  "other",
] as const;
export type CommitmentKind = (typeof commitmentKinds)[number];

export const commitmentKindLabels: Record<CommitmentKind, string> = {
  life_insurance: "Life insurance",
  health_insurance: "Health insurance",
  property_insurance: "Property insurance",
  critical_illness: "Critical illness cover",
  income_protection: "Income protection",
  education_plan: "Education plan",
  pension_contribution: "Pension contribution",
  lease: "Lease",
  support_undertaking: "Support undertaking",
  other: "Other commitment",
};

/** Kinds that pay out on an event, so their cover counts toward protection. */
export const COMMITMENT_PAYS_OUT: Record<CommitmentKind, boolean> = {
  life_insurance: true,
  health_insurance: true,
  property_insurance: true,
  critical_illness: true,
  income_protection: true,
  education_plan: true,
  pension_contribution: true,
  lease: false,
  support_undertaking: false,
  other: false,
};

export const commitmentSchema = z.object({
  commitmentId: z.string().min(1).max(64),
  subjectId: subjectIdSchema,
  kind: z.enum(commitmentKinds),
  label: z.string().min(1).max(120),
  /** What it costs. Reduces investable surplus every period. */
  premium: statedAmountSchema.nullable(),
  premiumFrequency: z.enum(incomeFrequencies).nullable(),
  /** What it pays out. Null where the commitment is a cost with no cover. */
  coverAmount: statedAmountSchema.nullable(),
  beneficiary: z.string().max(120).nullable(),
  endsOn: z.iso.date().nullable(),
  /** Whether it can be stopped without penalty. A cost that cannot be cut is a fixed obligation. */
  cancellable: z.boolean().nullable(),
  jurisdiction: jurisdictionSchema.nullable(),
  notes: z.string().max(1000).nullable(),
});
export type Commitment = z.infer<typeof commitmentSchema>;

/* ---------------- known future obligations ---------------- */

/**
 * Costs the subject already knows are coming.
 *
 * A first-class record rather than a note on a dependent. A school fee due in
 * four years changes what "deployable" means today — capital earmarked for a
 * known cost is not available for allocation, and treating it as available is
 * how a family ends up selling at the wrong moment to meet a bill they saw
 * coming for years.
 */
export const obligationKinds = [
  "education",
  "care",
  "property_purchase",
  "wedding",
  "medical",
  "tax",
  "business_capital",
  "relocation",
  "other",
] as const;
export type ObligationKind = (typeof obligationKinds)[number];

export const obligationKindLabels: Record<ObligationKind, string> = {
  education: "Education",
  care: "Care",
  property_purchase: "Property purchase",
  wedding: "Wedding",
  medical: "Medical",
  tax: "Tax",
  business_capital: "Business capital",
  relocation: "Relocation",
  other: "Other",
};

/** How firm the obligation is. Stated by the subject, never inferred. */
export const obligationCertainties = ["committed", "likely", "possible"] as const;
export type ObligationCertainty = (typeof obligationCertainties)[number];

export const futureObligationSchema = z.object({
  obligationId: z.string().min(1).max(64),
  subjectId: subjectIdSchema,
  kind: z.enum(obligationKinds),
  label: z.string().min(1).max(120),
  amount: statedAmountSchema.nullable(),
  /** When it falls due. Year alone is enough to change today's answer. */
  dueYear: z.number().int().min(1900).max(2200).nullable(),
  certainty: z.enum(obligationCertainties),
  /** Asset already set aside for it, where one is. */
  fundedByAssetId: z.string().max(64).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type FutureObligation = z.infer<typeof futureObligationSchema>;

/* ---------------- goals ---------------- */

/**
 * What the capital is actually for, in the subject's own words.
 *
 * Priority is recorded because not all goals survive a bad decade, and the order
 * they are abandoned in should be the subject's decision made calmly in advance
 * rather than under pressure.
 */
export const goalPriorities = ["essential", "important", "aspirational"] as const;
export type GoalPriority = (typeof goalPriorities)[number];

export const objectiveGoalSchema = z.object({
  goalId: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  targetAmount: statedAmountSchema.nullable(),
  targetYear: z.number().int().min(1900).max(2200).nullable(),
  priority: z.enum(goalPriorities),
  notes: z.string().max(1000).nullable(),
});
export type ObjectiveGoal = z.infer<typeof objectiveGoalSchema>;

/* ---------------- objectives and constraints ---------------- */

export const objectiveSchema = z.object({
  /** Months of obligations the subject wants held in reserve before deploying. */
  reserveMonths: z.number().min(0).max(120).nullable(),
  /** Planning horizon in years. Generational objectives run to decades. */
  horizonYears: z.number().min(0).max(100).nullable(),
  /**
   * Where the subject sits between growing capital and protecting it. 0 is pure
   * preservation, 100 pure creation. It biases the two answers; it never
   * overrides a governance control.
   */
  creationVersusPreservation: z.number().min(0).max(100).nullable(),
  /** Largest share of total capital the subject will accept in one asset. */
  maxSingleAssetPercent: z.number().min(0).max(100).nullable(),
  /** Peak-to-trough fall the subject can hold through without forced selling. */
  maxDrawdownTolerancePercent: z.number().min(0).max(100).nullable(),
  /** Currency the subject actually spends in. The real denominator. */
  baseCurrency: currencySchema.nullable(),
  /**
   * Rates to the base currency, stated by the subject.
   *
   * Currency exposure is the one measure that genuinely cannot be computed
   * without conversion — a share is a share of a single total. NeoOS has no
   * rate provider, and inventing one is out of the question, so the subject
   * supplies rates they are willing to stand behind. Anything derived from them
   * carries `user_assumption`, never `calculated`, so a net worth resting on a
   * rate the subject typed last year is never shown as a hard figure.
   */
  exchangeRatesToBase: z.record(currencySchema, z.number().positive()),
  /** Kinds the subject will not hold, for any reason. Respected absolutely. */
  excludedAssetKinds: z.array(z.enum(assetKinds)),
  /** Jurisdictions, sectors, or instruments to avoid. Free text, respected. */
  restrictions: z.array(z.string().max(200)),

  /**
   * What the subject intends to invest each month.
   *
   * Deliberately separate from the surplus NeoOS calculates. The calculated
   * figure is what the numbers allow; this is what the subject actually means
   * to do, and the gap between them is worth seeing rather than averaging away.
   */
  monthlyInvestable: statedAmountSchema.nullable(),
  /**
   * Liquidity the subject wants held beyond the emergency reserve — an amount
   * they want reachable for reasons they may not want to explain.
   */
  minimumLiquidHolding: statedAmountSchema.nullable(),

  /** Concentration ceilings. Each is a limit NeoOS checks the position against. */
  maxAssetKindPercent: z.number().min(0).max(100).nullable(),
  maxCurrencyPercent: z.number().min(0).max(100).nullable(),
  maxJurisdictionPercent: z.number().min(0).max(100).nullable(),

  /**
   * The subject's own reading of their risk capacity.
   *
   * Recorded alongside, never instead of, the capacity NeoOS calculates from
   * reserve coverage, passive income share, horizon and dependents. Capacity is
   * structural — whether a fall can be survived. Tolerance is psychological —
   * whether it can be sat through. People routinely have more of one than the
   * other, and the difference is where forced selling comes from, so both are
   * carried and shown separately.
   */
  statedRiskCapacity: z.enum(["low", "moderate", "high"]).nullable(),

  /** What the capital is for, in the subject's own words. */
  goals: z.array(objectiveGoalSchema),
  notes: z.string().max(2000).nullable(),
});
export type Objective = z.infer<typeof objectiveSchema>;

/* ---------------- the profile ---------------- */

/**
 * v6.0 adds insurance and long-term commitments, known future obligations,
 * structured goals, concentration ceilings, stated monthly investable amount,
 * a liquidity floor, and stated risk capacity.
 *
 * No migration from 5.0 exists because no 5.0 profile was ever written — the
 * store landed before the form did. A stored profile that fails to parse throws
 * rather than being coerced, so if one did exist it would surface loudly rather
 * than being silently reshaped.
 */
export const INTAKE_SCHEMA_VERSION = "6.0" as const;

export const intakeProfileSchema = z.object({
  schemaVersion: z.literal(INTAKE_SCHEMA_VERSION),
  subjectId: subjectIdSchema,
  /** Every profile is a version; corrections append rather than overwrite. */
  profileId: z.string().min(1).max(64),
  recordedAt: z.iso.datetime({ offset: true }),
  supersedes: z.string().max(64).nullable(),
  incomeSources: z.array(incomeSourceSchema),
  assets: z.array(assetHoldingSchema),
  liabilities: z.array(liabilitySchema),
  commitments: z.array(commitmentSchema),
  futureObligations: z.array(futureObligationSchema),
  household: householdSchema,
  objective: objectiveSchema,
});
export type IntakeProfile = z.infer<typeof intakeProfileSchema>;

/** An empty profile. Zero declared, not zero owned — the two differ entirely. */
export function emptyProfile(subjectId: SubjectId, profileId: string, recordedAt: string): IntakeProfile {
  return {
    schemaVersion: INTAKE_SCHEMA_VERSION,
    subjectId,
    profileId,
    recordedAt,
    supersedes: null,
    incomeSources: [],
    assets: [],
    liabilities: [],
    commitments: [],
    futureObligations: [],
    household: emptyHousehold(),
    objective: {
      reserveMonths: null,
      horizonYears: null,
      creationVersusPreservation: null,
      maxSingleAssetPercent: null,
      maxDrawdownTolerancePercent: null,
      baseCurrency: null,
      exchangeRatesToBase: {},
      excludedAssetKinds: [],
      restrictions: [],
      monthlyInvestable: null,
      minimumLiquidHolding: null,
      maxAssetKindPercent: null,
      maxCurrencyPercent: null,
      maxJurisdictionPercent: null,
      statedRiskCapacity: null,
      goals: [],
      notes: null,
    },
  };
}
