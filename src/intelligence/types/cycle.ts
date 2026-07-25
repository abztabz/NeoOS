import { z } from "zod";
import { providerDescriptorSchema } from "@/intelligence/types/provider";
import { rejectedRecordSchema, validationIssueSchema } from "@/intelligence/types/validation";
import { identityResolutionSchema } from "@/intelligence/types/identity";

/**
 * Result of one daily Morpheus cycle.
 *
 * `partial_success` exists specifically so a run with a failed provider or a
 * blocked asset is never presented as a clean success.
 */

export const cycleStates = [
  "success",
  "partial_success",
  "insufficient_evidence",
  "failed",
  "cancelled",
] as const;
export type CycleState = (typeof cycleStates)[number];

export const cycleStateLabels: Record<CycleState, string> = {
  success: "Complete",
  partial_success: "Partial — some inputs unavailable",
  insufficient_evidence: "Insufficient evidence",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const auditStepSchema = z.object({
  step: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
  ok: z.boolean(),
  detail: z.string(),
  counts: z.record(z.string(), z.number()).nullable(),
});
export type AuditStep = z.infer<typeof auditStepSchema>;

export const evidenceCountsSchema = z.object({
  rawIngested: z.number().int().min(0),
  rawRejected: z.number().int().min(0),
  duplicatesDropped: z.number().int().min(0),
  normalized: z.number().int().min(0),
  identityMatched: z.number().int().min(0),
  identityAmbiguous: z.number().int().min(0),
  identityUnmatched: z.number().int().min(0),
  identityConflicted: z.number().int().min(0),
  conflictsDetected: z.number().int().min(0),
  conflictsUnresolved: z.number().int().min(0),
});
export type EvidenceCounts = z.infer<typeof evidenceCountsSchema>;

export const identityTraceSchema = z.object({
  rawEvidenceId: z.string(),
  suppliedIdentifiers: z.array(z.string()),
  resolution: identityResolutionSchema,
});
export type IdentityTrace = z.infer<typeof identityTraceSchema>;

/**
 * The cycle result. `report` is null on a failed run — the caller keeps the
 * last valid report rather than being handed a blank one.
 */
export const cycleResultSchema = z.object({
  schemaVersion: z.literal("3.0"),
  runId: z.string(),
  state: z.enum(cycleStates),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
  /** Provider states exactly as they were during this run. */
  providers: z.array(providerDescriptorSchema),
  /** Modes that actually contributed records, for honest labelling. */
  contributingModes: z.array(z.string()),
  evidenceCounts: evidenceCountsSchema,
  rejectedRecords: z.array(rejectedRecordSchema),
  identityTraces: z.array(identityTraceSchema),
  issues: z.array(validationIssueSchema),
  /** Assets excluded from rating, with the reason. */
  excludedAssets: z.array(z.object({ assetId: z.string(), reason: z.string() })),
  auditTrace: z.array(auditStepSchema),
  /** Populated on success/partial_success/insufficient_evidence; null on failure. */
  reportRef: z.string().nullable(),
});
export type CycleResultEnvelope = z.infer<typeof cycleResultSchema>;
