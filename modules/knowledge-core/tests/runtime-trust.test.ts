import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeQueryRequest, KnowledgeQueryResult, StoredChunk, StoredDocument, StoredSource } from "../src/contracts.js";
import type { FileIngestionRequest } from "../src/file-ingest.js";
import type { TextIngestionRequest, TextIngestionResult } from "../src/ingest.js";
import { handleKnowledgeRuntimeRequest, type KnowledgeRuntimeService, type RuntimeActorContext } from "../src/runtime-api.js";
import type { UrlIngestionRequest } from "../src/url-ingest.js";

const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const WRITER = "writer-token-abcdefghijklmnopqrstuvwxyz";
const ADMIN = "admin-token-abcdefghijklmnopqrstuvwxyz";
const env = {
  NEO_KNOWLEDGE_CONSUMERS: JSON.stringify({
    writer: { tokenSha256: hash(WRITER), scopes: ["ingest"], projects: ["NeoContent"] },
    operator: { tokenSha256: hash(ADMIN), scopes: ["admin"], projects: ["*"] },
  }),
};

const source: StoredSource = { id: "s1", name: "Stored", sourceType: "stored", authorityClass: "unknown" };
const storedDocument: StoredDocument = {
  id: "d1", sourceId: "s1", title: "Stored", retrievedAt: "2026-08-15T20:00:00Z",
  projectScope: "global", verificationStatus: "unverified", lifecycleStatus: "ingested",
  contentHash: "h", untrustedSource: true,
};
const chunk: StoredChunk = { id: "c1", documentId: "d1", chunkIndex: 0, content: "x", contentHash: "ch" };
const result: TextIngestionResult = { source, document: storedDocument, chunks: [chunk] };

class CaptureRuntime implements KnowledgeRuntimeService {
  last?: TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest;
  calls = 0;
  async query(_input: KnowledgeQueryRequest): Promise<KnowledgeQueryResult> {
    return { evidence: [], externalCandidates: [], liveResearchRequired: false, route: { lexical: true, semantic: false, decisions: true, registry: false } };
  }
  async ingest(input: TextIngestionRequest, _context?: RuntimeActorContext): Promise<TextIngestionResult> { this.calls += 1; this.last = input; return result; }
  async ingestUrl(input: UrlIngestionRequest): Promise<TextIngestionResult> { this.calls += 1; this.last = input; return result; }
  async ingestFile(input: FileIngestionRequest): Promise<TextIngestionResult> { this.calls += 1; this.last = input; return result; }
  async health() { return { databaseReachable: true, vectorEnabled: true, knowledgeSchemaPresent: true }; }
}

function request(token: string, consumer: string, body: unknown) {
  return {
    method: "POST",
    path: "/v1/ingest/text",
    headers: { "x-neo-consumer": consumer, authorization: `Bearer ${token}` },
    body,
  };
}

const claimedTrusted = {
  source: {
    name: "NIST",
    sourceType: "standards",
    canonicalUrl: "https://example.org/nist",
    authorityClass: "primary-authority",
    metadata: { neoosTrustDomain: "governed" },
  },
  document: {
    title: "Claimed standard",
    verificationStatus: "verified",
    lifecycleStatus: "active",
    metadata: { neoosTrustDomain: "governed" },
  },
  content: "A project consumer cannot elevate this evidence.",
};

test("project ingestion cannot self-promote authority, verification, lifecycle, or trust domain", async () => {
  const runtime = new CaptureRuntime();
  const response = await handleKnowledgeRuntimeRequest(request(WRITER, "writer", claimedTrusted), env, runtime);
  assert.equal(response.status, 201);
  assert.equal(runtime.calls, 1);
  assert.equal(runtime.last?.source.authorityClass, "unknown");
  assert.ok(runtime.last?.source.sourceType.startsWith("project:NeoContent:"));
  assert.equal(runtime.last?.source.metadata?.neoosTrustDomain, "project");
  assert.equal(runtime.last?.source.metadata?.neoosProjectScope, "NeoContent");
  assert.equal(runtime.last?.source.metadata?.neoosReportedAuthorityClass, "primary-authority");
  assert.equal(runtime.last?.document.projectScope, "NeoContent");
  assert.equal(runtime.last?.document.verificationStatus, "unverified");
  assert.equal(runtime.last?.document.lifecycleStatus, "ingested");
  assert.equal(runtime.last?.document.metadata?.neoosTrustDomain, "project");
  assert.equal(runtime.last?.document.metadata?.neoosReportedVerificationStatus, "verified");
  assert.equal(runtime.last?.document.metadata?.neoosReportedLifecycleStatus, "active");
});

test("admin credential may explicitly create verified active governed knowledge", async () => {
  const runtime = new CaptureRuntime();
  const response = await handleKnowledgeRuntimeRequest(request(ADMIN, "operator", { ...claimedTrusted, document: { ...claimedTrusted.document, projectScope: "global" } }), env, runtime);
  assert.equal(response.status, 201);
  assert.equal(runtime.last?.source.authorityClass, "primary-authority");
  assert.equal(runtime.last?.source.sourceType, "standards");
  assert.equal(runtime.last?.source.metadata?.neoosTrustDomain, "governed");
  assert.equal(runtime.last?.document.verificationStatus, "verified");
  assert.equal(runtime.last?.document.lifecycleStatus, "active");
  assert.equal(runtime.last?.document.projectScope, "global");
});

test("admin cannot mark knowledge active unless verification is verified", async () => {
  const runtime = new CaptureRuntime();
  const body = {
    ...claimedTrusted,
    document: { title: "Bad state", projectScope: "global", verificationStatus: "unverified", lifecycleStatus: "active" },
  };
  const response = await handleKnowledgeRuntimeRequest(request(ADMIN, "operator", body), env, runtime);
  assert.equal(response.status, 400);
  assert.equal(runtime.calls, 0);
});
