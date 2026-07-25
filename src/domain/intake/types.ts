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
  /** Kinds the subject will not hold, for any reason. Respected absolutely. */
  excludedAssetKinds: z.array(z.enum(assetKinds)),
  /** Jurisdictions, sectors, or instruments to avoid. Free text, respected. */
  restrictions: z.array(z.string().max(200)),
  notes: z.string().max(2000).nullable(),
});
export type Objective = z.infer<typeof objectiveSchema>;

/* ---------------- the profile ---------------- */

export const INTAKE_SCHEMA_VERSION = "5.0" as const;

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
    objective: {
      reserveMonths: null,
      horizonYears: null,
      creationVersusPreservation: null,
      maxSingleAssetPercent: null,
      maxDrawdownTolerancePercent: null,
      baseCurrency: null,
      excludedAssetKinds: [],
      restrictions: [],
      notes: null,
    },
  };
}
