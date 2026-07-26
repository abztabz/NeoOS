import { fnv1a64, stableStringify } from "@/engine/hash";
import type { IntakeProfile, SubjectId } from "@/domain/intake/types";

/**
 * Durable storage for the subject's declared position.
 *
 * Separate port from `ReportStore` because it holds a different kind of thing.
 * A report is something NeoOS produced and signed; a profile is something the
 * subject asserted. Both implementations happen to satisfy both ports over the
 * same connection, which keeps one pool without pretending the two are the same
 * concern.
 *
 * The append-only rule is the same, and it matters more here, not less.
 *
 * A correction to a financial position is itself information. "The flat was
 * revalued down by a third in March" is a fact about the position that a store
 * permitting updates would silently destroy. Every change writes a new profile
 * naming the one it supersedes; nothing is ever edited in place, and nothing is
 * removed. That is what makes drift detectable — see MORPHEUS_CHARACTER.md §6.
 *
 * Every row is scoped to a subject from the first migration, even though there
 * is exactly one subject today. See src/domain/intake/subject.ts.
 */

export interface StoredProfileSummary {
  profileId: string;
  subjectId: SubjectId;
  recordedAt: string;
  supersedes: string | null;
  /** True when a later profile names this one as the version it replaces. */
  superseded: boolean;
  incomeSourceCount: number;
  assetCount: number;
  liabilityCount: number;
  dependentCount: number;
  /** Hash of the stored profile. Detects an edit made outside the application. */
  integrityHash: string;
}

export interface IntakeStore {
  /**
   * Create tables if absent. Safe to call on every cold start, and every route
   * does — a serverless instance may be the first to touch a fresh database.
   */
  migrate(): Promise<void>;

  /**
   * Append a profile version.
   *
   * Writing an existing `profileId` is a no-op, not an overwrite — a retried
   * form submission must not be able to rewrite a declared position.
   */
  saveProfile(profile: IntakeProfile): Promise<{ stored: boolean; reason: string }>;

  /**
   * The subject's position as it currently stands: the most recent profile that
   * no later profile has superseded. Null when the subject has declared
   * nothing, which is a real state and not an error.
   */
  getCurrentProfile(subjectId: SubjectId): Promise<IntakeProfile | null>;

  getProfile(subjectId: SubjectId, profileId: string): Promise<IntakeProfile | null>;

  /** Every version, newest first. The history is the point. */
  listProfileHistory(subjectId: SubjectId, limit: number): Promise<StoredProfileSummary[]>;
}

/**
 * Content hash of a profile.
 *
 * Key-order independent, so a profile re-serialised by a different JSON writer
 * still hashes the same. Shared by both implementations so a profile written by
 * one and read by the other compares equal.
 */
export function profileIntegrityHash(profile: IntakeProfile): string {
  return fnv1a64(stableStringify(profile));
}

export function summariseProfile(profile: IntakeProfile, superseded: boolean): StoredProfileSummary {
  return {
    profileId: profile.profileId,
    subjectId: profile.subjectId,
    recordedAt: profile.recordedAt,
    supersedes: profile.supersedes,
    superseded,
    incomeSourceCount: profile.incomeSources.length,
    assetCount: profile.assets.length,
    liabilityCount: profile.liabilities.length,
    dependentCount: profile.household.dependents.length,
    integrityHash: profileIntegrityHash(profile),
  };
}
