import { emptyProfile, type IntakeProfile } from "@/domain/intake/types";

/**
 * What the client sends when saving a profile.
 *
 * Identity and lineage are excluded deliberately: `profileId`, `recordedAt` and
 * `supersedes` are assigned by the server. A client that could set them could
 * reorder history, and the order is the entire basis of drift detection.
 */
export type IntakeSubmission = Omit<
  IntakeProfile,
  "schemaVersion" | "subjectId" | "profileId" | "recordedAt" | "supersedes"
>;

const SERVER_ASSIGNED = ["schemaVersion", "subjectId", "profileId", "recordedAt", "supersedes"] as const;

export function emptySubmission(): IntakeSubmission {
  return toSubmission(emptyProfile("draft", "draft", new Date().toISOString()));
}

/** Strip the server-assigned fields so a loaded profile can be edited and re-saved. */
export function toSubmission(profile: IntakeProfile): IntakeSubmission {
  const draft = { ...profile } as Record<string, unknown>;
  for (const field of SERVER_ASSIGNED) delete draft[field];
  return draft as unknown as IntakeSubmission;
}
