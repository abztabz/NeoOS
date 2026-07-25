import { z } from "zod";

/**
 * Staged validation.
 *
 * Invalid evidence is never discarded silently: every rejection is kept with
 * its reason so the run can be audited. Severity decides consequence —
 * `blocking` prevents the affected conclusion from being rated at all.
 */

export const validationSeverities = ["blocking", "warning", "informational"] as const;
export type ValidationSeverity = (typeof validationSeverities)[number];

export const validationStages = [
  "raw_input",
  "identity",
  "normalized_evidence",
  "universe_inputs",
  "generated_report",
  "journal_entry",
] as const;
export type ValidationStage = (typeof validationStages)[number];

/** Stable codes so tests and the UI never match on prose. */
export const validationCodes = [
  "unknown_asset_identity",
  "ambiguous_asset_identity",
  "conflicting_asset_identity",
  "unsupported_unit",
  "impossible_date",
  "future_publication_date",
  "stale_critical_evidence",
  "incompatible_currency",
  "duplicate_source_record",
  "unsupported_evidence_type",
  "conflicting_fiscal_period",
  "provider_mode_misrepresented",
  "missing_provenance",
  "malformed_numeric_value",
  "non_reproducible_valuation_input",
  "schema_violation",
  "unresolved_conflict",
  "no_usable_evidence",
] as const;
export type ValidationCode = (typeof validationCodes)[number];

export const validationIssueSchema = z.object({
  code: z.enum(validationCodes),
  severity: z.enum(validationSeverities),
  stage: z.enum(validationStages),
  message: z.string(),
  /** What the issue is about: a raw record, an asset, or the whole run. */
  subjectType: z.enum(["raw_evidence", "evidence", "asset", "report", "run"]),
  subjectId: z.string().nullable(),
  assetId: z.string().nullable(),
  detail: z.string().nullable(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** A raw record that did not survive validation, kept with its reasons. */
export const rejectedRecordSchema = z.object({
  rawEvidenceId: z.string(),
  providerId: z.string(),
  reasons: z.array(validationIssueSchema),
});
export type RejectedRecord = z.infer<typeof rejectedRecordSchema>;

export function isBlocking(issue: ValidationIssue): boolean {
  return issue.severity === "blocking";
}

export function blockingAssetIds(issues: ValidationIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.severity === "blocking" && issue.assetId) ids.add(issue.assetId);
  }
  return ids;
}

/**
 * Tolerance for a publication date in the future. Clock skew between a
 * provider and this machine is normal; a day is not.
 */
export const FUTURE_DATE_TOLERANCE_MINUTES = 90;
