import type {
  DecisionRecord,
  JournalRecord,
  OutcomeRecord,
  ReportStore,
  StoreHealth,
  StoredReportSummary,
} from "@/server/persistence/store";
import type { ReportEnvelope } from "@/server/types/report-envelope";

/**
 * In-memory store — the fallback when no database is configured.
 *
 * It exists so an unconfigured deployment still runs rather than crashing, and
 * so tests exercise the same interface the real store implements. It reports
 * `durable: false`, and the UI shows that: telling someone their decision
 * journal is safe when it lives in a serverless function's memory would be
 * worse than having no journal at all.
 *
 * On Vercel this survives roughly as long as one warm instance, which is to say
 * unpredictably and not long.
 */
export class MemoryReportStore implements ReportStore {
  private reports = new Map<string, ReportEnvelope>();
  private order: string[] = [];
  private journal: JournalRecord[] = [];
  private decisions: DecisionRecord[] = [];
  private outcomes: OutcomeRecord[] = [];

  async health(): Promise<StoreHealth> {
    return {
      kind: "memory",
      durable: false,
      reachable: true,
      detail:
        "No database is configured, so reports and journal entries are held in server memory and will be lost when the instance recycles. Set DATABASE_URL for durable storage.",
    };
  }

  async migrate(): Promise<void> {}

  async saveReport(envelope: ReportEnvelope): Promise<{ stored: boolean; reason: string }> {
    const id = envelope.content.reportId;
    if (this.reports.has(id)) {
      return { stored: false, reason: `Report ${id} already exists and was not overwritten.` };
    }
    this.reports.set(id, envelope);
    this.order.unshift(id);
    return { stored: true, reason: "Stored in memory. Not durable." };
  }

  async getReport(reportId: string): Promise<ReportEnvelope | null> {
    return this.reports.get(reportId) ?? null;
  }

  async getLatestReport(): Promise<ReportEnvelope | null> {
    const id = this.order[0];
    return id ? (this.reports.get(id) ?? null) : null;
  }

  async listReports(limit: number): Promise<StoredReportSummary[]> {
    return this.order
      .slice(0, limit)
      .map((id) => this.reports.get(id))
      .filter((e): e is ReportEnvelope => e !== undefined)
      .map((e) => ({
        reportId: e.content.reportId,
        runId: e.content.runId,
        generatedAt: e.content.generatedAt,
        liveState: e.content.liveState,
        executionContext: e.content.executionContext,
        priorReportId: e.content.priorReportId,
        signed: e.signature !== null,
      }));
  }

  async appendJournalEntry(entry: JournalRecord): Promise<void> {
    if (this.journal.some((e) => e.entryId === entry.entryId)) return;
    this.journal.unshift(entry);
  }

  async listJournal(limit: number): Promise<JournalRecord[]> {
    return this.journal.slice(0, limit);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    if (this.decisions.some((d) => d.decisionId === decision.decisionId)) return;
    this.decisions.unshift(decision);
  }

  async listDecisions(limit: number): Promise<DecisionRecord[]> {
    return this.decisions.slice(0, limit);
  }

  async saveOutcome(outcome: OutcomeRecord): Promise<void> {
    if (this.outcomes.some((o) => o.outcomeId === outcome.outcomeId)) return;
    this.outcomes.unshift(outcome);
  }

  async listOutcomes(limit: number): Promise<OutcomeRecord[]> {
    return this.outcomes.slice(0, limit);
  }

  async listDecisionsAwaitingReview(olderThan: string): Promise<DecisionRecord[]> {
    const reviewed = new Set(this.outcomes.map((o) => o.decisionId));
    return this.decisions.filter((d) => !reviewed.has(d.decisionId) && d.recordedAt <= olderThan);
  }
}
