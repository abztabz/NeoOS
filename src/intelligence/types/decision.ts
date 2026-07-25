import { z } from "zod";

/**
 * Decision capture.
 *
 * A recommendation and a user action are separate records. NeoOS never infers
 * that a recommendation was executed — if the user did something, they said so.
 */

export const decisionKinds = [
  "no_action",
  "accepted",
  "partially_accepted",
  "rejected",
  "deferred",
  "custom_action",
] as const;
export type DecisionKind = (typeof decisionKinds)[number];

export const decisionKindLabels: Record<DecisionKind, string> = {
  no_action: "No action",
  accepted: "Accepted",
  partially_accepted: "Partially accepted",
  rejected: "Rejected",
  deferred: "Deferred",
  custom_action: "Custom action",
};

/** Capital-posture decisions are recorded alongside asset decisions. */
export const postureDecisions = [
  "preserve_cash",
  "deploy_10",
  "deploy_25",
  "rebalance",
  "hold_existing",
  "reduce_exposure",
  "no_decision",
] as const;
export type PostureDecision = (typeof postureDecisions)[number];

export const postureDecisionLabels: Record<PostureDecision, string> = {
  preserve_cash: "Preserve cash",
  deploy_10: "Deploy 10%",
  deploy_25: "Deploy 25%",
  rebalance: "Rebalance",
  hold_existing: "Hold existing positions",
  reduce_exposure: "Reduce exposure",
  no_decision: "No decision recorded",
};

export const decisionCaptureSchema = z.object({
  schemaVersion: z.literal("3.0"),
  decisionId: z.string(),
  /** The run whose recommendation this responds to. */
  runId: z.string(),
  /** Hash of the report the decision responds to — pins what was actually shown. */
  reportHash: z.string(),
  recordedAt: z.iso.datetime({ offset: true }),
  /** Asset-level decision, or null for a posture-level decision. */
  assetId: z.string().nullable(),
  kind: z.enum(decisionKinds),
  postureDecision: z.enum(postureDecisions).nullable(),
  /** What the engine recommended, copied so the record stands alone. */
  recommendationSnapshot: z.string(),
  amount: z.number().nullable(),
  amountUnit: z.enum(["currency", "percent"]).nullable(),
  intendedExecutionDate: z.string().nullable(),
  actualExecutionDate: z.string().nullable(),
  executionPrice: z.number().nullable(),
  notes: z.string().nullable(),
  reason: z.string().nullable(),
  /** The user's own confidence in their decision, not the engine's. */
  decisionConfidence: z.number().min(0).max(100).nullable(),
  constraints: z.array(z.string()),
  /** Placeholders for later attachment support. */
  attachmentRefs: z.array(z.string()),
  reviewDate: z.string().nullable(),
});
export type DecisionCapture = z.infer<typeof decisionCaptureSchema>;

export function emptyDecision(
  base: Pick<DecisionCapture, "decisionId" | "runId" | "reportHash" | "recordedAt" | "assetId" | "recommendationSnapshot">,
): DecisionCapture {
  return {
    schemaVersion: "3.0",
    kind: "no_action",
    postureDecision: null,
    amount: null,
    amountUnit: null,
    intendedExecutionDate: null,
    actualExecutionDate: null,
    executionPrice: null,
    notes: null,
    reason: null,
    decisionConfidence: null,
    constraints: [],
    attachmentRefs: [],
    reviewDate: null,
    ...base,
  };
}
