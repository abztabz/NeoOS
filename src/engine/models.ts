import { z } from "zod";
import { assetRatings } from "@/schemas/neoos-report";
import { FACTOR_NAMES, type FactorName } from "@/engine/constants";

/**
 * Canonical engine data models (schema v2.0). These are the auditable inner
 * models; the v1.1 view report the UI renders is DERIVED from them by
 * `deriveViewReport` and never hand-authored.
 */

const score0to100 = z.number().min(0).max(100);
const isoDate = z.iso.datetime({ offset: true });

/* ---------- A. Asset ---------- */

export const canonicalAssetSchema = z.object({
  assetId: z.string(),
  name: z.string(),
  /** "instrument" = specific security; "category" = generic bucket, no ticker. */
  kind: z.enum(["instrument", "category"]),
  ticker: z.string().nullable(),
  exchange: z.string().nullable(),
  currency: z.string(),
  assetClass: z.string(),
  category: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string(),
  benchmark: z.string().nullable(),
  status: z.enum(["active", "watch", "excluded"]),
  sourceIdentifiers: z.record(z.string(), z.string()),
});
export type CanonicalAsset = z.infer<typeof canonicalAssetSchema>;

/* ---------- B. Evidence record ---------- */

export const evidenceTypeSchema = z.enum([
  "officialFiling",
  "marketData",
  "institutionalResearch",
  "macroIntelligence",
  "financialNews",
  "sentiment",
]);

export const evidenceRecordSchema = z.object({
  evidenceId: z.string(),
  /** Asset scope, or null for macro/portfolio-level evidence. */
  assetId: z.string().nullable(),
  evidenceType: evidenceTypeSchema,
  /** 1 (official filing) … 6 (sentiment) — see SOURCE_TIERS. */
  sourceTier: z.number().int().min(1).max(6),
  sourceName: z.string(),
  /** URL or canonical citation (filing accession id, dataset name, …). */
  sourceRef: z.string(),
  publicationDate: isoDate,
  retrievedAt: isoDate,
  effectiveDate: isoDate.nullable(),
  expiresAt: isoDate.nullable(),
  /** Which factor this evidence informs, when it is a factor input. */
  factor: z.enum(FACTOR_NAMES as [FactorName, ...FactorName[]]).nullable(),
  /** Normalized claim identity — two records with the same claimKey assert the same fact. */
  claimKey: z.string().nullable(),
  factualClaim: z.string(),
  normalizedValue: z.number().nullable(),
  unit: z.string().nullable(),
  confidence: score0to100,
  verificationStatus: z.enum(["verified", "unverified", "disputed"]),
  conflictGroupId: z.string().nullable(),
  notes: z.string().nullable(),
});
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

/* ---------- C. Factor score ---------- */

export const factorScoreSchema = z.object({
  factorName: z.enum(FACTOR_NAMES as [FactorName, ...FactorName[]]),
  rawScore: score0to100.nullable(),
  adjustedScore: score0to100.nullable(),
  weight: z.number().min(0).max(1),
  weightedContribution: z.number().nullable(),
  confidence: score0to100,
  freshnessPenalty: z.number().min(0),
  coveragePenalty: z.number().min(0),
  conflictPenalty: z.number().min(0),
  /** 0–1: how much of this factor is backed by usable evidence. */
  evidenceCoverage: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  rationale: z.string(),
  missingInputs: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type FactorScore = z.infer<typeof factorScoreSchema>;

/* ---------- Valuation ---------- */

export const valuationMethodSchema = z.enum([
  "discountedCashFlow",
  "ownerEarnings",
  "earningsMultiple",
  "dividendModel",
  "netAssetValue",
  "yieldSpread",
  "relativeValuation",
  "replacementCost",
  "goldStrategicAllocation",
  "cashEquivalentYield",
]);
export type ValuationMethod = z.infer<typeof valuationMethodSchema>;

export const valuationResultSchema = z.object({
  method: valuationMethodSchema,
  modelVersion: z.string(),
  calculationDate: isoDate,
  inputs: z.record(z.string(), z.union([z.number(), z.string()])),
  assumptions: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  conservativeValue: z.number().nullable(),
  baseValue: z.number().nullable(),
  optimisticValue: z.number().nullable(),
  marketPrice: z.number().nullable(),
  currency: z.string(),
  /** (conservative − price) ⁄ conservative; positive = discount. */
  marginOfSafety: z.number().nullable(),
  /** Score change per 10% move in the most sensitive input. */
  sensitivity: z.string(),
  confidence: score0to100,
  invalidationConditions: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type ValuationResult = z.infer<typeof valuationResultSchema>;

/* ---------- D. Asset recommendation ---------- */

export const gateCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  actual: z.string(),
  required: z.string(),
});
export type GateCheck = z.infer<typeof gateCheckSchema>;

export const recommendationStatusSchema = z.enum(["rated", "insufficient_evidence"]);

export const assetRecommendationSchema = z.object({
  assetId: z.string(),
  status: recommendationStatusSchema,
  /** Full-precision weighted total; round only at display time. */
  totalScore: z.number().nullable(),
  provisionalRating: z.enum(assetRatings).nullable(),
  finalRating: z.enum(assetRatings).nullable(),
  confidence: score0to100,
  evidenceIntegrity: score0to100,
  valuationDate: isoDate.nullable(),
  engineVersion: z.string(),
  modelVersion: z.string(),
  eligibilityChecks: z.array(gateCheckSchema),
  vetoes: z.array(z.string()),
  factorScores: z.array(factorScoreSchema),
  valuation: valuationResultSchema.nullable(),
  marginOfSafety: z.number().nullable(),
  downsideCase: z.string().nullable(),
  baseCase: z.string().nullable(),
  upsideCase: z.string().nullable(),
  portfolioFit: z.string().nullable(),
  recommendationRationale: z.string(),
  insufficientReasons: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  conflictIds: z.array(z.string()),
});
export type AssetRecommendation = z.infer<typeof assetRecommendationSchema>;

/* ---------- E. Capital posture ---------- */

export const appliedConstraintSchema = z.object({
  id: z.string(),
  description: z.string(),
  capApplied: z.number(),
});

export const capitalPostureSchema = z.object({
  deploymentScore: z.number().min(0).max(100),
  deploymentBand: z.string(),
  recommendation: z.string(),
  acceleratorPosture: z.string(),
  /** Fraction of deployable cash allowed in the first tranche. */
  maximumInitialTranche: z.number().min(0).max(1),
  reserveRequirement: z.string(),
  confidence: score0to100,
  evidenceIntegrity: score0to100,
  marketScore: score0to100,
  cashScore: score0to100,
  opportunityIndex: score0to100,
  strongBuyCount: z.number().int().min(0),
  concentrationRisk: score0to100,
  liquidityRisk: score0to100,
  rationale: z.array(z.string()),
  constraints: z.array(appliedConstraintSchema),
  /** What would move the score, in both directions. */
  wouldIncrease: z.array(z.string()),
  wouldDecrease: z.array(z.string()),
  generatedAt: isoDate,
  engineVersion: z.string(),
});
export type CapitalPosture = z.infer<typeof capitalPostureSchema>;

/* ---------- Evidence conflicts ---------- */

export const conflictRecordSchema = z.object({
  conflictId: z.string(),
  claimKey: z.string(),
  evidenceIds: z.array(z.string()).min(2),
  /** Evidence id ranked strongest by source tier — the prevailing record. */
  prevailingEvidenceId: z.string(),
  severity: z.enum(["low", "high"]),
  resolution: z.enum(["unresolved", "resolved_by_tier", "resolved_manually"]),
  confidenceEffect: z.string(),
  note: z.string(),
});
export type ConflictRecord = z.infer<typeof conflictRecordSchema>;

/* ---------- F. Decision journal entry ---------- */

export const decisionJournalEntrySchema = z.object({
  entryId: z.string(),
  recommendationId: z.string(),
  timestamp: isoDate,
  /** Hash of the full report snapshot this entry refers to. */
  reportHash: z.string(),
  summary: z.string(),
  deploymentScore: z.number(),
  recommendation: z.string(),
  engineVersion: z.string(),
  modelVersion: z.string(),
  userDecision: z.string().nullable(),
  executionDetails: z.string().nullable(),
  outcome: z.string().nullable(),
  reviewNotes: z.string().nullable(),
  /** Entries are immutable: corrections create a new version referencing the old. */
  supersedes: z.string().nullable(),
  integrityHash: z.string(),
});
export type DecisionJournalEntry = z.infer<typeof decisionJournalEntrySchema>;

/* ---------- Engine report envelope (schema v2.0) ---------- */

export const engineReportSchema = z.object({
  schemaVersion: z.literal("2.0"),
  metadata: z.object({
    generatedAt: isoDate,
    evidenceUpdatedAt: isoDate,
    engineVersion: z.string(),
    mode: z.enum(["demo", "live"]),
    previousReportHash: z.string().nullable(),
    /**
     * Honest provenance label stamped by the intelligence pipeline, e.g.
     * "Fixture intelligence". The engine never sets this — it knows nothing
     * about providers — but it travels with the report so the UI can state
     * where the numbers came from.
     */
    provenanceLabel: z.string().optional(),
  }),
  assets: z.array(canonicalAssetSchema),
  evidence: z.array(evidenceRecordSchema),
  conflicts: z.array(conflictRecordSchema),
  recommendations: z.array(assetRecommendationSchema),
  posture: capitalPostureSchema,
  evidenceSummary: z.object({
    total: z.number().int(),
    byFreshness: z.record(z.string(), z.number().int()),
    verifiedShare: z.number().min(0).max(1),
  }),
  changeLog: z.array(z.string()),
  warnings: z.array(z.string()),
  insufficientEvidenceItems: z.array(z.string()),
  journalEntry: decisionJournalEntrySchema,
});
export type EngineReport = z.infer<typeof engineReportSchema>;
