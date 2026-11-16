import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeQueryRequest, KnowledgeQueryResult, StoredChunk, StoredDocument, StoredSource } from "../src/contracts.js";
import type { FileIngestionRequest } from "../src/file-ingest.js";
import type { TextIngestionRequest, TextIngestionResult } from "../src/ingest.js";
import { handleKnowledgeRuntimeRequest, type KnowledgeRuntimeService, type RuntimeActorContext, type RuntimeRequest } from "../src/runtime-api.js";
import type { UrlIngestionRequest } from "../src/url-ingest.js";

const QUERY_TOKEN = "query-token-abcdefghijklmnopqrstuvwxyz";
const INGEST_TOKEN = "ingest-token-abcdefghijklmnopqrstuvwxyz";
const ADMIN_TOKEN = "admin-token-abcdefghijklmnopqrstuvwxyz";
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const env = {
  NEO_KNOWLEDGE_CONSUMERS: JSON.stringify({
    reader: { tokenSha256: hash(QUERY_TOKEN), scopes: ["query"], projects: ["NeoCRM"] },
    writer: { tokenSha256: hash(INGEST_TOKEN), scopes: ["ingest"], projects: ["NeoContent"] },
    operator: { tokenSha256: hash(ADMIN_TOKEN), scopes: ["admin"], projects: ["*"] },
  }),
};

function request(path: string, token?: string, consumer = "reader", body?: unknown): RuntimeRequest {
  return {
    method: path === "/healthz" ? "GET" : "POST",
    path,
    headers: token ? { "x-neo-consumer": consumer, authorization: `Bearer ${token}` } : {},
    body,
  };
}

const queryResult: KnowledgeQueryResult = {
  evidence: [],
  externalCandidates: [],
  liveResearchRequired: false,
  route: { lexical: true, semantic: false, decisions: true, registry: false },
};

const source: StoredSource = { id: "source-1", name: "Example", sourceType: "manual", authorityClass: "unknown" };
const document: StoredDocument = {
  id: "doc-1", sourceId: source.id, title: "Example", retrievedAt: "2026-08-15T20:00:00.000Z",
  projectScope: "global", verificationStatus: "unverified", lifecycleStatus: "ingested",
  contentHash: "doc-hash", untrustedSource: true,
};
const chunk: StoredChunk = { id: "chunk-1", documentId: document.id, chunkIndex: 0, content: "example", contentHash: "chunk-hash" };
const ingestionResult: TextIngestionResult = { source, document, chunks: [chunk] };

class RuntimeStub implements KnowledgeRuntimeService {
  queryActor = "";
  queryProject = "";
  ingestActor = "";
  ingestProject = "";
  queryCalls = 0;
  ingestCalls = 0;
  failQuery = false;
  failUrl = false;

  async query(input: KnowledgeQueryRequest, context?: RuntimeActorContext): Promise<KnowledgeQueryResult> {
    this.queryCalls += 1;
    this.queryActor = context?.actor ?? "";
    this.queryProject = input.projectScope ?? "";
    if (this.failQuery) throw new Error("database password should never leak");
    return queryResult;
  }

  async ingest(input: TextIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult> {
    this.ingestCalls += 1;
    this.ingestActor = context?.actor ?? "";
    this.ingestProject = input.document.projectScope ?? "";
    return ingestionResult;
  }

  async ingestUrl(input: UrlIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult> {
    this.ingestCalls += 1;
    this.ingestActor = context?.actor ?? "";
    this.ingestProject = input.document.projectScope ?? "";
    if (this.failUrl) throw new Error("internal transport details should never leak");
    return ingestionResult;
  }

  async ingestFile(input: FileIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult> {
    this.ingestCalls += 1;
    this.ingestActor = context?.actor ?? "";
    this.ingestProject = input.document.projectScope ?? "";
    return ingestionResult;
  }

  async health() { return { databaseReachable: true, vectorEnabled: true, knowledgeSchemaPresent: true }; }
}

const validQuery = { query: "What is NeoOS Knowledge Core?", freshnessRequirement: "stable" };
const validTextIngest = {
  source: { name: "Manual", sourceType: "manual", authorityClass: "unknown" },
  document: { title: "Manual note" },
  content: "Governed knowledge content",
};
const validUrlIngest = {
  source: { name: "Web", sourceType: "web", authorityClass: "unknown" },
  document: { title: "Web article" },
  url: "https://example.org/article",
};
const validFileIngest = {
  source: { name: "Upload", sourceType: "file", authorityClass: "unknown" },
  document: { title: "Uploaded note" },
  filename: "note.txt",
  declaredMimeType: "text/plain",
  bytes: new TextEncoder().encode("file knowledge"),
};

test("health endpoint is public but exposes only coarse status", async () => {
  const response = await handleKnowledgeRuntimeRequest(request("/healthz"), {}, new RuntimeStub());
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.databaseReachable, undefined);
  assert.equal(response.headers["cache-control"], "no-store, max-age=0");
});

test("runtime refuses protected calls when consumer auth is not configured", async () => {
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", QUERY_TOKEN, "reader", validQuery), {}, new RuntimeStub());
  assert.equal(response.status, 503);
});

test("bad token is rejected and query runtime is never called", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", "incorrect-token-with-enough-length", "reader", validQuery), env, runtime);
  assert.equal(response.status, 401);
  assert.equal(runtime.queryCalls, 0);
});

test("query-only consumer cannot ingest", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/text", QUERY_TOKEN, "reader", validTextIngest), env, runtime);
  assert.equal(response.status, 403);
  assert.equal(runtime.ingestCalls, 0);
});

test("valid query token defaults to its only allowed project and propagates actor identity", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", QUERY_TOKEN, "reader", validQuery), env, runtime);
  assert.equal(response.status, 200);
  assert.equal(runtime.queryActor, "reader");
  assert.equal(runtime.queryProject, "NeoCRM");
  assert.equal(runtime.queryCalls, 1);
});

test("consumer cannot query another project by changing projectScope", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", QUERY_TOKEN, "reader", { ...validQuery, projectScope: "NeoContent" }), env, runtime);
  assert.equal(response.status, 403);
  assert.equal(runtime.queryCalls, 0);
});

test("ingest consumer defaults writes to its allowed project, never global", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/text", INGEST_TOKEN, "writer", validTextIngest), env, runtime);
  assert.equal(response.status, 201);
  assert.equal(runtime.ingestProject, "NeoContent");
});

test("ingest consumer cannot promote a project document to global knowledge", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(
    request("/v1/ingest/text", INGEST_TOKEN, "writer", { ...validTextIngest, document: { title: "Manual note", projectScope: "global" } }), env, runtime,
  );
  assert.equal(response.status, 403);
  assert.equal(runtime.ingestCalls, 0);
});

test("binary file ingestion uses same project isolation boundary", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/file", INGEST_TOKEN, "writer", validFileIngest), env, runtime);
  assert.equal(response.status, 201);
  assert.equal(runtime.ingestProject, "NeoContent");
  assert.equal(runtime.ingestActor, "writer");
});

test("admin scope with wildcard project access may perform global ingestion", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/text", ADMIN_TOKEN, "operator", validTextIngest), env, runtime);
  assert.equal(response.status, 201);
  assert.equal(runtime.ingestActor, "operator");
  assert.equal(runtime.ingestProject, "global");
});

test("malformed query is a client error and does not call runtime", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", QUERY_TOKEN, "reader", { query: "" }), env, runtime);
  assert.equal(response.status, 400);
  assert.equal(runtime.queryCalls, 0);
});

test("runtime query failure returns generic 500 without leaking internal error", async () => {
  const runtime = new RuntimeStub();
  runtime.failQuery = true;
  const response = await handleKnowledgeRuntimeRequest(request("/v1/query", QUERY_TOKEN, "reader", validQuery), env, runtime);
  assert.equal(response.status, 500);
  assert.equal(response.body.error, "Knowledge query failed");
  assert.ok(!JSON.stringify(response.body).includes("password"));
});

test("URL ingestion rejects non-HTTPS URLs before runtime", async () => {
  const runtime = new RuntimeStub();
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/url", INGEST_TOKEN, "writer", { ...validUrlIngest, url: "http://example.org/" }), env, runtime);
  assert.equal(response.status, 400);
  assert.equal(runtime.ingestCalls, 0);
});

test("URL runtime failure is generic and does not leak transport details", async () => {
  const runtime = new RuntimeStub();
  runtime.failUrl = true;
  const response = await handleKnowledgeRuntimeRequest(request("/v1/ingest/url", INGEST_TOKEN, "writer", validUrlIngest), env, runtime);
  assert.equal(response.status, 422);
  assert.equal(response.body.error, "URL ingestion failed");
  assert.ok(!JSON.stringify(response.body).includes("transport"));
});
