// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProfile } from "@/domain/intake/types";
import { profileIntegrityHash } from "@/server/persistence/intake-store";
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
      "TRUNCATE outcomes, decisions, journal_entries, reports, intake_profiles RESTART IDENTITY CASCADE",
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

  it("blocks UPDATE on every append-only table", async () => {
    // Enforced by trigger, not by privilege. A trigger also stops a superuser,
    // and — unlike REVOKE — it leaves the row-lock privilege that foreign keys
    // require, which is the defect the next test pins down.
    for (const table of ["reports", "journal_entries", "decisions", "outcomes", "intake_profiles"]) {
      await expect(store["pool"].query(`UPDATE ${table} SET stored_at = now()`)).rejects.toThrow(
        /append-only/i,
      );
    }
  });

  it("blocks DELETE on every append-only table", async () => {
    for (const table of ["outcomes", "decisions", "journal_entries", "reports", "intake_profiles"]) {
      await expect(store["pool"].query(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/i);
    }
  });

  it("still permits the row locks foreign keys take", async () => {
    // The regression test for the REVOKE defect. Enforcing append-only by
    // revoking UPDATE and DELETE also revoked SELECT ... FOR KEY SHARE, so every
    // insert carrying a foreign key failed for a non-superuser role — the exact
    // role production is told to use. Superuser connections hid it entirely.
    await expect(
      store["pool"].query(`SELECT 1 FROM ONLY reports x WHERE report_id = 'report-a' FOR KEY SHARE OF x`),
    ).resolves.toBeDefined();
  });

  /* ---------------- intake ---------------- */

  it("round-trips a profile through JSONB without losing structure", async () => {
    const base = emptyProfile("subject-operator", "profile-1", "2026-07-01T09:00:00.000Z");
    const result = await store.saveProfile({
      ...base,
      assets: [
        {
          assetHoldingId: "asset-1",
          subjectId: "subject-operator",
          kind: "real_estate",
          label: "Dubai flat",
          value: {
            amount: 2_000_000,
            currency: "AED",
            basis: "professional_appraisal",
            asOf: "2026-01-10",
            note: null,
          },
          registryAssetId: null,
          identifier: null,
          quantity: null,
          liquidity: "months",
          jurisdiction: "AE",
          custodian: null,
          encumberedBy: null,
          restricted: false,
          notes: null,
        },
      ],
      objective: { ...base.objective, baseCurrency: "AED", excludedAssetKinds: ["crypto"] },
    });
    expect(result.stored).toBe(true);

    const read = await store.getCurrentProfile("subject-operator");
    expect(read?.assets[0]?.value.amount).toBe(2_000_000);
    // Nulls, arrays and nested objects all survive.
    expect(read?.assets[0]?.custodian).toBeNull();
    expect(read?.objective.excludedAssetKinds).toEqual(["crypto"]);
    expect(read?.household.dependents).toEqual([]);
  });

  it("makes a correction current and leaves the original readable", async () => {
    const result = await store.saveProfile({
      ...emptyProfile("subject-operator", "profile-2", "2026-07-20T09:00:00.000Z"),
      supersedes: "profile-1",
    });
    expect(result.stored).toBe(true);
    expect((await store.getCurrentProfile("subject-operator"))?.profileId).toBe("profile-2");
    expect((await store.getProfile("subject-operator", "profile-1"))?.assets[0]?.value.amount).toBe(2_000_000);

    const history = await store.listProfileHistory("subject-operator", 10);
    expect(history.map((h) => h.profileId)).toEqual(["profile-2", "profile-1"]);
    expect(history[1]?.superseded).toBe(true);
  });

  it("rejects a second correction to the same version at the database", async () => {
    // The partial unique index is the mechanism, and it must surface as a
    // refusal rather than an unhandled constraint error.
    const clash = await store.saveProfile({
      ...emptyProfile("subject-operator", "profile-3", "2026-07-21T09:00:00.000Z"),
      supersedes: "profile-1",
    });
    expect(clash.stored).toBe(false);
    expect(clash.reason).toMatch(/already been superseded/);
    expect((await store.getCurrentProfile("subject-operator"))?.profileId).toBe("profile-2");
  });

  it("refuses to overwrite a stored profile", async () => {
    const second = await store.saveProfile(
      emptyProfile("subject-operator", "profile-1", "2026-07-01T09:00:00.000Z"),
    );
    expect(second.stored).toBe(false);
    expect(second.reason).toMatch(/never overwritten/);
  });

  it("keeps subjects apart in SQL, not only in memory", async () => {
    await store.saveProfile(emptyProfile("subject-other", "profile-other", "2026-07-22T09:00:00.000Z"));
    expect((await store.getCurrentProfile("subject-operator"))?.profileId).toBe("profile-2");
    expect(await store.getProfile("subject-operator", "profile-other")).toBeNull();
    expect(await store.listProfileHistory("subject-other", 10)).toHaveLength(1);
  });

  it("refuses to use a profile edited outside the application", async () => {
    // A declared position that no longer matches the hash written with it has
    // been changed by something that is not NeoOS. Using it anyway would put an
    // unverified figure into every number downstream.
    //
    // Written as a direct INSERT with a hash that does not match, because
    // UPDATE is revoked on this table — the append-only rule and this check are
    // two independent defences and the test must not depend on breaking one to
    // exercise the other.
    const tampered = emptyProfile("subject-tamper", "profile-tampered", "2026-07-23T09:00:00.000Z");
    await store["pool"].query(
      `INSERT INTO intake_profiles (profile_id, subject_id, schema_version, recorded_at, supersedes, content, integrity_hash)
       VALUES ($1,$2,$3,$4,NULL,$5,$6)`,
      [
        tampered.profileId,
        tampered.subjectId,
        tampered.schemaVersion,
        tampered.recordedAt,
        JSON.stringify({ ...tampered, objective: { ...tampered.objective, horizonYears: 40 } }),
        profileIntegrityHash(tampered),
      ],
    );
    await expect(store.getCurrentProfile("subject-tamper")).rejects.toThrow(/integrity hash/i);
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
