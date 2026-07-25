import { z } from "zod";

/**
 * Deterministic report comparison.
 *
 * A cause is only stated when the calculation trace or an evidence change
 * proves it. Otherwise the cause is `unknown` — an invented explanation is
 * worse than no explanation, because it sounds authoritative.
 */

export const changeTypes = [
  "score",
  "rating",
  "confidence",
  "evidence_integrity",
  "valuation",
  "margin_of_safety",
  "threshold",
  "new_evidence",
  "expired_evidence",
  "conflict_resolved",
  "conflict_new",
  "deployment_posture",
  "reserve_constraint",
  "concentration",
  "newly_insufficient",
  "restored_from_insufficient",
  "engine_version",
  "schema_version",
] as const;
export type ChangeType = (typeof changeTypes)[number];

export const changeSeverities = ["critical", "material", "minor", "informational"] as const;
export type ChangeSeverity = (typeof changeSeverities)[number];

export const changeCauseKinds = [
  "evidence_added",
  "evidence_expired",
  "valuation_input_changed",
  "conflict_state_changed",
  "constraint_applied",
  "constraint_released",
  "engine_version_changed",
  "unknown",
] as const;
export type ChangeCauseKind = (typeof changeCauseKinds)[number];

export const reportChangeSchema = z.object({
  type: z.enum(changeTypes),
  severity: z.enum(changeSeverities),
  /** Asset id, or null for a portfolio-level change. */
  assetId: z.string().nullable(),
  scope: z.enum(["asset", "global"]),
  label: z.string(),
  previousValue: z.union([z.string(), z.number(), z.null()]),
  currentValue: z.union([z.string(), z.number(), z.null()]),
  absoluteChange: z.number().nullable(),
  percentageChange: z.number().nullable(),
  cause: z.enum(changeCauseKinds),
  causeDetail: z.string(),
  supportingEvidenceIds: z.array(z.string()),
  /** Written for the user, not for a developer. */
  explanation: z.string(),
});
export type ReportChange = z.infer<typeof reportChangeSchema>;

export const reportDiffSchema = z.object({
  schemaVersion: z.literal("3.0"),
  previousReportHash: z.string().nullable(),
  currentReportHash: z.string(),
  previousGeneratedAt: z.iso.datetime({ offset: true }).nullable(),
  currentGeneratedAt: z.iso.datetime({ offset: true }),
  /** True when there is no prior report to compare against. */
  isFirstReport: z.boolean(),
  changes: z.array(reportChangeSchema),
  summary: z.object({
    total: z.number().int().min(0),
    critical: z.number().int().min(0),
    material: z.number().int().min(0),
    minor: z.number().int().min(0),
    informational: z.number().int().min(0),
  }),
});
export type ReportDiff = z.infer<typeof reportDiffSchema>;

/** Thresholds for classifying a numeric change. Centralized, not inline. */
export const CHANGE_THRESHOLDS = {
  /** Score movement at or above this is material; a rating change is always material. */
  materialScorePoints: 3,
  criticalScorePoints: 10,
  /** Deployment posture band change is always at least material. */
  materialDeploymentPoints: 5,
  criticalDeploymentPoints: 15,
  materialConfidencePoints: 5,
  materialIntegrityPoints: 5,
  materialMosPct: 0.05,
} as const;
