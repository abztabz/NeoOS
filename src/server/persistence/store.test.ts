import { describe, expect, it } from "vitest";
import { MemoryReportStore } from "@/server/persistence/memory-store";
import type { DecisionRecord, JournalRecord, ReportStore } from "@/server/persistence/store";
import { PIPELINE_VERSION, REPORT_ENVELOPE_SCHEMA_VERSION, type ReportEnvelope } from "@/server/types/report-envelope";

/**
 * The storage contract.
 *
 * Written against the port rather than an implementation, so the Postgres store
 * can be dropped in behind it unchanged. Running it against a real database
 * requires a throwaway instance and is not part of the normal suite — a test
 * that needs a live server to pass is a test that fails for reasons unrelated
 * to the code.
 */

function envelope(reportId: string, priorReportId: string | null = null): ReportEnvelope {
  return {
    content: {
      schemaVersion: REPORT_ENVELOPE_SCHEMA_VERSION,
      reportId,
      runId: `run-${reportId}`,
      generatedAt: `2026-07-2${reportId.slice(-1)}T09:00:00.000Z`,
      evidenceCutoff: "2026-07-25T08:45:00.000Z",
      engineVersion: "2.0.0",
      pipelineVersion: PIPELINE_VERSION,
      executionContext: "server_live",
      providerVersions: [],
      dataModes: ["live"],
      liveState: "partial_live",
      assetLiveStates: [],
      priorReportId,
      report: { deploymentScore: 47.5 },
    },
    signature: null,
    verification: { status: "unsigned", checkedAt: null, detail: "" },
  };
}

function journalEntry(entryId: string, supersedes: string | null = null): JournalRecord {
  return {
    entryId,
    reportId: "report-1",
    recordedAt: "2026-07-25T10:00:00.000Z",
    kind: "report_generated",
    summary: `Entry ${entryId}`,
    payload: { note: "x" },
    supersedes,
    integrityHash: "abc123",
  };
}

function decision(decisionId: string, recordedAt: string): DecisionRecord {
  return {
    decisionId,
    reportId: "report-1",
    assetId: "apple",
    recordedAt,
    kind: "acted",
    payload: {},
  };
}

function contractTests(name: string, make: () => ReportStore) {
  describe(name, () => {
    it("reports whether it is actually durable", async () => {
      const health = await make().health();
      expect(typeof health.durable).toBe("boolean");
      expect(health.detail.length).toBeGreaterThan(20);
    });

    it("stores and retrieves a report", async () => {
      const store = make();
      const result = await store.saveReport(envelope("report-1"));
      expect(result.stored).toBe(true);
      const read = await store.getReport("report-1");
      expect(read?.content.reportId).toBe("report-1");
    });

    it("refuses to overwrite an existing report", async () => {
      const store = make();
      await store.saveReport(envelope("report-1"));
      const second = await store.saveReport({
        ...envelope("report-1"),
        content: { ...envelope("report-1").content, report: { deploymentScore: 99 } },
      });
      expect(second.stored).toBe(false);
      expect(second.reason).toMatch(/already exists/);
      const read = await store.getReport("report-1");
      expect((read?.content.report as { deploymentScore: number }).deploymentScore).toBe(47.5);
    });

    it("returns the most recent report", async () => {
      const store = make();
      await store.saveReport(envelope("report-1"));
      await store.saveReport(envelope("report-2", "report-1"));
      const latest = await store.getLatestReport();
      expect(latest?.content.reportId).toBe("report-2");
      expect(latest?.content.priorReportId).toBe("report-1");
    });

    it("returns null rather than throwing when nothing is stored", async () => {
      expect(await make().getLatestReport()).toBeNull();
      expect(await make().getReport("missing")).toBeNull();
    });

    it("summarises stored reports newest first", async () => {
      const store = make();
      await store.saveReport(envelope("report-1"));
      await store.saveReport(envelope("report-2", "report-1"));
      const list = await store.listReports(10);
      expect(list.map((r) => r.reportId)).toEqual(["report-2", "report-1"]);
      expect(list[0]?.signed).toBe(false);
    });

    it("appends journal entries and keeps the superseded original", async () => {
      const store = make();
      await store.appendJournalEntry(journalEntry("entry-1"));
      await store.appendJournalEntry(journalEntry("entry-2", "entry-1"));
      const journal = await store.listJournal(10);
      expect(journal).toHaveLength(2);
      // A correction adds a row; it never removes the row it corrects.
      expect(journal.some((e) => e.entryId === "entry-1")).toBe(true);
      expect(journal.find((e) => e.entryId === "entry-2")?.supersedes).toBe("entry-1");
    });

    it("ignores a repeated journal append rather than duplicating it", async () => {
      const store = make();
      await store.appendJournalEntry(journalEntry("entry-1"));
      await store.appendJournalEntry(journalEntry("entry-1"));
      expect(await store.listJournal(10)).toHaveLength(1);
    });

    it("stores decisions and outcomes separately", async () => {
      const store = make();
      await store.saveDecision(decision("decision-1", "2026-07-01T00:00:00.000Z"));
      await store.saveOutcome({
        outcomeId: "outcome-1",
        decisionId: "decision-1",
        reviewedAt: "2026-07-25T00:00:00.000Z",
        payload: { result: "worked out" },
      });
      expect(await store.listDecisions(10)).toHaveLength(1);
      expect(await store.listOutcomes(10)).toHaveLength(1);
    });

    it("lists only unreviewed decisions old enough to judge", async () => {
      const store = make();
      await store.saveDecision(decision("decision-old", "2026-04-01T00:00:00.000Z"));
      await store.saveDecision(decision("decision-recent", "2026-07-24T00:00:00.000Z"));
      await store.saveDecision(decision("decision-reviewed", "2026-04-01T00:00:00.000Z"));
      await store.saveOutcome({
        outcomeId: "outcome-1",
        decisionId: "decision-reviewed",
        reviewedAt: "2026-07-01T00:00:00.000Z",
        payload: {},
      });

      const queue = await store.listDecisionsAwaitingReview("2026-05-01T00:00:00.000Z");
      expect(queue.map((d) => d.decisionId)).toEqual(["decision-old"]);
    });
  });
}

contractTests("MemoryReportStore", () => new MemoryReportStore());

describe("MemoryReportStore honesty", () => {
  it("does not claim durability it cannot provide", async () => {
    const health = await new MemoryReportStore().health();
    expect(health.durable).toBe(false);
    expect(health.detail).toMatch(/will be lost/);
    expect(health.detail).toMatch(/DATABASE_URL/);
  });
});
