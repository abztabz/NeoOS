import assert from "node:assert/strict";
import test from "node:test";
import { PostgresKnowledgeRepository, type SqlExecutor, type SqlRow } from "../src/postgres-repository.js";

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: unknown[] }> = [];

  async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []): Promise<T[]> {
    this.calls.push({ text, params });
    if (text.includes("insert into knowledge_core.knowledge_chunks")) {
      const rows: SqlRow[] = [{
        chunk_id: `chunk-${Number(params[1]) + 1}`,
        document_id: params[0],
        chunk_index: params[1],
        section: null,
        page_number: null,
        content: params[4],
        chunk_content_hash: params[5],
        embedding_model: null,
        embedding_dimensions: null,
        chunk_metadata: {},
      }];
      return rows as unknown as T[];
    }
    return [];
  }
}

test("insertChunks removes stale higher-index chunks after replacement", async () => {
  const sql = new RecordingSql();
  const repository = new PostgresKnowledgeRepository(sql);
  await repository.insertChunks("doc-1", [
    { chunkIndex: 0, content: "first", contentHash: "h1" },
    { chunkIndex: 1, content: "second", contentHash: "h2" },
  ]);

  const cleanup = sql.calls.at(-1);
  assert.ok(cleanup?.text.includes("delete from knowledge_core.knowledge_chunks"));
  assert.equal(cleanup?.params[0], "doc-1");
  assert.equal(cleanup?.params[1], 2);
});
