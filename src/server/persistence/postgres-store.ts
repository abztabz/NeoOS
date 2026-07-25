import { Pool, type PoolConfig, type QueryResultRow } from "pg";
import { intakeProfileSchema, type IntakeProfile, type SubjectId } from "@/domain/intake/types";
import {
  profileIntegrityHash,
  summariseProfile,
  type IntakeStore,
  type StoredProfileSummary,
} from "@/server/persistence/intake-store";
import { reportEnvelopeSchema, type ReportEnvelope } from "@/server/types/report-envelope";
import type {
  DecisionRecord,
  JournalRecord,
  OutcomeRecord,
  ReportStore,
  StoreHealth,
  StoredReportSummary,
} from "@/server/persistence/store";

/**
 * PostgreSQL implementation of the storage port.
 *
 * Written against plain Postgres, so it works with Supabase, Neon, RDS, or a
 * local instance without change. Every write is `ON CONFLICT DO NOTHING`: the
 * tables are append-only by design (see schema.sql), and a re-run that tries to
 * store the same report must be a silent no-op rather than an overwrite or an
 * error, because a scheduled job retried after a timeout should not fail on its
 * own success.
 *
 * Rows are validated on the way back out. A report read from the database is
 * treated as untrusted input, not as something the application put there — the
 * whole point of signing it is that storage is not part of the trust boundary.
 */

const DEFAULT_POOL: Partial<PoolConfig> = {
  // Serverless invocations are short-lived and numerous; a large pool per
  // instance exhausts the database's connection limit rather than helping.
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
};

export class PostgresReportStore implements ReportStore, IntakeStore {
  private readonly pool: Pool;
  private migrated = false;

  constructor(
    connectionString: string,
    private readonly migrationSql: string,
    poolOverrides: Partial<PoolConfig> = {},
  ) {
    this.pool = new Pool({
      connectionString,
      // Managed providers terminate TLS with their own chain; verification is
      // handled by the connection string's sslmode rather than disabled here.
      ...DEFAULT_POOL,
      ...poolOverrides,
    });
  }

  async health(): Promise<StoreHealth> {
    try {
      await this.pool.query("SELECT 1");
      return {
        kind: "postgres",
        durable: true,
        reachable: true,
        detail: "Connected. Reports, journal entries, decisions, and outcomes are stored durably.",
      };
    } catch (error) {
      return {
        kind: "postgres",
        durable: true,
        reachable: false,
        detail: `Database unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async migrate(): Promise<void> {
    if (this.migrated) return;
    await this.pool.query(this.migrationSql);
    this.migrated = true;
  }

  async saveReport(envelope: ReportEnvelope): Promise<{ stored: boolean; reason: string }> {
    const c = envelope.content;
    const result = await this.pool.query(
      `INSERT INTO reports (
         report_id, run_id, generated_at, evidence_cutoff, live_state, execution_context,
         prior_report_id, engine_version, pipeline_version, content, signature,
         content_hash, signing_key_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (report_id) DO NOTHING`,
      [
        c.reportId,
        c.runId,
        c.generatedAt,
        c.evidenceCutoff,
        c.liveState,
        c.executionContext,
        c.priorReportId,
        c.engineVersion,
        c.pipelineVersion,
        JSON.stringify(c),
        envelope.signature ? JSON.stringify(envelope.signature) : null,
        envelope.signature?.contentHash ?? null,
        envelope.signature?.keyId ?? null,
      ],
    );
    return result.rowCount === 1
      ? { stored: true, reason: "Stored." }
      : {
          stored: false,
          reason: `Report ${c.reportId} already exists. Stored reports are immutable and are never overwritten.`,
        };
  }

  async getReport(reportId: string): Promise<ReportEnvelope | null> {
    const { rows } = await this.pool.query<EnvelopeRow>(
      "SELECT content, signature FROM reports WHERE report_id = $1",
      [reportId],
    );
    return rows[0] ? toEnvelope(rows[0]) : null;
  }

  async getLatestReport(): Promise<ReportEnvelope | null> {
    const { rows } = await this.pool.query<EnvelopeRow>(
      "SELECT content, signature FROM reports ORDER BY generated_at DESC LIMIT 1",
    );
    return rows[0] ? toEnvelope(rows[0]) : null;
  }

  async listReports(limit: number): Promise<StoredReportSummary[]> {
    const { rows } = await this.pool.query<SummaryRow>(
      `SELECT report_id, run_id, generated_at, live_state, execution_context,
              prior_report_id, (signature IS NOT NULL) AS signed
         FROM reports ORDER BY generated_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      reportId: r.report_id,
      runId: r.run_id,
      generatedAt: new Date(r.generated_at).toISOString(),
      liveState: r.live_state,
      executionContext: r.execution_context,
      priorReportId: r.prior_report_id,
      signed: r.signed,
    }));
  }

  async appendJournalEntry(entry: JournalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO journal_entries (entry_id, report_id, recorded_at, kind, summary, payload, supersedes, integrity_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (entry_id) DO NOTHING`,
      [
        entry.entryId,
        entry.reportId,
        entry.recordedAt,
        entry.kind,
        entry.summary,
        JSON.stringify(entry.payload),
        entry.supersedes,
        entry.integrityHash,
      ],
    );
  }

  async listJournal(limit: number): Promise<JournalRecord[]> {
    const { rows } = await this.pool.query<JournalRow>(
      `SELECT entry_id, report_id, recorded_at, kind, summary, payload, supersedes, integrity_hash
         FROM journal_entries ORDER BY recorded_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      entryId: r.entry_id,
      reportId: r.report_id,
      recordedAt: new Date(r.recorded_at).toISOString(),
      kind: r.kind,
      summary: r.summary,
      payload: r.payload,
      supersedes: r.supersedes,
      integrityHash: r.integrity_hash,
    }));
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO decisions (decision_id, report_id, asset_id, recorded_at, kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (decision_id) DO NOTHING`,
      [
        decision.decisionId,
        decision.reportId,
        decision.assetId,
        decision.recordedAt,
        decision.kind,
        JSON.stringify(decision.payload),
      ],
    );
  }

  async listDecisions(limit: number): Promise<DecisionRecord[]> {
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT decision_id, report_id, asset_id, recorded_at, kind, payload
         FROM decisions ORDER BY recorded_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toDecision);
  }

  async saveOutcome(outcome: OutcomeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO outcomes (outcome_id, decision_id, reviewed_at, payload)
       VALUES ($1,$2,$3,$4) ON CONFLICT (outcome_id) DO NOTHING`,
      [outcome.outcomeId, outcome.decisionId, outcome.reviewedAt, JSON.stringify(outcome.payload)],
    );
  }

  async listOutcomes(limit: number): Promise<OutcomeRecord[]> {
    const { rows } = await this.pool.query<OutcomeRow>(
      `SELECT outcome_id, decision_id, reviewed_at, payload
         FROM outcomes ORDER BY reviewed_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      outcomeId: r.outcome_id,
      decisionId: r.decision_id,
      reviewedAt: new Date(r.reviewed_at).toISOString(),
      payload: r.payload,
    }));
  }

  async listDecisionsAwaitingReview(olderThan: string): Promise<DecisionRecord[]> {
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT d.decision_id, d.report_id, d.asset_id, d.recorded_at, d.kind, d.payload
         FROM decisions d
    LEFT JOIN outcomes o ON o.decision_id = d.decision_id
        WHERE o.outcome_id IS NULL AND d.recorded_at <= $1
     ORDER BY d.recorded_at ASC`,
      [olderThan],
    );
    return rows.map(toDecision);
  }

  /* ---------------- intake ---------------- */

  async saveProfile(profile: IntakeProfile): Promise<{ stored: boolean; reason: string }> {
    if (profile.supersedes !== null) {
      const { rows } = await this.pool.query<{ subject_id: string }>(
        "SELECT subject_id FROM intake_profiles WHERE profile_id = $1",
        [profile.supersedes],
      );
      const target = rows[0];
      if (!target) {
        return {
          stored: false,
          reason: `Profile ${profile.supersedes} was not found, so this correction has nothing to correct.`,
        };
      }
      if (target.subject_id !== profile.subjectId) {
        return { stored: false, reason: "A profile may only supersede another profile of the same subject." };
      }
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO intake_profiles (
           profile_id, subject_id, schema_version, recorded_at, supersedes, content, integrity_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (profile_id) DO NOTHING`,
        [
          profile.profileId,
          profile.subjectId,
          profile.schemaVersion,
          profile.recordedAt,
          profile.supersedes,
          JSON.stringify(profile),
          profileIntegrityHash(profile),
        ],
      );
      return result.rowCount === 1
        ? { stored: true, reason: "Stored." }
        : {
            stored: false,
            reason: `Profile ${profile.profileId} already exists. Declared positions are never overwritten; record a correction instead.`,
          };
    } catch (error) {
      // The unique index on `supersedes` is what stops two corrections claiming
      // to replace the same version, which would leave the current position
      // ambiguous. Report it as the conflict it is rather than as a crash.
      if (isUniqueViolation(error)) {
        return {
          stored: false,
          reason: `Profile ${profile.supersedes} has already been superseded. Correct the current version instead.`,
        };
      }
      throw error;
    }
  }

  async getCurrentProfile(subjectId: SubjectId): Promise<IntakeProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `SELECT p.content, p.integrity_hash
         FROM intake_profiles p
        WHERE p.subject_id = $1
          AND NOT EXISTS (SELECT 1 FROM intake_profiles q WHERE q.supersedes = p.profile_id)
        ORDER BY p.recorded_at DESC, p.stored_at DESC
        LIMIT 1`,
      [subjectId],
    );
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async getProfile(subjectId: SubjectId, profileId: string): Promise<IntakeProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      "SELECT content, integrity_hash FROM intake_profiles WHERE subject_id = $1 AND profile_id = $2",
      [subjectId, profileId],
    );
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async listProfileHistory(subjectId: SubjectId, limit: number): Promise<StoredProfileSummary[]> {
    const { rows } = await this.pool.query<ProfileRow & { superseded: boolean }>(
      `SELECT p.content, p.integrity_hash,
              EXISTS (SELECT 1 FROM intake_profiles q WHERE q.supersedes = p.profile_id) AS superseded
         FROM intake_profiles p
        WHERE p.subject_id = $1
        ORDER BY p.recorded_at DESC, p.stored_at DESC
        LIMIT $2`,
      [subjectId, limit],
    );
    return rows.map((r) => summariseProfile(toProfile(r), r.superseded));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface EnvelopeRow extends QueryResultRow {
  content: unknown;
  signature: unknown;
}
interface SummaryRow extends QueryResultRow {
  report_id: string;
  run_id: string;
  generated_at: string;
  live_state: string;
  execution_context: string;
  prior_report_id: string | null;
  signed: boolean;
}
interface JournalRow extends QueryResultRow {
  entry_id: string;
  report_id: string | null;
  recorded_at: string;
  kind: string;
  summary: string;
  payload: unknown;
  supersedes: string | null;
  integrity_hash: string;
}
interface DecisionRow extends QueryResultRow {
  decision_id: string;
  report_id: string | null;
  asset_id: string | null;
  recorded_at: string;
  kind: string;
  payload: unknown;
}
interface OutcomeRow extends QueryResultRow {
  outcome_id: string;
  decision_id: string;
  reviewed_at: string;
  payload: unknown;
}

interface ProfileRow extends QueryResultRow {
  content: unknown;
  integrity_hash: string;
}

/** PostgreSQL unique_violation. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * Rebuild a profile from storage.
 *
 * Two checks, both of which throw rather than degrade. A profile that no longer
 * parses, or whose content no longer matches the hash written with it, has been
 * changed outside the application. Serving it anyway would put an unverified
 * financial position into every number downstream, which is the one thing this
 * system exists not to do.
 */
function toProfile(row: ProfileRow): IntakeProfile {
  const parsed = intakeProfileSchema.safeParse(row.content);
  if (!parsed.success) {
    throw new Error(
      `A stored intake profile does not match the schema: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  const actual = profileIntegrityHash(parsed.data);
  if (actual !== row.integrity_hash) {
    throw new Error(
      `Stored intake profile ${parsed.data.profileId} does not match its integrity hash. It was modified outside NeoOS and is not being used.`,
    );
  }
  return parsed.data;
}

function toDecision(r: DecisionRow): DecisionRecord {
  return {
    decisionId: r.decision_id,
    reportId: r.report_id,
    assetId: r.asset_id,
    recordedAt: new Date(r.recorded_at).toISOString(),
    kind: r.kind,
    payload: r.payload,
  };
}

/**
 * Rebuild an envelope from storage, validating as it goes.
 *
 * A row that no longer parses is a corrupt row, and returning it half-formed
 * would put unvalidated data into the render path. Throwing surfaces it.
 */
function toEnvelope(row: EnvelopeRow): ReportEnvelope {
  const parsed = reportEnvelopeSchema.safeParse({
    content: row.content,
    signature: row.signature ?? null,
    verification: { status: "not_checked", checkedAt: null, detail: "Not yet verified." },
  });
  if (!parsed.success) {
    throw new Error(
      `A stored report does not match the envelope schema: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}
