// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PostgresReportStore } from "@/server/persistence/postgres-store";
import { PIPELINE_VERSION, REPORT_ENVELOPE_SCHEMA_VERSION, type ReportEnvelope } from "@/server/types/report-envelope";

/**
 * The Postgres store against a real database.
 *
 * Skipped unless `TEST_DATABASE_URL` points at a throwaway instance, because a
 * suite that needs a running server fails for reasons unrelated to the code.
 * When it is set, this is the only thing that exercises the SQL — the memory
 * store proves the contract, not the queries.
 *
 * Run it with:
 *   TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/db npx vitest run postgres-store
 */

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

function envelope(reportId: string, priorReportId: string | null = null, signed = false): ReportEnvelope {
  return {
    content: {
      schemaVersion: REPORT_ENVELOPE_SCHEMA_VERSION,
      reportId,
      runId: `run-${reportId}`,
      generatedAt: new Date(Date.parse("2026-07-25T09:00:00.000Z") + reportId.length * 60_000).toISOString(),
      evidenceCutoff: "2026-07-25T08:45:00.000Z",
      engineVersion: "2.0.0",
      pipelineVersion: PIPELINE_VERSION,
      executionContext: "server_live",
      providerVersions: [
        {
          providerId: "sec-edgar",
          providerName: "EDGAR",
          adapterVersion: "1.0.0",
          mode: "live",
          sourceVersion: null,
          recordsContributed: 14,
        },
      ],
      dataModes: ["live"],
      liveState: "partial_live",
      assetLiveStates: [
        {
          assetId: "apple",
          state: "partial_live",
          contributingProviders: ["sec-edgar"],
          lastRetrievedAt: "2026-07-25T09:00:00.000Z",
          filingAgeDays: 30,
          quoteAgeMinutes: null,
          quoteTimeliness: null,
          marketStatus: null,
          missingInputs: ["current market price"],
          blockingConflicts: [],
          reason: "Live evidence retrieved, but current market price still missing.",
        },
      ],
      priorReportId,
      report: { engine: { metadata: { engineVersion: "2.0.0" } }, deploymentScore: 47.5 },
    },
    signature: signed
      ? {
          signatureVersion: "ed25519-v1",
          signature: "c2lnbmF0dXJl",
          keyId: "ed25519-abcdef0123456789",
          signedAt: "2026-07-25T09:00:01.000Z",
          contentHash: "a".repeat(64),
        }
      : null,
    verification: { status: signed ? "not_checked" : "unsigned", checkedAt: null, detail: "" },
  };
}

suite("PostgresReportStore against a real database", () => {
  const store = new PostgresReportStore(URL!, readFileSync(join(process.cwd(), "src/server/persistence/schema.sql"), "utf8"));

  beforeAll(async () => {
    await store.migrate();
    // Truncate rather than drop: proves the schema survives reuse, which is
    // what a serverless cold start actually does to it.
    await store["pool"].query(
      "TRUNCATE outcomes, decisions, journal_entries, reports RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await store.close();
  });

  it("connects and reports itself durable", async () => {
    const health = await store.health();
    expect(health.kind).toBe("postgres");
    expect(health.durable).toBe(true);
    expect(health.reachable).toBe(true);
  });

  it("is safe to migrate repeatedly, as every cold start does", async () => {
    await expect(store.migrate()).resolves.toBeUndefined();
  });

  it("round-trips a report through JSONB without losing structure", async () => {
    const result = await store.saveReport(envelope("report-a"));
    expect(result.stored).toBe(true);

    const read = await store.getReport("report-a");
    expect(read?.content.reportId).toBe("report-a");
    // Nested engine report, arrays, and nulls all survive the JSONB round trip.
    expect((read?.content.report as { deploymentScore: number }).deploymentScore).toBe(47.5);
    expect(read?.content.assetLiveStates[0]?.missingInputs).toEqual(["current market price"]);
    expect(read?.content.priorReportId).toBeNull();
  });

  it("preserves a signature block verbatim", async () => {
    await store.saveReport(envelope("report-signed", null, true));
    const read = await store.getReport("report-signed");
    expect(read?.signature?.keyId).toBe("ed25519-abcdef0123456789");
    expect(read?.signature?.contentHash).toHaveLength(64);
  });

  it("refuses to overwrite an existing report", async () => {
    const modified = envelope("report-a");
    modified.content.report = { deploymentScore: 99 };
    const second = await store.saveReport(modified);
    expect(second.stored).toBe(false);
    expect(second.reason).toMatch(/immutable/);

    const read = await store.getReport("report-a");
    expect((read?.content.report as { deploymentScore: number }).deploymentScore).toBe(47.5);
  });

  it("returns timestamps as ISO strings, not Date objects", async () => {
    const list = await store.listReports(10);
    expect(typeof list[0]?.generatedAt).toBe("string");
    expect(list[0]?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("orders reports newest first and reports signed state", async () => {
    const list = await store.listReports(10);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const generated = list.map((r) => r.generatedAt);
    expect([...generated].sort().reverse()).toEqual(generated);
    expect(list.some((r) => r.signed)).toBe(true);
  });

  it("honours the lineage foreign key", async () => {
    await store.saveReport(envelope("report-child", "report-a"));
    const child = await store.getReport("report-child");
    expect(child?.content.priorReportId).toBe("report-a");
  });

  it("rejects a lineage pointing at a report that does not exist", async () => {
    // The foreign key is the point: a lineage that references a missing parent
    // is a broken audit trail, and failing loudly beats storing it.
    await expect(store.saveReport(envelope("report-orphan", "report-does-not-exist"))).rejects.toThrow();
  });

  it("appends journal entries and keeps the superseded original", async () => {
    await store.appendJournalEntry({
      entryId: "entry-1",
      reportId: "report-a",
      recordedAt: "2026-07-25T10:00:00.000Z",
      kind: "report_generated",
      summary: "First",
      payload: { a: 1 },
      supersedes: null,
      integrityHash: "hash-1",
    });
    await store.appendJournalEntry({
      entryId: "entry-2",
      reportId: "report-a",
      recordedAt: "2026-07-25T11:00:00.000Z",
      kind: "correction",
      summary: "Corrects the first",
      payload: { a: 2 },
      supersedes: "entry-1",
      integrityHash: "hash-2",
    });

    const journal = await store.listJournal(10);
    expect(journal).toHaveLength(2);
    expect(journal.find((e) => e.entryId === "entry-1")).toBeDefined();
    expect(journal.find((e) => e.entryId === "entry-2")?.supersedes).toBe("entry-1");
  });

  it("ignores a repeated append rather than duplicating or erroring", async () => {
    await store.appendJournalEntry({
      entryId: "entry-1",
      reportId: "report-a",
      recordedAt: "2026-07-25T10:00:00.000Z",
      kind: "report_generated",
      summary: "First",
      payload: { a: 1 },
      supersedes: null,
      integrityHash: "hash-1",
    });
    expect(await store.listJournal(10)).toHaveLength(2);
  });

  it("stores decisions and outcomes separately", async () => {
    await store.saveDecision({
      decisionId: "decision-old",
      reportId: "report-a",
      assetId: "apple",
      recordedAt: "2026-04-01T00:00:00.000Z",
      kind: "acted",
      payload: { reason: "margin of safety" },
    });
    await store.saveDecision({
      decisionId: "decision-recent",
      reportId: "report-a",
      assetId: "apple",
      recordedAt: "2026-07-24T00:00:00.000Z",
      kind: "declined",
      payload: {},
    });
    await store.saveDecision({
      decisionId: "decision-reviewed",
      reportId: "report-a",
      assetId: "gold",
      recordedAt: "2026-04-01T00:00:00.000Z",
      kind: "acted",
      payload: {},
    });
    await store.saveOutcome({
      outcomeId: "outcome-1",
      decisionId: "decision-reviewed",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      payload: { result: "worked_out" },
    });

    expect(await store.listDecisions(10)).toHaveLength(3);
    expect(await store.listOutcomes(10)).toHaveLength(1);
  });

  it("returns only unreviewed decisions old enough to judge", async () => {
    const queue = await store.listDecisionsAwaitingReview("2026-05-01T00:00:00.000Z");
    expect(queue.map((d) => d.decisionId)).toEqual(["decision-old"]);
  });

  it("refuses an outcome for a decision that was never recorded", async () => {
    await expect(
      store.saveOutcome({
        outcomeId: "outcome-orphan",
        decisionId: "decision-never-happened",
        reviewedAt: "2026-07-25T00:00:00.000Z",
        payload: {},
      }),
    ).rejects.toThrow();
  });

  it("revokes UPDATE and DELETE from the application role", async () => {
    // The grant list is the mechanism. Whether it BITES depends on the role:
    // a non-superuser is blocked even when it owns the tables; a superuser
    // bypasses privilege checks entirely. Both verified against a real
    // instance — see docs/PERSISTENCE_AND_SIGNING.md.
    const { rows } = await store["pool"].query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'reports' AND grantee = current_user`,
    );
    const granted = rows.map((r) => r.privilege_type);
    expect(granted).toContain("INSERT");
    expect(granted).toContain("SELECT");
    expect(granted).not.toContain("UPDATE");
    expect(granted).not.toContain("DELETE");
  });

  it("revokes UPDATE and DELETE on every table, not just reports", async () => {
    const { rows } = await store["pool"].query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE table_name IN ('reports','journal_entries','decisions','outcomes')
          AND grantee = current_user AND privilege_type IN ('UPDATE','DELETE')`,
    );
    expect(rows).toEqual([]);
  });

  it("throws rather than returning a row that no longer matches the schema", async () => {
    // Storage is outside the trust boundary. A corrupt row must surface, not
    // be handed half-formed into the render path.
    await store["pool"].query(
      `INSERT INTO reports (report_id, run_id, generated_at, evidence_cutoff, live_state,
         execution_context, prior_report_id, engine_version, pipeline_version, content)
       VALUES ('report-corrupt','run-x', now(), now(), 'partial_live', 'server_live', NULL,
               '2.0.0', '4.0.0', '{"not":"an envelope"}'::jsonb)`,
    );
    await expect(store.getReport("report-corrupt")).rejects.toThrow(/envelope schema/i);
  });
});
