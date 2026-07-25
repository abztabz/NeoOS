import { z } from "zod";

/**
 * Outcome review.
 *
 * Sprint 3 could record a decision but never revisit it, which makes a decision
 * journal a diary rather than a feedback loop. This closes it.
 *
 * The design rests on one distinction that most review processes collapse:
 * **a good decision and a good outcome are different things.** A well-reasoned
 * position can lose money to an event nobody could have known about, and a
 * reckless one can be rescued by luck. Grading process by result teaches the
 * wrong lesson in both directions — it punishes discipline after an unlucky
 * quarter and rewards carelessness after a lucky one.
 *
 * So a review records two independent judgements: what happened, and whether
 * the reasoning was sound given what was knowable at the time. They are stored
 * separately and never combined into one score.
 */

export const outcomeResults = [
  "worked_out",
  "worked_out_partially",
  "did_not_work_out",
  "too_early_to_tell",
  "not_acted_on",
] as const;
export type OutcomeResult = (typeof outcomeResults)[number];

export const outcomeResultLabels: Record<OutcomeResult, string> = {
  worked_out: "Worked out",
  worked_out_partially: "Partly worked out",
  did_not_work_out: "Did not work out",
  too_early_to_tell: "Too early to tell",
  not_acted_on: "Not acted on",
};

export const reasoningVerdicts = [
  "sound",
  "sound_but_lucky",
  "flawed_but_profitable",
  "flawed",
  "cannot_assess",
] as const;
export type ReasoningVerdict = (typeof reasoningVerdicts)[number];

export const reasoningVerdictLabels: Record<ReasoningVerdict, string> = {
  sound: "Reasoning was sound",
  sound_but_lucky: "Reasoning was sound; the result owed more to luck than to the analysis",
  flawed_but_profitable: "Reasoning was flawed; the result was better than the process deserved",
  flawed: "Reasoning was flawed",
  cannot_assess: "Not enough has happened to judge the reasoning",
};

/**
 * Why the result differed from the expectation.
 *
 * `unknowable_at_the_time` exists specifically so an honest review can conclude
 * that nothing was done wrong. Without that option every negative outcome gets
 * attributed to some fault, and the journal fills with fictitious lessons.
 */
export const attributions = [
  "thesis_correct",
  "thesis_wrong",
  "evidence_was_stale",
  "evidence_was_wrong",
  "unknowable_at_the_time",
  "execution_differed_from_plan",
  "position_size_wrong",
  "held_too_long",
  "sold_too_early",
] as const;
export type Attribution = (typeof attributions)[number];

/**
 * The minimum wait before a review means anything.
 *
 * A capital-allocation thesis measured after a fortnight measures noise, and a
 * journal full of premature verdicts trains exactly the short-termism the
 * system exists to counteract.
 */
export const MINIMUM_REVIEW_HORIZON_DAYS = 90;

export const outcomeReviewSchema = z.object({
  schemaVersion: z.literal("4.0"),
  outcomeId: z.string(),
  decisionId: z.string(),
  reviewedAt: z.iso.datetime({ offset: true }),
  /** What the engine recommended, copied at review time for the record. */
  recommendationSnapshot: z.string(),
  result: z.enum(outcomeResults),
  reasoningVerdict: z.enum(reasoningVerdicts),
  attributions: z.array(z.enum(attributions)),
  /** Prices, where the reviewer supplies them. NeoOS does not verify execution. */
  priceAtDecision: z.number().positive().nullable(),
  priceAtReview: z.number().positive().nullable(),
  currency: z.string().length(3).nullable(),
  /** What actually happened, in the reviewer's words. */
  whatHappened: z.string().min(1),
  /**
   * The lesson, if there is one. Optional on purpose: forcing a lesson out of
   * every review manufactures false patterns from ordinary variance.
   */
  lesson: z.string().nullable(),
  reviewedBy: z.string(),
});
export type OutcomeReview = z.infer<typeof outcomeReviewSchema>;

/** Simple return, when both prices are supplied. Never inferred from one. */
export function realisedReturnPercent(review: OutcomeReview): number | null {
  if (review.priceAtDecision === null || review.priceAtReview === null) return null;
  if (review.priceAtDecision <= 0) return null;
  return ((review.priceAtReview - review.priceAtDecision) / review.priceAtDecision) * 100;
}

export function reviewIsDue(decisionRecordedAt: string, now: Date): boolean {
  const recorded = Date.parse(decisionRecordedAt);
  if (Number.isNaN(recorded)) return false;
  return (now.getTime() - recorded) / 86_400_000 >= MINIMUM_REVIEW_HORIZON_DAYS;
}

export function reviewDueAt(decisionRecordedAt: string): string | null {
  const recorded = Date.parse(decisionRecordedAt);
  if (Number.isNaN(recorded)) return null;
  return new Date(recorded + MINIMUM_REVIEW_HORIZON_DAYS * 86_400_000).toISOString();
}

/**
 * Process quality across a set of reviews.
 *
 * Reported alongside the hit rate, never instead of it and never merged with
 * it. Two numbers that disagree are informative: a high hit rate with poor
 * process quality is a warning, and it is invisible if you only track one.
 */
export interface ProcessQuality {
  reviewed: number;
  soundReasoning: number;
  soundReasoningRate: number | null;
  workedOut: number;
  hitRate: number | null;
  /** Decisions that worked out despite flawed reasoning — the dangerous ones. */
  luckyWins: number;
  /** Sound calls that lost anyway — the ones worth defending. */
  unluckyLosses: number;
}

export function summariseProcessQuality(reviews: OutcomeReview[]): ProcessQuality {
  const assessable = reviews.filter(
    (r) => r.reasoningVerdict !== "cannot_assess" && r.result !== "too_early_to_tell",
  );
  const sound = assessable.filter(
    (r) => r.reasoningVerdict === "sound" || r.reasoningVerdict === "sound_but_lucky",
  );
  const won = assessable.filter(
    (r) => r.result === "worked_out" || r.result === "worked_out_partially",
  );

  return {
    reviewed: assessable.length,
    soundReasoning: sound.length,
    soundReasoningRate: assessable.length > 0 ? sound.length / assessable.length : null,
    workedOut: won.length,
    hitRate: assessable.length > 0 ? won.length / assessable.length : null,
    luckyWins: assessable.filter((r) => r.reasoningVerdict === "flawed_but_profitable").length,
    unluckyLosses: assessable.filter(
      (r) => r.reasoningVerdict === "sound" && r.result === "did_not_work_out",
    ).length,
  };
}
