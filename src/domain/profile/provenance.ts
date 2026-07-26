/**
 * Where every number came from.
 *
 * The requirement: Morpheus must distinguish known user facts, calculated
 * values, user assumptions, model assumptions, and missing information. That is
 * not a display concern. Once a number is rendered, a figure the subject typed
 * and a figure NeoOS guessed look identical, and the reader has no way back to
 * the difference. So provenance travels with the value, from the moment it is
 * computed to the moment it is shown.
 *
 * The rule that makes it work is the weakest-link rule below. Without it,
 * provenance decays quietly: one model assumption enters a chain of arithmetic
 * and the result is presented as a calculation, which is true and misleading at
 * the same time.
 */

/**
 * Ordered strongest to weakest. The order is load-bearing — `weakest()` depends
 * on it.
 */
export const provenanceKinds = [
  "user_fact",
  "calculated",
  "user_assumption",
  "model_assumption",
  "missing",
] as const;
export type ProvenanceKind = (typeof provenanceKinds)[number];

export const provenanceLabels: Record<ProvenanceKind, string> = {
  user_fact: "You told us",
  calculated: "Calculated from what you told us",
  user_assumption: "Your assumption",
  model_assumption: "NeoOS assumption",
  missing: "Not known",
};

/**
 * What each kind licenses.
 *
 * `model_assumption` is the dangerous one: it is the only kind NeoOS invents,
 * and it must never be presented as though the subject supplied it.
 */
export const provenanceMeaning: Record<ProvenanceKind, string> = {
  user_fact: "A figure you entered. NeoOS has not altered it.",
  calculated: "Arithmetic on figures you entered. No estimate involved.",
  user_assumption: "A forward-looking figure you supplied, such as an expected return or a future cost.",
  model_assumption: "A figure NeoOS supplied because you had not. Treat any conclusion resting on it as provisional.",
  missing: "Not known. NeoOS has not filled it in, and will not.",
};

const RANK: Record<ProvenanceKind, number> = {
  user_fact: 0,
  calculated: 1,
  user_assumption: 2,
  model_assumption: 3,
  missing: 4,
};

/**
 * A value with its provenance, the inputs behind it, and what was missing.
 *
 * `value` is null exactly when provenance is `missing`. The two are kept in step
 * by the constructors below rather than by convention.
 */
export interface Attributed<T> {
  value: T | null;
  provenance: ProvenanceKind;
  /** How it was arrived at, in words the subject can check. */
  basis: string;
  /** Which declared fields fed it. Empty for a bare fact. */
  inputs: string[];
  /** What was needed and absent. Non-empty means the answer is incomplete. */
  missing: string[];
}

export function userFact<T>(value: T, basis: string): Attributed<T> {
  return { value, provenance: "user_fact", basis, inputs: [], missing: [] };
}

export function calculated<T>(value: T, basis: string, inputs: string[]): Attributed<T> {
  return { value, provenance: "calculated", basis, inputs, missing: [] };
}

export function userAssumption<T>(value: T, basis: string, inputs: string[] = []): Attributed<T> {
  return { value, provenance: "user_assumption", basis, inputs, missing: [] };
}

export function modelAssumption<T>(value: T, basis: string, inputs: string[] = []): Attributed<T> {
  return { value, provenance: "model_assumption", basis, inputs, missing: [] };
}

/**
 * Not known.
 *
 * `missing` names the fields that would answer it. A missing value that does not
 * say what it needs is a dead end; one that does is the next question to ask.
 */
export function unknown<T>(basis: string, missing: string[]): Attributed<T> {
  return { value: null, provenance: "missing", basis, inputs: [], missing };
}

/** The weakest of the given kinds. */
export function weakest(kinds: ProvenanceKind[]): ProvenanceKind {
  return kinds.reduce<ProvenanceKind>(
    (worst, kind) => (RANK[kind] > RANK[worst] ? kind : worst),
    "user_fact",
  );
}

/**
 * Combine attributed inputs into a derived value.
 *
 * **A result is never stronger than its weakest input.** Arithmetic on a model
 * assumption produces a model assumption, not a calculation, however many
 * verified figures were involved — the uncertainty propagates through the
 * arithmetic even though the decimal places do not show it.
 *
 * Any missing input makes the result missing. Computing around a gap by
 * treating it as zero is how an incomplete position becomes a confident number.
 */
export function derive<T>(
  parts: Attributed<unknown>[],
  basis: string,
  compute: () => T,
): Attributed<T> {
  const missing = parts.flatMap((p) => (p.provenance === "missing" ? p.missing : []));
  if (missing.length > 0) {
    return unknown<T>(basis, [...new Set(missing)]);
  }

  const inputs = [...new Set(parts.flatMap((p) => (p.inputs.length > 0 ? p.inputs : [p.basis])))];
  const kind = weakest(parts.map((p) => p.provenance));
  return {
    value: compute(),
    // A chain of pure facts yields a calculation; anything softer keeps its
    // softness and says so.
    provenance: kind === "user_fact" ? "calculated" : kind,
    basis,
    inputs,
    missing: [],
  };
}

/** True when a value may be presented as a figure at all. */
export function isKnown<T>(attributed: Attributed<T>): boolean {
  return attributed.provenance !== "missing" && attributed.value !== null;
}

/** True when the value rests on something NeoOS invented rather than was told. */
export function restsOnModelAssumption<T>(attributed: Attributed<T>): boolean {
  return attributed.provenance === "model_assumption";
}

/**
 * Everything the subject would need to supply to make a set of values solid.
 *
 * The interface uses this to ask for the next most valuable input rather than
 * presenting an undifferentiated list of empty fields.
 */
export function outstandingInputs(values: Attributed<unknown>[]): string[] {
  return [...new Set(values.flatMap((v) => v.missing))].sort();
}
