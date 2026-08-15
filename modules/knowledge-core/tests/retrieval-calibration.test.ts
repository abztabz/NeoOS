import assert from "node:assert/strict";
import test from "node:test";
import type { DecisionEvidence, KnowledgeRepository, SearchHit, StoredChunk, StoredDocument, StoredSource } from "../src/contracts.js";
import { queryKnowledge } from "../src/retrieval.js";

const source: StoredSource = {
  id: "source-1",
  name: "NeoOS GitHub",
  sourceType: "internal-governance",
  authorityClass: "primary-authority",
};

const document: StoredDocument = {
  id: "doc-1",
  sourceId: source.id,
  title: "ADR-0003",
  retrievedAt: "2026-08-15T12:00:00.000Z",
  projectScope: "global",
  verificationStatus: "verified",
  lifecycleStatus: "active",
  contentHash: "doc-hash",
  untrustedSource: false,
};

const chunk: StoredChunk = {
  id: "chunk-1",
  documentId: document.id,
  chunkIndex: 0,
  content: "NeoOS Knowledge Core is shared infrastructure and NeoOS CIO stays separate.",
  contentHash: "chunk-hash",
};

class LowRawRankRepository implements KnowledgeRepository {
  async upsertSource() { return source; }
  async insertDocument() { return document; }
  async insertChunks() { return [chunk]; }
  async searchLexical(): Promise<SearchHit[]> {
    return [{ chunk, document, source, retrievalScore: 0.002, freshnessScore: 0.5 }];
  }
  async searchSemantic(): Promise<SearchHit[]> { return []; }
  async searchDecisions(): Promise<DecisionEvidence[]> { return []; }
}

test("top lexical evidence is normalized before trust scoring", async () => {
  const result = await queryKnowledge(
    { query: "shared Knowledge Core", freshnessRequirement: "stable" },
    { repository: new LowRawRankRepository() },
  );
  assert.equal(result.evidence[0]?.score, 0.925);
  assert.equal(result.liveResearchRequired, false);
});
