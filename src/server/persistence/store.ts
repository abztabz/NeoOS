import type { ReportEnvelope } from "@/server/types/report-envelope";

/**
 * The durable-storage port.
 *
 * Sprint 3 stored everything in the browser, which meant a decision journal
 * that vanished with a cleared cache and could be edited by anyone with the
 * developer console open. This interface is the seam that fixes both, and it is
 * deliberately narrow: every method is append or read. There is no update and
 * no delete, because a decision journal that can be rewritten is not a record
 * of anything.
 *
 * Two implementations exist. `MemoryReportStore` is the fallback when no
 * database is configured — it keeps the application working and says plainly
 * that nothing is durable. `PostgresReportStore` is the real one.
 */

export interface StoredReportSummary {
  reportId: string;
  runId: string;
  generatedAt: string;
  liveState: string;
  executionContext: string;
  priorReportId: string | null;
  signed: boolean;
}

export interface JournalRecord {
  entryId: string;
  reportId: string | null;
  recordedAt: string;
  kind: string;
  summary: string;
  /** Opaque payload. The store never interprets it. */
  payload: unknown;
  /** Entry this one corrects. The original is never removed. */
  supersedes: string | null;
  integrityHash: string;
}

export interface DecisionRecord {
  decisionId: string;
  reportId: string | null;
  assetId: string | null;
  recordedAt: string;
  kind: string;
  payload: unknown;
}

export interface OutcomeRecord {
  outcomeId: string;
  decisionId: string;
  reviewedAt: string;
  payload: unknown;
}

export interface StoreHealth {
  kind: "memory" | "postgres";
  /** False for the memory store. Surfaced in the UI, never assumed. */
  durable: boolean;
  reachable: boolean;
  detail: string;
}

export interface ReportStore {
  health(): Promise<StoreHealth>;
  /** Create tables if absent. Safe to call on every cold start. */
  migrate(): Promise<void>;

  /**
   * Persist a report. Writing an existing reportId is a no-op rather than an
   * overwrite: a signed artefact that can be replaced in place is not evidence
   * of anything.
   */
  saveReport(envelope: ReportEnvelope): Promise<{ stored: boolean; reason: string }>;
  getReport(reportId: string): Promise<ReportEnvelope | null>;
  getLatestReport(): Promise<ReportEnvelope | null>;
  listReports(limit: number): Promise<StoredReportSummary[]>;

  appendJournalEntry(entry: JournalRecord): Promise<void>;
  listJournal(limit: number): Promise<JournalRecord[]>;

  saveDecision(decision: DecisionRecord): Promise<void>;
  listDecisions(limit: number): Promise<DecisionRecord[]>;

  saveOutcome(outcome: OutcomeRecord): Promise<void>;
  listOutcomes(limit: number): Promise<OutcomeRecord[]>;
  /** Decisions with no outcome recorded yet — the review queue. */
  listDecisionsAwaitingReview(olderThan: string): Promise<DecisionRecord[]>;
}
