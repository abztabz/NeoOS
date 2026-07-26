/**
 * Corpus approval stages.
 *
 * "Approve the corpus" was treated as one decision. It is six, and collapsing
 * them creates a specific failure: approving a **title list** reads as approving
 * every claim inside those titles.
 *
 * It does not. A source may be a good source, correctly identified, properly
 * licensed and fully ingested, and still have a particular claim that NeoOS must
 * not repeat — a replication failure, a disputed threshold, a folklore statistic.
 * Those are recorded per source as prohibited claims, and they survive approval
 * of the list they sit in.
 */

/** Ordered. Each stage requires every earlier one. */
export const approvalStages = [
  "proposed",
  "list_approved",
  "identity_verified",
  "licensing_approved",
  "ingestion_order_approved",
  "ingested",
  "claims_activated",
] as const;
export type ApprovalStage = (typeof approvalStages)[number];

export const approvalStageMeaning: Record<ApprovalStage, string> = {
  proposed: "Nominated in the proposal. Nothing has been decided.",
  list_approved:
    "The operator accepts this title on the list. **This approves the title, not the claims inside it.**",
  identity_verified:
    "Title, author, edition, date, critique history and publication status confirmed against the artefact rather than recalled.",
  licensing_approved:
    "Licensing and access permit the intended use. Some sources may be reference-only: cited, never reproduced.",
  ingestion_order_approved: "Placed in a stage of the ingestion plan.",
  ingested: "Records exist in the corpus with resolvable citations.",
  claims_activated:
    "Morpheus may cite this source in a briefing. A separate decision requiring the analogy structure and the disconfirmation search.",
};

const ORDER: Record<ApprovalStage, number> = {
  proposed: 0,
  list_approved: 1,
  identity_verified: 2,
  licensing_approved: 3,
  ingestion_order_approved: 4,
  ingested: 5,
  claims_activated: 6,
};

/** Whether a source at this stage may be cited in a briefing. */
export function mayActivateClaims(stage: ApprovalStage): boolean {
  return stage === "claims_activated";
}

/** Whether a source at this stage may hold records in the corpus. */
export function mayHoldRecords(stage: ApprovalStage): boolean {
  return ORDER[stage] >= ORDER.ingested;
}

/**
 * The next stage, or null at the end.
 *
 * Stages advance one at a time. Nothing jumps from `list_approved` to
 * `ingested`, because the three stages between are where verification,
 * licensing and sequencing actually happen — and skipping them is how a
 * recalled edition becomes a citation.
 */
export function nextStage(stage: ApprovalStage): ApprovalStage | null {
  return approvalStages[ORDER[stage] + 1] ?? null;
}

/** Whether a proposed advance is legitimate. */
export function canAdvance(from: ApprovalStage, to: ApprovalStage): { allowed: boolean; reason: string } {
  if (ORDER[to] <= ORDER[from]) {
    return { allowed: false, reason: "Stages advance forward only. A regression is a supersede, not a move." };
  }
  if (ORDER[to] !== ORDER[from] + 1) {
    return {
      allowed: false,
      reason: `Cannot jump ${from} → ${to}. Every intermediate stage exists because something is checked there.`,
    };
  }
  return { allowed: true, reason: `${from} → ${to}.` };
}

/**
 * A claim a source must not be used to support, regardless of approval stage.
 *
 * Recorded per source and **not cleared by any stage**. Approving a title,
 * verifying its edition and ingesting it does not license a claim its own
 * authors withdrew or the literature failed to replicate.
 */
export interface ProhibitedClaim {
  sourceId: string;
  claim: string;
  reason: string;
}

export function isClaimPermitted(
  sourceId: string,
  claim: string,
  stage: ApprovalStage,
  prohibited: ProhibitedClaim[],
): { permitted: boolean; reason: string } {
  const block = prohibited.find((p) => p.sourceId === sourceId && p.claim === claim);
  if (block) {
    return {
      permitted: false,
      reason: `${block.claim} is a prohibited claim for ${sourceId}: ${block.reason}. Approval of the source does not license it.`,
    };
  }
  if (!mayActivateClaims(stage)) {
    return {
      permitted: false,
      reason: `${sourceId} is at stage "${stage}". Claims may only be cited once activated, which is a separate decision from approving the list.`,
    };
  }
  return { permitted: true, reason: "" };
}
