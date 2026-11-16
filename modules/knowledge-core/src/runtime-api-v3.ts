import type { KnowledgeQueryRequest, KnowledgeQueryResult } from "./contracts.js";
import type { FileIngestionRequest } from "./file-ingest.js";
import type { TextIngestionRequest, TextIngestionResult } from "./ingest.js";
import type { KnowledgeRuntimeHealth } from "./postgres-telemetry.js";
import { authorizeRuntime, resolveAuthorizedProject, type RuntimeEnv, type RuntimeHeaders, type RuntimeScope } from "./runtime-auth.js";
import { bindRuntimeTrust, type RuntimeIngestionRequest } from "./runtime-trust.js";
import { parseFileIngestion, parseKnowledgeQuery, parseTextIngestion, parseUrlIngestion } from "./runtime-validation.js";
import type { UrlIngestionRequest } from "./url-ingest.js";

export { type RuntimeScope } from "./runtime-auth.js";
export const KNOWLEDGE_RUNTIME_SCHEMA_VERSION = "neoos-knowledge-runtime-v1" as const;

export interface RuntimeActorContext { actor?: string; }
export interface RuntimeRequest {
  method: string;
  path: string;
  headers: RuntimeHeaders;
  body?: unknown;
}
export interface RuntimeResponse {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
export interface KnowledgeRuntimeService {
  query(request: KnowledgeQueryRequest, context?: RuntimeActorContext): Promise<KnowledgeQueryResult>;
  ingest(request: TextIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult>;
  ingestUrl(request: UrlIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult>;
  ingestFile(request: FileIngestionRequest, context?: RuntimeActorContext): Promise<TextIngestionResult>;
  health(): Promise<KnowledgeRuntimeHealth>;
}

const HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});
const response = (status: number, body: Record<string, unknown>): RuntimeResponse => ({ status, headers: { ...HEADERS }, body });

function authError(status: 401 | 403 | 503): RuntimeResponse {
  if (status === 503) return response(503, { error: "Knowledge runtime authentication is not configured" });
  return response(status, { error: status === 403 ? "Forbidden" : "Unauthorized" });
}

function parseIngestion(path: string, body: unknown): RuntimeIngestionRequest {
  if (path.endsWith("/url")) return parseUrlIngestion(body);
  if (path.endsWith("/file")) return parseFileIngestion(body);
  return parseTextIngestion(body);
}

async function runIngestion(
  path: string,
  runtime: KnowledgeRuntimeService,
  input: RuntimeIngestionRequest,
  actor: string,
): Promise<TextIngestionResult> {
  if (path.endsWith("/url")) return runtime.ingestUrl(input as UrlIngestionRequest, { actor });
  if (path.endsWith("/file")) return runtime.ingestFile(input as FileIngestionRequest, { actor });
  return runtime.ingest(input as TextIngestionRequest, { actor });
}

export async function handleKnowledgeRuntimeRequest(
  request: RuntimeRequest,
  env: RuntimeEnv,
  runtime: KnowledgeRuntimeService,
): Promise<RuntimeResponse> {
  const method = request.method.toUpperCase();

  if (request.path === "/healthz") {
    if (method !== "GET") return response(405, { error: "Method not allowed" });
    try {
      const health = await runtime.health();
      const ok = health.databaseReachable && health.vectorEnabled && health.knowledgeSchemaPresent;
      return response(ok ? 200 : 503, {
        schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION,
        service: "neoos-knowledge-core",
        status: ok ? "ok" : "degraded",
      });
    } catch {
      return response(503, { schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION, service: "neoos-knowledge-core", status: "unavailable" });
    }
  }

  if (request.path === "/v1/query") {
    if (method !== "POST") return response(405, { error: "Method not allowed" });
    const auth = authorizeRuntime(request.headers, env, "query");
    if (!auth.ok) return authError(auth.status);
    let input: KnowledgeQueryRequest;
    try { input = parseKnowledgeQuery(request.body); }
    catch (error) { return response(400, { error: error instanceof Error ? error.message : "Invalid request" }); }
    const project = resolveAuthorizedProject(input.projectScope, auth.value.projects);
    if (!project) return response(403, { error: "Forbidden" });
    try {
      const result = await runtime.query({ ...input, projectScope: project }, { actor: auth.value.consumer });
      return response(200, { schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION, ...result });
    } catch {
      return response(500, { error: "Knowledge query failed" });
    }
  }

  const ingestionPath = request.path === "/v1/ingest/text" || request.path === "/v1/ingest/url" || request.path === "/v1/ingest/file";
  if (ingestionPath) {
    if (method !== "POST") return response(405, { error: "Method not allowed" });
    const auth = authorizeRuntime(request.headers, env, "ingest");
    if (!auth.ok) return authError(auth.status);
    let input: RuntimeIngestionRequest;
    try {
      input = parseIngestion(request.path, request.body);
      const project = resolveAuthorizedProject(input.document.projectScope, auth.value.projects);
      if (!project) return response(403, { error: "Forbidden" });
      input = bindRuntimeTrust(input, auth.value, project);
    } catch (error) {
      return response(400, { error: error instanceof Error ? error.message : "Invalid request" });
    }
    try {
      const result = await runIngestion(request.path, runtime, input, auth.value.consumer);
      return response(201, {
        schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION,
        documentId: result.document.id,
        sourceId: result.source.id,
        contentHash: result.document.contentHash,
        chunkCount: result.chunks.length,
      });
    } catch {
      const message = request.path.endsWith("/url")
        ? "URL ingestion failed"
        : request.path.endsWith("/file") ? "File ingestion failed" : "Knowledge ingestion failed";
      return response(request.path.endsWith("/url") || request.path.endsWith("/file") ? 422 : 500, { error: message });
    }
  }

  return response(404, { error: "Not found" });
}
