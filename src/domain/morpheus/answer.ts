import type { ProvenanceKind } from "@/domain/profile/provenance";

/**
 * The Morpheus answer contract.
 *
 * The governing principle of this layer: **the visible language may vary
 * naturally while the underlying structure stays deterministic and auditable.**
 *
 * Every answer carries two halves. `StructuredDecision` is what an auditor
 * reads — recommendation, confidence, evidence, provenance, risks,
 * disconfirmation, next action — and it is produced by the same domain
 * functions the workspaces render. The prose fields are a *presentation* of
 * that object, never a source of new claims.
 *
 * That separation is what makes conversation safe here. Nothing in this module
 * generates a number, softens a refusal, or infers a fact. If the domain says
 * `reserveCoverage` is unknown, Morpheus says he does not know it — in a
 * sentence rather than a status code, but he says it.
 *
 * There is no language model behind any of this. Answers are deterministic
 * functions of the declared position and the current report, which is why the
 * same question asked twice returns the same answer.
 */

export const morpheusIntents = [
  "briefing",
  "marginal_allocation",
  "largest_risk",
  "what_changed",
  "concentration",
  "gold_posture",
  "deployable_cash",
  "plan_on_track",
  "reserve",
  "explain",
  "evidence",
  "unrecognised",
] as const;
export type MorpheusIntent = (typeof morpheusIntents)[number];

/**
 * A single piece of supporting evidence, shown on demand rather than by
 * default. Progressive disclosure is a presentation choice, not a reduction in
 * rigour: everything here was already computed and is one tap away.
 */
export interface EvidenceItem {
  label: string;
  detail: string;
  provenance: ProvenanceKind;
  /** Where the figure came from, in the user's terms. */
  sourceNote: string | null;
}

/**
 * What gets stored, audited and compared over time. Deterministic, and
 * unaffected by how the prose above it is worded.
 */
export interface StructuredDecision {
  recommendation: string;
  /** 0-100. Null when the evidence does not support a confidence at all. */
  confidence: number | null;
  evidence: EvidenceItem[];
  /** Weakest provenance among the inputs — the honest label for the whole. */
  provenance: ProvenanceKind;
  risks: string[];
  /** What would make this conclusion wrong. Never empty by convention. */
  disconfirmation: string[];
  nextAction: string | null;
}

/**
 * One Morpheus response.
 *
 * The prose order is conclusion, why it matters, action, uncertainty, evidence
 * — but the fields are optional past the first two, because forcing every
 * answer into a fixed visible template is exactly what makes a system sound
 * like a form rather than an adviser.
 */
export interface MorpheusAnswer {
  intent: MorpheusIntent;
  /** The direct conclusion. Always present, always first, never hedged away. */
  conclusion: string;
  /** Why it matters to this person, in terms of their position. */
  whyItMatters: string;
  action: string | null;
  /** Uncertainty worth stating aloud. Absent when there is genuinely none. */
  uncertainty: string | null;
  evidence: EvidenceItem[];
  /** Deep link into the workspace that holds the detail. */
  workspace: { href: string; label: string } | null;
  /** One high-value follow-up. Never more than one at a time. */
  followUp: string | null;
  decision: StructuredDecision;
  /**
   * True when the answer is deterministic preview content shown because a
   * generation path is not connected. Rendered with a visible marker — a
   * preview that does not announce itself is a fabrication.
   */
  preview: boolean;
}

/** Turns in the thread. `question` is the user; `answer` is Morpheus. */
export interface ConversationTurn {
  id: string;
  role: "user" | "morpheus";
  /** User text, or the conclusion line for a Morpheus turn. */
  text: string;
  answer: MorpheusAnswer | null;
  at: string;
  /** Workspace the turn was raised from, so context survives navigation. */
  origin: string;
}

/**
 * A suggested question, offered in context.
 *
 * Suggestions are computed from the current position, not from a static list:
 * offering "should I add to gold?" to somebody who holds none would be noise
 * dressed as helpfulness.
 */
export interface SuggestedQuestion {
  text: string;
  intent: MorpheusIntent;
  /** Why this is worth asking now. Shown as a hint, not as a claim. */
  because: string;
}

/**
 * Build an answer with the structure enforced.
 *
 * `disconfirmation` defaulting to a stated fallback rather than an empty array
 * is deliberate. An answer that cannot say what would make it wrong has not
 * been thought through, and the absence should be visible rather than silent.
 */
export function answer(input: {
  intent: MorpheusIntent;
  conclusion: string;
  whyItMatters: string;
  action?: string | null;
  uncertainty?: string | null;
  evidence?: EvidenceItem[];
  workspace?: { href: string; label: string } | null;
  followUp?: string | null;
  recommendation: string;
  confidence?: number | null;
  provenance: ProvenanceKind;
  risks?: string[];
  disconfirmation?: string[];
  nextAction?: string | null;
  preview?: boolean;
}): MorpheusAnswer {
  const evidence = input.evidence ?? [];
  return {
    intent: input.intent,
    conclusion: input.conclusion,
    whyItMatters: input.whyItMatters,
    action: input.action ?? null,
    uncertainty: input.uncertainty ?? null,
    evidence,
    workspace: input.workspace ?? null,
    followUp: input.followUp ?? null,
    preview: input.preview ?? false,
    decision: {
      recommendation: input.recommendation,
      confidence: input.confidence ?? null,
      evidence,
      provenance: input.provenance,
      risks: input.risks ?? [],
      disconfirmation:
        input.disconfirmation && input.disconfirmation.length > 0
          ? input.disconfirmation
          : ["Not stated for this answer."],
      nextAction: input.nextAction ?? input.action ?? null,
    },
  };
}
