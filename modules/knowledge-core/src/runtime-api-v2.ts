import { createHash, timingSafeEqual } from "node:crypto";
import type { KnowledgeQueryRequest, KnowledgeQueryResult, KnowledgeSourceInput } from "./contracts.js";
import type { FileIngestionRequest } from "./file-ingest.js";
import type { TextIngestionRequest, TextIngestionResult } from "./ingest.js";
import type { KnowledgeRuntimeHealth } from "./postgres-telemetry.js";
import {
  parseFileIngestion,
  parseKnowledgeQuery,
  parseTextIngestion,
  parseUrlIngestion,
} from "./runtime-validation.js";
import type { UrlIngestionRequest } from "./url-ingest.js";

export const KNOWLEDGE_RUNTIME_SCHEMA_VERSION = "neoos-knowledge-runtime-v1" as const;
export type RuntimeScope = "query" | "ingest" | "admin";

export interface RuntimeActorContext { actor?: string; }
export interface RuntimeRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
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

type RuntimeEnv = Record<string, string | undefined>;
interface ConsumerCredential {
  tokenSha256: string;
  scopes: RuntimeScope[];
  projects: string[];
}
interface AuthorizedConsumer {
  consumer: string;
  projects: string[];
  admin: boolean;
}

const BASE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});
const scopes = new Set<RuntimeScope>(["query", "ingest", "admin"]);

const response = (status: number, body: Record<string, unknown>): RuntimeResponse => ({
  status,
  headers: { ...BASE_HEADERS },
  body,
});

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function header(headers: RuntimeRequest["headers"], name: string): string {
  const direct = headers[name.toLowerCase()] ?? headers[name];
  const found = direct ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(found) ? found[0] ?? "" : found ?? "";
}

function consumerId(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized) ? normalized : "";
}

function projectId(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized === "*") return normalized;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(normalized) ? normalized : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(sha256(token)), encoder.encode(expectedHash.toLowerCase()));
}

function credentials(env: RuntimeEnv): Record<string, ConsumerCredential> {
  const raw = env.NEO_KNOWLEDGE_CONSUMERS?.trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed)) return {};
    const output: Record<string, ConsumerCredential> = {};
    for (const [name, value] of Object.entries(parsed)) {
      const id = consumerId(name);
      if (!id || !object(value)) continue;
      const tokenSha256 = typeof value.tokenSha256 === "string" ? value.tokenSha256.trim().toLowerCase() : "";
      const allowedScopes = Array.isArray(value.scopes)
        ? value.scopes.filter((item): item is RuntimeScope => typeof item === "string" && scopes.has(item as RuntimeScope))
        : [];
      const projects = Array.isArray(value.projects) ? value.projects.map(projectId).filter(Boolean) : [];
      if (!/^[a-f0-9]{64}$/.test(tokenSha256) || allowedScopes.length === 0 || projects.length === 0) continue;
      output[id] = { tokenSha256, scopes: [...new Set(allowedScopes)], projects: [...new Set(projects)] };
    }
    return output;
  } catch {
    return {};
  }
}

function authorize(
  request: RuntimeRequest,
  env: RuntimeEnv,
  required: Exclude<RuntimeScope, "admin">,
): { ok: true; value: AuthorizedConsumer } | { ok: false; status: 401 | 403 | 503 } {
  const configured = credentials(env);
  if (Object.keys(configured).length === 0) return { ok: false, status: 503 };
  const consumer = consumerId(header(request.headers, "x-neo-consumer"));
  const auth = header(request.headers, "authorization");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const credential = consumer ? configured[consumer] : undefined;
  if (!consumer || !token || !credential || !tokenMatches(token, credential.tokenSha256)) return { ok: false, status: 401 };
  const admin = credential.scopes.includes("admin");
  if (!admin && !credential.scopes.includes(required)) return { ok: false, status: 403 };
  return { ok: true, value: { consumer, projects: credential.projects, admin } };
}

function authorizedProject(requested: string | undefined, allowed: string[]): string | undefined {
  if (allowed.includes("*")) return requested ?? "global";
  if (requested) return allowed.includes(requested) ? requested : undefined;
  return allowed.length === 1 ? allowed[0] : undefined;
}

function projectSourceType(project: string, sourceType: string): string {
  const prefix = `project:${project}:`;
  const available = Math.max(1, 240 - prefix.length);
  return `${prefix}${sourceType.slice(0, available)}`;
}

function bindConsumerSource(source: KnowledgeSourceInput, project: string): KnowledgeSourceInput {
  return {
    ...source,
    sourceType: projectSourceType(project, source.sourceType),
    authorityClass: "unknown",
    metadata: {
      ...source.metadata,
      neoosTrustDomain: "project",
      neoosProjectScope: project,
      neoosReportedAuthorityClass: source.authorityClass,
    },
  };
}

function bindConsumerDocument<T extends TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest>(input: T, project: string): T {
  return {
    ...input,
    source: bindConsumerSource(input.source, project),
    document: {
      ...input.document,
      projectScope: project,
      verificationStatus: "unverified",
      lifecycleStatus: "ingested",
      metadata: {
        ...input.document.metadata,
        neoosTrustDomain: "project",
        neoosProjectScope: project,
        neoosReportedVerificationStatus: input.document.verificationStatus,
        neoosReportedLifecycleStatus: input.document.lifecycleStatus,
      },
    },
  };
}

function bindAdminDocument<T extends TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest>(input: T, project: string): T {
  const verification = input.document.verificationStatus ?? "unverified";
  const lifecycle = input.document.lifecycleStatus ?? "ingested";
  if ((lifecycle === "verified" || lifecycle === "active") && verification !== "verified") {
    throw new Error("verified or active lifecycle requires verified status");
  }
  return {
    ...input,
    source: {
      ...input.source,
      metadata: { ...input.source.metadata, neoosTrustDomain: "governed" },
    },
    document: {
      ...input.document,
      projectScope: project,
      verificationStatus: verification,
      lifecycleStatus: lifecycle,
      metadata: { ...input.document.metadata, neoosTrustDomain: "governed" },
    },
  };
}

function bindTrust<T extends TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest>(input: T, auth: AuthorizedConsumer, project: string): T {
  return auth.admin ? bindAdminDocument(input, project) : bindConsumerDocument(input, project);
}

function authError(status: 401 | 403 | 503): RuntimeResponse {
  if (status === 503) return response(503, { error: "Knowledge runtime authentication is not configured" });
  return response(status, { error: status === 403 ? "Forbidden" : "Unauthorized" });
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
    const authorized = authorize(request, env, "query");
    if (!authorized.ok) return authError(authorized.status);
    let parsed: KnowledgeQueryRequest;
    try { parsed = parseKnowledgeQuery(request.body); }
    catch (error) { return response(400, { error: error instanceof Error ? error.message : "Invalid request" }); }
    const project = authorizedProject(parsed.projectScope, authorized.value.projects);
    if (!project) return response(403, { error: "Forbidden" });
    try {
      const result = await runtime.query({ ...parsed, projectScope: project }, { actor: authorized.value.consumer });
      return response(200, { schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION, ...result });
    } catch {
      return response(500, { error: "Knowledge query failed" });
    }
  }

  const ingestionPath = request.path === "/v1/ingest/text" || request.path === "/v1/ingest/url" || request.path === "/v1/ingest/file";
  if (ingestionPath) {
    if (method !== "POST") return response(405, { error: "Method not allowed" });
    const authorized = authorize(request, env, "ingest");
    if (!authorized.ok) return authError(authorized.status);

    let parsed: TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest;
    try {
      parsed = request.path.endsWith("/url")
        ? parseUrlIngestion(request.body)
        : request.path.endsWith("/file") ? parseFileIngestion(request.body) : parseTextIngestion(request.body);
      const project = authorizedProject(parsed.document.projectScope, authorized.value.projects);
      if (!project) return response(403, { error: "Forbidden" });
      parsed = bindTrust(parsed, authorized.value, project);
    } catch (error) {
      return response(400, { error: error instanceof Error ? error.message : "Invalid request" });
    }

    try {
      let result: TextIngestionResult;
      if (request.path.endsWith("/url")) result = await runtime.ingestUrl(parsed as UrlIngestionRequest, { actor: authorized.value.consumer });
      else if (request.path.endsWith("/file")) result = await runtime.ingestFile(parsed as FileIngestionRequest, { actor: authorized.value.consumer });
      else result = await runtime.ingest(parsed as TextIngestionRequest, { actor: authorized.value.consumer });
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
