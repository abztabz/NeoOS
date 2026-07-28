import { respond, type AnswerContext } from "@/domain/morpheus/answers";
import type { MorpheusAnswer } from "@/domain/morpheus/answer";
import { greeting, list, positionStateFrom, sayPercent, type PositionState } from "@/domain/morpheus/voice";
import { isKnown } from "@/domain/profile/provenance";

/**
 * The daily two-answer briefing, said rather than tabulated.
 *
 * The product definition has never changed: the home screen answers *how hard
 * should I press the accelerator today* and *why*, within five seconds. What
 * changes here is the form. The same two answers, delivered as an adviser would
 * open a conversation, not as a grid of scores with the answer implied
 * somewhere inside it.
 *
 * Five things and no more: a greeting appropriate to what is actually known,
 * the best marginal allocation, the largest unaddressed risk, what materially
 * changed, and one suggested next action. Everything else is behind disclosure.
 * A briefing that opens with eleven metrics has not decided what matters, and
 * has quietly handed that job back to the reader.
 */

export interface DailyBriefing {
  greeting: string;
  state: PositionState;
  /** Answer one: how hard to press. */
  posture: MorpheusAnswer;
  /** Answer two: the largest unaddressed risk. */
  risk: MorpheusAnswer;
  /** Material changes, or an honest statement that there are none. */
  changed: MorpheusAnswer;
  /** Exactly one suggested action. Never a list of things to consider. */
  nextAction: string | null;
  /** True when the briefing describes the worked example rather than the user. */
  isDemo: boolean;
}

export function buildBriefing(input: {
  context: AnswerContext;
  personalisation: "unavailable" | "provisional" | "available";
  hasProfile: boolean;
  hour: number;
}): DailyBriefing {
  const state = positionStateFrom({
    hasProfile: input.hasProfile,
    isDemo: input.context.isDemo,
    personalisation: input.personalisation,
  });

  const posture = respond("marginal_allocation", "", input.context);
  // The risk answer is computed with the posture already in hand so a follow-up
  // question in the thread can refer back to either without recomputing.
  const risk = respond("largest_risk", "", { ...input.context, lastAnswer: posture, lastIntent: "marginal_allocation" });
  const changed = respond("what_changed", "", { ...input.context, lastAnswer: risk, lastIntent: "largest_risk" });

  return {
    greeting: greeting(state, input.hour),
    state,
    posture,
    risk,
    changed,
    // One action, chosen by precedence rather than concatenated. Two suggested
    // actions is zero suggested actions.
    nextAction: risk.decision.nextAction ?? posture.decision.nextAction,
    isDemo: input.context.isDemo,
  };
}

/**
 * The one-line summary a person could act on without reading further.
 *
 * Exists because the five-second test is real: if the opening line does not
 * carry the decision, the rest of the screen is decoration.
 */
export function briefingHeadline(briefing: DailyBriefing): string {
  return briefing.posture.conclusion;
}

/**
 * What the briefing could not cover, in the user's terms.
 *
 * Deliberately *not* the full gap list. Showing every unresolved field at once
 * is the behaviour the conversational brief rules out; this names the count and
 * lets the gap flow handle them one at a time.
 */
export function briefingLimits(context: AnswerContext): string | null {
  const calculations = context.calculations;
  if (calculations === null) return null;

  const unknownOutputs = Object.entries(calculations)
    .filter(([, value]) => !isKnown(value))
    .map(([key]) => key);

  if (unknownOutputs.length === 0) return null;
  if (unknownOutputs.length <= 2) {
    return `I still can't work out ${list(unknownOutputs.map(readableOutput))}.`;
  }
  return `There are ${unknownOutputs.length} things I still can't work out. I'll ask you about them one at a time rather than all at once.`;
}

/** Coverage as a share, for a quiet progress indication rather than a score. */
export function briefingCoverage(context: AnswerContext): string | null {
  const calculations = context.calculations;
  if (calculations === null) return null;
  const entries = Object.values(calculations);
  const known = entries.filter(isKnown).length;
  return sayPercent((known / entries.length) * 100);
}

function readableOutput(key: string): string {
  const names: Record<string, string> = {
    netWorth: "what you're worth",
    liquidNetWorth: "what you could reach quickly",
    monthlyCashFlow: "your monthly flow",
    reserveCoverage: "whether your reserve is funded",
    investableCash: "what's genuinely deployable",
    debtBurden: "what your debt costs you",
    portfolioAllocation: "how your holdings split",
    concentrationRisk: "whether anything is over-concentrated",
    currencyExposure: "your currency exposure",
    deploymentStatus: "whether to deploy at all",
    riskCapacity: "how much risk your structure supports",
  };
  return names[key] ?? key;
}
