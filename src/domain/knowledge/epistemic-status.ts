/**
 * How a statement is known.
 *
 * Distinct from `ProvenanceKind` in profile/provenance.ts, and the two must not
 * be merged. Provenance answers *where a number came from*. This answers *what
 * standing a statement has* — and the case that forced it was a chain of
 * reasoning built on the subject's recollection of a legal rule, where every
 * step was sound and the conclusion still could not be relied on.
 *
 * The failure it prevents is specific and easy to miss. A subject says
 * "I cannot send much money out of Nepal". A correct inference follows:
 * capital there may be hard to deploy elsewhere. Written down without its
 * status, that inference reads as a fact about Nepali law, which nobody
 * established and which may be wrong or out of date. The reasoning was fine;
 * the labelling was not.
 */

/** Ordered from most to least externally grounded. */
export const epistemicStatuses = [
  "verified_external_fact",
  "governing_domain_rule",
  "subject_stated_fact",
  "calculated_consequence",
  "provisional_inference",
] as const;
export type EpistemicStatus = (typeof epistemicStatuses)[number];

export const epistemicStatusLabels: Record<EpistemicStatus, string> = {
  verified_external_fact: "Verified against an official source",
  governing_domain_rule: "Governing rule, as of a date",
  subject_stated_fact: "You told us",
  calculated_consequence: "Calculated from the above",
  provisional_inference: "Provisional inference — not established",
};

export const epistemicStatusMeaning: Record<EpistemicStatus, string> = {
  verified_external_fact:
    "Confirmed against a named official source with a resolvable citation and a retrieval date.",
  governing_domain_rule:
    "A law, regulation or rule that governs the position. Carries a jurisdiction and an as-of date, expires, and is always stated subject to verification. NeoOS identifies what to ask a professional; it does not conclude.",
  subject_stated_fact:
    "Something you told us. Recorded faithfully and used for planning. Not independently checked, and it may be out of date.",
  calculated_consequence:
    "Arithmetic on inputs above. No stronger than the weakest input it rests on.",
  provisional_inference:
    "A reasonable implication drawn from something unverified. It may be right and it is not established. Material allocation guidance may not depend on it until its inputs are verified.",
};

/**
 * Whether a statement at this status may carry material allocation guidance on
 * its own.
 *
 * `provisional_inference` is deliberately false. An inference from an unverified
 * premise can be perfectly reasoned and still wrong, and the reader has no way
 * to see the difference once it is rendered as a sentence.
 */
export const CARRIES_MATERIAL_GUIDANCE: Record<EpistemicStatus, boolean> = {
  verified_external_fact: true,
  governing_domain_rule: true,
  subject_stated_fact: true,
  calculated_consequence: true,
  provisional_inference: false,
};

/**
 * A statement with its standing, what would confirm it, and when it lapses.
 *
 * `evidenceRequired` and `reviewBy` are non-optional for the two weakest
 * statuses. A provisional inference with no stated route to confirmation is
 * indistinguishable from a fact after a few weeks, and that is exactly how an
 * unverified premise becomes load-bearing.
 */
export interface EpistemicStatement {
  statement: string;
  status: EpistemicStatus;
  /** What it rests on: subject answers, citations, or upstream statements. */
  restsOn: string[];
  /** What would move this to `verified_external_fact`. */
  evidenceRequired: string[];
  /** Date or condition after which it must be re-checked. Null only when it cannot lapse. */
  reviewBy: string | null;
  /** The planning implication, phrased so it cannot be read as settled. */
  planningImplication: string | null;
}

/**
 * The weakest status in a chain.
 *
 * An inference is never stronger than the premise it came from — the same
 * weakest-link rule as provenance, for the same reason. A verified fact
 * combined with a subject statement yields, at best, a subject statement's
 * worth of confidence.
 */
const RANK: Record<EpistemicStatus, number> = {
  verified_external_fact: 0,
  governing_domain_rule: 1,
  subject_stated_fact: 2,
  calculated_consequence: 3,
  provisional_inference: 4,
};

export function weakestStatus(statuses: EpistemicStatus[]): EpistemicStatus {
  return statuses.reduce<EpistemicStatus>(
    (worst, status) => (RANK[status] > RANK[worst] ? status : worst),
    "verified_external_fact",
  );
}

/**
 * Derive a statement from others.
 *
 * Anything drawn from a `subject_stated_fact` becomes a `provisional_inference`
 * rather than inheriting the subject's status. That is the deliberate downgrade:
 * the subject reporting their own position is one thing, and a conclusion about
 * what the law permits drawn from that report is another.
 */
export function inferFrom(
  premises: EpistemicStatement[],
  statement: string,
  options: { evidenceRequired: string[]; reviewBy: string | null; planningImplication: string },
): EpistemicStatement {
  const weakest = weakestStatus(premises.map((p) => p.status));
  const status: EpistemicStatus =
    weakest === "verified_external_fact" || weakest === "governing_domain_rule"
      ? "calculated_consequence"
      : "provisional_inference";

  return {
    statement,
    status,
    restsOn: premises.map((p) => p.statement),
    evidenceRequired: [...new Set([...options.evidenceRequired, ...premises.flatMap((p) => p.evidenceRequired)])],
    reviewBy: options.reviewBy,
    planningImplication: options.planningImplication,
  };
}

/**
 * Whether a statement is fit to be rendered without a qualifier.
 *
 * Returns the qualifier that must accompany it, or null when none is needed.
 * The interface calls this rather than deciding for itself, so a new surface
 * cannot quietly present a provisional inference as a finding.
 */
export function requiredQualifier(statement: EpistemicStatement): string | null {
  switch (statement.status) {
    case "provisional_inference":
      return "Provisional. Based on your current unverified understanding, and not confirmed against an official source.";
    case "subject_stated_fact":
      return "As stated by you, not independently verified.";
    case "governing_domain_rule":
      return statement.reviewBy
        ? `As of ${statement.reviewBy}, subject to verification.`
        : "Subject to verification.";
    case "calculated_consequence":
    case "verified_external_fact":
      return null;
  }
}
