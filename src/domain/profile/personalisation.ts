import { assessCompleteness, type CompletenessAssessment } from "@/domain/intake/assessment";
import type { IntakeProfile } from "@/domain/intake/types";
import { calculateProfile, type ProfileCalculations } from "@/domain/profile/calculations";
import { outstandingInputs, type Attributed } from "@/domain/profile/provenance";

/**
 * Whether personal guidance may be given at all, and how it must be labelled.
 *
 * The requirement is explicit: until intake is sufficiently complete, personal
 * guidance is labelled unavailable or provisional. This module is the single
 * place that decides which, so no surface can quietly present a general view as
 * advice about the subject's capital.
 *
 * The gate is deliberately hard to pass. Presenting an answer as personal when
 * it rests on model assumptions is the specific failure that makes a system
 * like this dangerous rather than merely unhelpful.
 */

export const personalisationStates = ["unavailable", "provisional", "available"] as const;
export type PersonalisationState = (typeof personalisationStates)[number];

export const personalisationLabels: Record<PersonalisationState, string> = {
  unavailable: "Personal guidance unavailable",
  provisional: "Provisional — parts of this rest on assumptions, not your figures",
  available: "Personal — grounded in your declared position",
};

export const personalisationMeaning: Record<PersonalisationState, string> = {
  unavailable:
    "NeoOS does not know enough about your position to say anything about your capital. What you see is a general view and is not advice about your money.",
  provisional:
    "Enough is known to be directionally useful, but some figures rest on assumptions NeoOS supplied rather than facts you gave. Treat conclusions as provisional and check what is marked.",
  available:
    "Every figure below traces to something you declared or to arithmetic on it. Assumptions, where any remain, are marked individually.",
};

/**
 * How many of the required outputs must be computable before guidance can be
 * called provisional rather than unavailable.
 *
 * Below this, the picture has too many holes for a direction to mean anything.
 */
export const PROVISIONAL_MINIMUM_OUTPUTS = 5;

/** Outputs that must be computable and free of model assumptions to reach `available`. */
export const CORE_OUTPUTS = [
  "netWorth",
  "monthlyCashFlow",
  "reserveCoverage",
  "investableCash",
  "deploymentStatus",
] as const;

export interface PersonalisationAssessment {
  state: PersonalisationState;
  label: string;
  meaning: string;
  completeness: CompletenessAssessment;
  /** Outputs that could be computed at all. */
  computed: string[];
  /** Outputs that could not, with what each needs. */
  uncomputable: { output: string; needs: string[] }[];
  /** Computed outputs that rest on something NeoOS supplied rather than was told. */
  restingOnAssumptions: string[];
  /** The next inputs worth asking for, most valuable first. */
  nextInputs: string[];
}

export function assessPersonalisation(
  profile: IntakeProfile,
  calculations: ProfileCalculations = calculateProfile(profile),
): PersonalisationAssessment {
  const completeness = assessCompleteness(profile);
  const entries = Object.entries(calculations) as [string, Attributed<unknown>][];

  const computed = entries.filter(([, a]) => a.value !== null).map(([name]) => name);
  const uncomputable = entries
    .filter(([, a]) => a.value === null)
    .map(([output, a]) => ({ output, needs: a.missing }));
  const restingOnAssumptions = entries
    .filter(([, a]) => a.provenance === "model_assumption" || a.provenance === "user_assumption")
    .map(([name]) => name);

  const coreComputed = CORE_OUTPUTS.every((name) => calculations[name].value !== null);
  const coreClean = CORE_OUTPUTS.every(
    (name) => calculations[name].provenance !== "model_assumption",
  );

  // `available` needs three things at once: no blocking gap in intake, every
  // core output computable, and no core output resting on a NeoOS assumption.
  // Any one of them failing makes the answer provisional at best — the whole
  // point is that a confident presentation must be earned, not defaulted to.
  const state: PersonalisationState =
    completeness.level === "personal" && coreComputed && coreClean
      ? "available"
      : computed.length >= PROVISIONAL_MINIMUM_OUTPUTS && completeness.level !== "general"
        ? "provisional"
        : "unavailable";

  return {
    state,
    label: personalisationLabels[state],
    meaning: personalisationMeaning[state],
    completeness,
    computed,
    uncomputable,
    restingOnAssumptions,
    nextInputs: rankInputs(
      outstandingInputs(entries.map(([, a]) => a)),
      completeness,
    ),
  };
}

/**
 * Order the outstanding inputs by what they unlock.
 *
 * A flat list of empty fields is a chore. A list that leads with the one input
 * unblocking the most is a conversation, and it is the difference between an
 * intake form people finish and one they abandon halfway.
 */
function rankInputs(outstanding: string[], completeness: CompletenessAssessment): string[] {
  const blocking = completeness.missing.filter((m) => m.severity === "blocking").map((m) => m.field);
  const limiting = completeness.missing.filter((m) => m.severity === "limiting").map((m) => m.field);
  const weight = (field: string): number => {
    if (blocking.some((b) => field.startsWith(b))) return 0;
    if (limiting.some((l) => field.startsWith(l))) return 1;
    if (field.startsWith("objective.exchangeRatesToBase")) return 1;
    return 2;
  };
  return [...new Set([...blocking, ...limiting, ...outstanding])].sort(
    (a, b) => weight(a) - weight(b) || (a < b ? -1 : 1),
  );
}
