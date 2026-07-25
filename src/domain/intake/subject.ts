import { subjectIdSchema, type SubjectId } from "@/domain/intake/types";

/**
 * Subject identity.
 *
 * There is exactly one subject today — the operator, building this for
 * themselves. Clients come later, if this proves itself first.
 *
 * The constant exists so that "one subject" is a value the code passes around
 * rather than an assumption it is built on. Every stored intake row carries a
 * subject column from the first migration, so adding a second subject is a
 * matter of writing a different id, not a rewrite of storage. Retrofitting
 * tenancy onto a single-tenant schema is the migration this avoids, and it is
 * cheap now and expensive later.
 *
 * See docs/PRODUCT_DEFINITION.md §6.
 */
export const SOLE_SUBJECT_ID: SubjectId = "subject-operator";

/**
 * Resolve the subject for a request.
 *
 * Today this ignores its input and returns the sole subject, because there is
 * no authentication and therefore nothing that could honestly identify a
 * second person. It is a named seam rather than a scattered constant: when
 * accounts exist, this is the one function that changes.
 */
export function resolveSubjectId(requested?: string | null): SubjectId {
  if (requested === undefined || requested === null || requested === SOLE_SUBJECT_ID) {
    return SOLE_SUBJECT_ID;
  }
  // Refusing rather than silently substituting. A request that names another
  // subject is either a bug or an attempt to read someone else's position, and
  // quietly serving the operator's data in response to either is worse than an
  // error.
  const parsed = subjectIdSchema.safeParse(requested);
  throw new Error(
    parsed.success
      ? `Subject ${requested} is not available. NeoOS currently serves a single subject.`
      : "Invalid subject identifier.",
  );
}
