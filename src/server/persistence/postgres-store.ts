import { Pool, type PoolConfig, type QueryResultRow } from "pg";
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

export class PostgresReportStore implements ReportStore {
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
