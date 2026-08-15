import assert from "node:assert/strict";
import test from "node:test";
import { ScopedPostgresKnowledgeRepository } from "../src/scoped-postgres-repository.js";
import type { SqlExecutor, SqlRow } from "../src/postgres-repository.js";

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: unknown[] }> = [];
  constructor(private readonly existing = false) {}
  async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []): Promise<T[]> {
    this.calls.push({ text, params });
    if (text.startsWith("select * from knowledge_core.knowledge_sources") && this.existing) {
      return [{
        id: "source-1",
        name: "Official",
        source_type: "project:NeoCRM:web",
        canonical_url: "https://example.org/source",
        publisher: "Original Publisher",
        authority_class: "primary-authority",
        license_spdx: "CC-BY-4.0",
        license_uri: null,
        freshness_policy: "monthly",
        metadata: { original: true },
        created_at: "2026-08-15T00:00:00Z",
      }] as unknown as T[];
    }
    if (text.startsWith("update knowledge_core.knowledge_sources")) {
      return [{
        id: "source-1",
        name: "Official",
        source_type: "project:NeoCRM:web",
        canonical_url: "https://example.org/source",
        publisher: "Original Publisher",
        authority_class: "primary-authority",
        license_spdx: "CC-BY-4.0",
        license_uri: null,
        freshness_policy: "monthly",
        metadata: { original: true, refreshed: true },
      }] as unknown as T[];
    }
    if (text.startsWith("insert into knowledge_core.knowledge_sources")) {
      return [{
        id: "source-2",
        name: params[0],
        source_type: params[1],
        canonical_url: params[2],
        publisher: params[3],
        authority_class: params[4],
        license_spdx: params[5],
        license_uri: params[6],
        freshness_policy: params[7],
        metadata: JSON.parse(String(params[8])),
      }] as unknown as T[];
    }
    return [];
  }
}

test("canonical source lookup is scoped by source type, not URL alone", async () => {
  const sql = new RecordingSql(false);
  const repository = new ScopedPostgresKnowledgeRepository(sql);
  await repository.upsertSource({
    name: "Example",
    sourceType: "project:NeoContent:web",
    canonicalUrl: "https://example.org/source",
    authorityClass: "unknown",
  });
  const lookup = sql.calls[0];
  assert.ok(lookup?.text.includes("canonical_url = $3 and source_type = $2"));
  assert.equal(lookup?.params[1], "project:NeoContent:web");
  assert.equal(lookup?.params[2], "https://example.org/source");
});

test("normal source refresh cannot overwrite established authority publisher or license", async () => {
  const sql = new RecordingSql(true);
  const repository = new ScopedPostgresKnowledgeRepository(sql);
  const result = await repository.upsertSource({
    name: "Attacker supplied name",
    sourceType: "project:NeoCRM:web",
    canonicalUrl: "https://example.org/source",
    publisher: "Attacker Publisher",
    authorityClass: "unknown",
    licenseSpdx: "MIT",
    metadata: { refreshed: true },
  });
  const update = sql.calls[1];
  assert.ok(update?.text.includes("last_checked_at = now()"));
  assert.ok(!update?.text.includes("authority_class ="));
  assert.ok(!update?.text.includes("publisher ="));
  assert.ok(!update?.text.includes("license_spdx ="));
  assert.equal(result.authorityClass, "primary-authority");
  assert.equal(result.publisher, "Original Publisher");
  assert.equal(result.licenseSpdx, "CC-BY-4.0");
});
