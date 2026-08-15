import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeQueryResult } from "../src/contracts.js";
import { PostgresKnowledgeTelemetry } from "../src/postgres-telemetry.js";
import type { SqlExecutor, SqlRow } from "../src/postgres-repository.js";

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: unknown[] }> = [];

  async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []): Promise<T[]> {
    this.calls.push({ text, params });
    if (text.includes("insert into knowledge_core.knowledge_queries")) {
      return [{ id: "query-1" }] as unknown as T[];
    }
    if (text.includes("select\n         true as database_reachable")) {
      return [{ database_reachable: true, vector_enabled: true, knowledge_schema_present: true }] as unknown as T[];
    }
    return [];
  }
}

const result: KnowledgeQueryResult = {
  evidence: [
    {
      kind: "knowledge",
      id: "chunk-1",
      score: 0.9,
      title: "Stored evidence",
      content: "Evidence body",
      projectScope: "global",
      provenance: { sourceId: "source-1", contentHash: "hash-1" },
    },
    {
      kind: "decision",
      id: "decision-1",
      score: 0.98,
      title: "D-019",
      content: "Decision body",
      projectScope: "global",
      provenance: { decisionKey: "D-019" },
    },
  ],
  externalCandidates: [
    {
      capability: "news-discovery",
      selectedProvider: "provider-a",
      observationTimestamp: "2026-08-15T20:00:00Z",
      provenance: { provider: "provider-a", endpointClass: "public" },
      data: { secretPayload: "must-not-be-persisted" },
    },
  ],
  liveResearchRequired: true,
  route: { lexical: true, semantic: false, decisions: true, registry: true },
};

test("recordQuery persists evidence links and external provenance without copying external payload data", async () => {
  const sql = new RecordingSql();
  const telemetry = new PostgresKnowledgeTelemetry(sql);
  const id = await telemetry.recordQuery(
    { query: "current topic", projectScope: "NeoContent", freshnessRequirement: "current", registryCapabilities: ["news-discovery"] },
    result,
    "neocontent",
  );

  assert.equal(id, "query-1");
  assert.equal(sql.calls.length, 4);
  const knowledgeEvidence = sql.calls[1];
  const decisionEvidence = sql.calls[2];
  const externalEvidence = sql.calls[3];
  assert.ok(knowledgeEvidence?.text.includes("knowledge_query_evidence"));
  assert.equal(knowledgeEvidence?.params[1], "chunk-1");
  assert.equal(decisionEvidence?.params[2], "decision-1");
  const persistedExternal = JSON.stringify(externalEvidence?.params ?? []);
  assert.ok(persistedExternal.includes("news-discovery"));
  assert.ok(!persistedExternal.includes("must-not-be-persisted"));
});

test("audit records actor and action without requiring a database schema change", async () => {
  const sql = new RecordingSql();
  const telemetry = new PostgresKnowledgeTelemetry(sql);
  await telemetry.audit("neocrm", "knowledge.query", "knowledge_query", "query-1", { projectScope: "NeoCRM" });
  assert.equal(sql.calls.length, 1);
  assert.equal(sql.calls[0]?.params[0], "neocrm");
  assert.equal(sql.calls[0]?.params[1], "knowledge.query");
});

test("health reports only database/vector/schema readiness", async () => {
  const telemetry = new PostgresKnowledgeTelemetry(new RecordingSql());
  const health = await telemetry.health();
  assert.equal(health.databaseReachable, true);
  assert.equal(health.vectorEnabled, true);
  assert.equal(health.knowledgeSchemaPresent, true);
});
