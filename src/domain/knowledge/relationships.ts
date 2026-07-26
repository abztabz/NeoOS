/**
 * How two sources relate.
 *
 * The first version of the corpus modelled every difference as binary
 * disagreement, and that misrepresents most of the library. Buffett and Marks
 * differ in emphasis without contradicting each other. Graham and Dalio address
 * different analytical levels and largely do not meet. Taleb argues that
 * historical data is misused, not that it is worthless. Malkiel challenges
 * persistent active advantage after costs; that is not a proof that any
 * individual decision was luck.
 *
 * Flattening those into "one side / the other" produces a debate that does not
 * exist and hides the ones that do.
 */

export const relationshipKinds = [
  "agreement",
  "partial_agreement",
  "different_scope",
  "methodological_tension",
  "direct_contradiction",
  "unresolved_controversy",
] as const;
export type RelationshipKind = (typeof relationshipKinds)[number];

export const relationshipKindMeaning: Record<RelationshipKind, string> = {
  agreement: "Both reach the same conclusion by compatible reasoning.",
  partial_agreement: "They agree on the substance and differ on emphasis, degree or priority.",
  different_scope:
    "They address different questions, levels or horizons and do not actually meet. Treating them as opposed invents a conflict.",
  methodological_tension:
    "They would answer the same question by incompatible methods. The disagreement is about how to know, not about what is true.",
  direct_contradiction:
    "They make incompatible claims about the same question at the same scope. One of them is wrong.",
  unresolved_controversy:
    "The question is genuinely open in the literature. NeoOS presents both and concludes neither.",
};

/** Whether a relationship obliges NeoOS to present both sides together. */
export const REQUIRES_BOTH_SHOWN: Record<RelationshipKind, boolean> = {
  agreement: false,
  partial_agreement: false,
  different_scope: false,
  methodological_tension: true,
  direct_contradiction: true,
  unresolved_controversy: true,
};

/**
 * A modelled relationship.
 *
 * `scope` is what stops the map degenerating into slogans. Two sources may
 * agree about long-horizon index exposure and diverge sharply about a
 * concentrated position, and a relationship recorded without its scope reads as
 * a blanket verdict.
 */
export interface SourceRelationship {
  sourceA: string;
  sourceB: string;
  /** The question they are being compared on. Never "investing" in general. */
  topic: string;
  kind: RelationshipKind;
  /** Where the relationship holds, and by implication where it does not. */
  scope: string;
  /** Citations supporting the characterisation. Empty until verified. */
  citations: string[];
  /** What remains genuinely unclear about the comparison itself. */
  unresolvedAmbiguity: string | null;
}

/**
 * Whether a relationship is fit to be published.
 *
 * A relationship asserted without a citation is a claim about what two authors
 * think, which is exactly the sort of claim KNOWLEDGE_POLICY.md §3 forbids
 * making from recall. The map may be drafted before verification; it may not be
 * used in a briefing before it.
 */
export function isPublishable(relationship: SourceRelationship): boolean {
  return relationship.citations.length > 0;
}

/**
 * Relationships that oblige both sides to be shown for a given topic.
 *
 * The disconfirmation requirement uses this: when a briefing leans on one
 * source, this is what finds the counterpart it must also present.
 */
export function counterpartsFor(
  relationships: SourceRelationship[],
  sourceId: string,
  topic?: string,
): SourceRelationship[] {
  return relationships.filter(
    (r) =>
      (r.sourceA === sourceId || r.sourceB === sourceId) &&
      REQUIRES_BOTH_SHOWN[r.kind] &&
      (topic === undefined || r.topic === topic),
  );
}
