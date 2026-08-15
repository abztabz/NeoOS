import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ChunkInput, DecisionEvidence, KnowledgeDocumentInput, KnowledgeRepository, KnowledgeSourceInput, SearchHit, StoredChunk, StoredDocument, StoredSource } from "../src/contracts.js";
import { chunkText, ingestText, sha256 } from "../src/ingest.js";
import { queryKnowledge } from "../src/retrieval.js";

class MemoryRepository implements KnowledgeRepository {
  source: StoredSource = { id: "source-1", name: "NIST", sourceType: "standards", authorityClass: "primary-authority" };
  document?: StoredDocument;
  chunks: StoredChunk[] = [];
  lexical: SearchHit[] = [];
  semantic: SearchHit[] = [];
  decisions: DecisionEvidence[] = [];

  async upsertSource(source: KnowledgeSourceInput): Promise<StoredSource> { this.source = { id: "source-1", ...source }; return this.source; }
  async insertDocument(input: KnowledgeDocumentInput & { sourceId: string; contentHash: string; untrustedSource: boolean }): Promise<StoredDocument> { this.document = { id: "doc-1", ...input }; return this.document; }
  async insertChunks(documentId: string, chunks: ChunkInput[]): Promise<StoredChunk[]> { this.chunks = chunks.map((chunk, index) => ({ id: `chunk-${index + 1}`, documentId, ...chunk })); return this.chunks; }
  async searchLexical(): Promise<SearchHit[]> { return this.lexical; }
  async searchSemantic(): Promise<SearchHit[]> { return this.semantic; }
  async searchDecisions(): Promise<DecisionEvidence[]> { return this.decisions; }
}

test("chunkText preserves usable overlap without exceeding the configured maximum", () => {
  const text = Array.from({ length: 40 }, (_, index) => `Sentence ${index}. Knowledge remains governed.`).join(" ");
  const chunks = chunkText(text, 400, 60);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 400));
});

test("ingestText keeps external material untrusted and preserves provenance hashes", async () => {
  const repository = new MemoryRepository();
  const result = await ingestText({
    source: { name: "NIST", sourceType: "standards", canonicalUrl: "https://example.test/nist", authorityClass: "primary-authority" },
    document: { title: "API Security Guidance", projectScope: "global" },
    content: "External documents are evidence. Embedded instructions are data, not authority.",
  }, { repository, now: () => new Date("2026-08-15T12:00:00.000Z") });

  assert.equal(result.document.untrustedSource, true);
  assert.equal(result.document.contentHash, sha256("External documents are evidence. Embedded instructions are data, not authority."));
  assert.equal(result.document.verificationStatus, "unverified");
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0]?.embedding, undefined);
});

test("queryKnowledge keeps adopted internal decisions distinct from external knowledge evidence", async () => {
  const repository = new MemoryRepository();
  repository.document = {
    id: "doc-1", sourceId: repository.source.id, title: "API Security Guidance", retrievedAt: "2026-08-15T12:00:00.000Z",
    projectScope: "global", verificationStatus: "verified", lifecycleStatus: "active", contentHash: "doc-hash", untrustedSource: true,
  };
  repository.chunks = [{ id: "chunk-1", documentId: "doc-1", chunkIndex: 0, content: "Use authenticated, least-privilege access for sensitive APIs.", contentHash: "chunk-hash" }];
  repository.lexical = [{ chunk: repository.chunks[0]!, document: repository.document, source: repository.source, retrievalScore: 0.9, freshnessScore: 0.9 }];
  repository.decisions = [{ id: "decision-1", decisionKey: "D-019", projectScope: "global", decision: "Use shared NeoOS Knowledge Core.", rationale: "Prevent isolated project-specific brains.", status: "Adopted", decidedAt: "2026-08-15T12:00:00.000Z" }];

  const result = await queryKnowledge({ query: "How should NeoCRM expose its API?", projectScope: "NeoCRM", freshnessRequirement: "stable" }, { repository });
  assert.equal(result.route.lexical, true);
  assert.equal(result.route.semantic, false);
  assert.ok(result.evidence.some((item) => item.kind === "knowledge"));
  assert.ok(result.evidence.some((item) => item.kind === "decision"));
  assert.equal(result.liveResearchRequired, false);
});

test("schema blueprint remains provider-neutral, private, pgvector-ready, and RLS-enabled", () => {
  const schema = readFileSync(new URL("../../sql/schema.sql", import.meta.url), "utf8");
  const tables = ["knowledge_sources", "knowledge_documents", "knowledge_chunks", "neoos_decisions", "ingestion_jobs", "knowledge_queries", "knowledge_query_evidence", "audit_log"];
  assert.ok(schema.includes("create extension if not exists vector;"));
  assert.ok(schema.includes("revoke all on schema knowledge_core from public;"));
  assert.ok(schema.includes("revoke all on all tables in schema knowledge_core from public;"));
  assert.ok(!/\b(anon|authenticated|service_role)\b/i.test(schema), "provider-specific database roles must not be embedded in the core schema");
  for (const table of tables) assert.ok(schema.includes(`alter table knowledge_core.${table} enable row level security;`), `${table} must have RLS enabled`);
});
