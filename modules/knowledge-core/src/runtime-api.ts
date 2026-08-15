import { createHash, timingSafeEqual } from "node:crypto";
import type {
  AuthorityClass,
  FreshnessRequirement,
  KnowledgeDocumentInput,
  KnowledgeQueryRequest,
  KnowledgeQueryResult,
  KnowledgeSourceInput,
  LifecycleStatus,
  VerificationStatus,
} from "./contracts.js";
import type { FileIngestionRequest } from "./file-ingest.js";
import type { TextIngestionRequest, TextIngestionResult } from "./ingest.js";
import type { KnowledgeRuntimeHealth } from "./postgres-telemetry.js";
import type { UrlIngestionRequest } from "./url-ingest.js";

export const KNOWLEDGE_RUNTIME_SCHEMA_VERSION = "neoos-knowledge-runtime-v1" as const;
export type RuntimeScope = "query" | "ingest" | "admin";

export interface RuntimeActorContext {
  actor?: string;
}

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

const BASE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

const authorityClasses = new Set<AuthorityClass>([
  "primary-authority", "peer-reviewed", "official-documentation",
  "reputable-secondary", "community", "unknown",
]);
const freshnessValues = new Set<FreshnessRequirement>(["historical", "stable", "current", "live"]);
const verificationValues = new Set<VerificationStatus>(["unverified", "verified", "challenged"]);
const lifecycleValues = new Set<LifecycleStatus>([
  "candidate", "ingested", "verified", "active", "challenged", "superseded", "archived",
]);
const runtimeScopes = new Set<RuntimeScope>(["query", "ingest", "admin"]);

function response(status: number, body: Record<string, unknown>): RuntimeResponse {
  return { status, headers: { ...BASE_HEADERS }, body };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function headerValue(headers: RuntimeRequest["headers"], name: string): string {
  const direct = headers[name.toLowerCase()] ?? headers[name];
  const found = direct ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(found) ? found[0] ?? "" : found ?? "";
}

function safeConsumer(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized) ? normalized : "";
}

function safeProject(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized === "*") return normalized;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(normalized) ? normalized : "";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeTokenMatch(actualToken: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(
    encoder.encode(sha256Hex(actualToken)),
    encoder.encode(expectedHash.toLowerCase()),
  );
}

function parseConsumerCredentials(env: RuntimeEnv): Record<string, ConsumerCredential> {
  const raw = env.NEO_KNOWLEDGE_CONSUMERS?.trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!plainObject(parsed)) return {};
    const credentials: Record<string, ConsumerCredential> = {};
    for (const [consumer, candidate] of Object.entries(parsed)) {
      const id = safeConsumer(consumer);
      if (!id || !plainObject(candidate)) continue;
      const tokenSha256 = typeof candidate.tokenSha256 === "string" ? candidate.tokenSha256.trim().toLowerCase() : "";
      const scopes = Array.isArray(candidate.scopes)
        ? candidate.scopes.filter((scope): scope is RuntimeScope => typeof scope === "string" && runtimeScopes.has(scope as RuntimeScope))
        : [];
      const projects = Array.isArray(candidate.projects)
        ? candidate.projects.map(safeProject).filter((project) => Boolean(project))
        : [];
      if (!/^[a-f0-9]{64}$/.test(tokenSha256) || scopes.length === 0 || projects.length === 0) continue;
      credentials[id] = {
        tokenSha256,
        scopes: [...new Set(scopes)],
        projects: [...new Set(projects)],
      };
    }
    return credentials;
  } catch {
    return {};
  }
}

function authorize(
  request: RuntimeRequest,
  env: RuntimeEnv,
  requiredScope: Exclude<RuntimeScope, "admin">,
): { ok: true; consumer: string; projects: string[] } | { ok: false; status: 401 | 403 | 503 } {
  const credentials = parseConsumerCredentials(env);
  if (Object.keys(credentials).length === 0) return { ok: false, status: 503 };
  const consumer = safeConsumer(headerValue(request.headers, "x-neo-consumer"));
  const authorization = headerValue(request.headers, "authorization");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const credential = consumer ? credentials[consumer] : undefined;
  if (!consumer || !token || !credential || !constantTimeTokenMatch(token, credential.tokenSha256)) return { ok: false, status: 401 };
  if (!credential.scopes.includes(requiredScope) && !credential.scopes.includes("admin")) return { ok: false, status: 403 };
  return { ok: true, consumer, projects: credential.projects };
}

function resolveProjectScope(requested: string | undefined, allowed: string[]): string | undefined {
  if (allowed.includes("*")) return requested ?? "global";
  if (requested) return allowed.includes(requested) ? requested : undefined;
  return allowed.length === 1 ? allowed[0] : undefined;
}

function boundedString(value: unknown, field: string, maxLength: number, required = true): string | undefined {
  if (value == null && !required) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) throw new Error(`${field} is invalid`);
  return normalized || undefined;
}

function boundedMetadata(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (!plainObject(value) || Object.keys(value).length > 50) throw new Error(`${field} is invalid`);
  const serialized = JSON.stringify(value);
  if (serialized.length > 65_536) throw new Error(`${field} is too large`);
  return value;
}

function parseSource(value: unknown): KnowledgeSourceInput {
  if (!plainObject(value)) throw new Error("source must be an object");
  const authority = boundedString(value.authorityClass, "source.authorityClass", 64) as AuthorityClass;
  if (!authorityClasses.has(authority)) throw new Error("source.authorityClass is invalid");
  return {
    name: boundedString(value.name, "source.name", 300)!,
    sourceType: boundedString(value.sourceType, "source.sourceType", 100)!,
    canonicalUrl: boundedString(value.canonicalUrl, "source.canonicalUrl", 2_048, false),
    publisher: boundedString(value.publisher, "source.publisher", 300, false),
    authorityClass: authority,
    licenseSpdx: boundedString(value.licenseSpdx, "source.licenseSpdx", 100, false),
    licenseUri: boundedString(value.licenseUri, "source.licenseUri", 2_048, false),
    freshnessPolicy: boundedString(value.freshnessPolicy, "source.freshnessPolicy", 500, false),
    metadata: boundedMetadata(value.metadata, "source.metadata"),
  };
}

function parseDate(value: unknown, field: string): string | undefined {
  const text = boundedString(value, field, 100, false);
  if (!text) return undefined;
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} is invalid`);
  return text;
}

function parseDocument(value: unknown): Omit<KnowledgeDocumentInput, "retrievedAt"> & { retrievedAt?: string } {
  if (!plainObject(value)) throw new Error("document must be an object");
  const verification = boundedString(value.verificationStatus, "document.verificationStatus", 32, false) as VerificationStatus | undefined;
  if (verification && !verificationValues.has(verification)) throw new Error("document.verificationStatus is invalid");
  const lifecycle = boundedString(value.lifecycleStatus, "document.lifecycleStatus", 32, false) as LifecycleStatus | undefined;
  if (lifecycle && !lifecycleValues.has(lifecycle)) throw new Error("document.lifecycleStatus is invalid");
  return {
    title: boundedString(value.title, "document.title", 500)!,
    author: boundedString(value.author, "document.author", 300, false),
    publishedAt: parseDate(value.publishedAt, "document.publishedAt"),
    retrievedAt: parseDate(value.retrievedAt, "document.retrievedAt"),
    canonicalUrl: boundedString(value.canonicalUrl, "document.canonicalUrl", 2_048, false),
    mimeType: boundedString(value.mimeType, "document.mimeType", 200, false),
    language: boundedString(value.language, "document.language", 50, false),
    projectScope: boundedString(value.projectScope, "document.projectScope", 100, false),
    knowledgeDomain: boundedString(value.knowledgeDomain, "document.knowledgeDomain", 100, false),
    verificationStatus: verification,
    lifecycleStatus: lifecycle,
    licenseStatus: boundedString(value.licenseStatus, "document.licenseStatus", 100, false),
    metadata: boundedMetadata(value.metadata, "document.metadata"),
  };
}

function parseChunking(value: Record<string, unknown>): Pick<TextIngestionRequest, "chunkSize" | "overlap"> {
  const chunkSize = value.chunkSize == null ? undefined : Number(value.chunkSize);
  const overlap = value.overlap == null ? undefined : Number(value.overlap);
  if (chunkSize !== undefined && (!Number.isInteger(chunkSize) || chunkSize < 300 || chunkSize > 10_000)) throw new Error("chunkSize is invalid");
  if (overlap !== undefined && (!Number.isInteger(overlap) || overlap < 0 || overlap >= (chunkSize ?? 1_800))) throw new Error("overlap is invalid");
  return { chunkSize, overlap };
}

function parseTextIngestion(body: unknown): TextIngestionRequest {
  if (!plainObject(body)) throw new Error("JSON object body required");
  const content = boundedString(body.content, "content", 2_000_000)!;
  return { source: parseSource(body.source), document: parseDocument(body.document), content, ...parseChunking(body) };
}

function parseUrlIngestion(body: unknown): UrlIngestionRequest {
  if (!plainObject(body)) throw new Error("JSON object body required");
  const url = boundedString(body.url, "url", 2_048)!;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url is invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("url must use HTTPS");
  return {
    url: parsed.toString(),
    source: parseSource(body.source),
    document: parseDocument(body.document),
    ...parseChunking(body),
  };
}

function parseFileIngestion(body: unknown): FileIngestionRequest {
  if (!plainObject(body)) throw new Error("Parsed file object body required");
  if (!(body.bytes instanceof Uint8Array)) throw new Error("file bytes must be a Uint8Array");
  return {
    filename: boundedString(body.filename, "filename", 500)!,
    declaredMimeType: boundedString(body.declaredMimeType, "declaredMimeType", 200, false),
    bytes: body.bytes,
    source: parseSource(body.source),
    document: parseDocument(body.document),
    ...parseChunking(body),
  };
}

function parseQuery(body: unknown): KnowledgeQueryRequest {
  if (!plainObject(body)) throw new Error("JSON object body required");
  const freshness = boundedString(body.freshnessRequirement, "freshnessRequirement", 20, false) as FreshnessRequirement | undefined;
  if (freshness && !freshnessValues.has(freshness)) throw new Error("freshnessRequirement is invalid");
  const limit = body.limit == null ? undefined : Number(body.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) throw new Error("limit is invalid");
  let registryCapabilities: string[] | undefined;
  if (body.registryCapabilities != null) {
    if (!Array.isArray(body.registryCapabilities) || body.registryCapabilities.length > 10) throw new Error("registryCapabilities is invalid");
    registryCapabilities = body.registryCapabilities.map((value, index) => boundedString(value, `registryCapabilities[${index}]`, 100)!);
  }
  return {
    query: boundedString(body.query, "query", 4_000)!,
    projectScope: boundedString(body.projectScope, "projectScope", 100, false),
    freshnessRequirement: freshness,
    limit,
    registryCapabilities,
  };
}

function authFailure(result: { status: 401 | 403 | 503 }): RuntimeResponse {
  const message = result.status === 503
    ? "Knowledge runtime authentication is not configured"
    : result.status === 403 ? "Forbidden" : "Unauthorized";
  return response(result.status, { error: message });
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
      return response(503, {
        schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION,
        service: "neoos-knowledge-core",
        status: "unavailable",
      });
    }
  }

  if (request.path === "/v1/query") {
    if (method !== "POST") return response(405, { error: "Method not allowed" });
    const auth = authorize(request, env, "query");
    if (!auth.ok) return authFailure(auth);
    let parsed: KnowledgeQueryRequest;
    try {
      parsed = parseQuery(request.body);
    } catch (error) {
      return response(400, { error: error instanceof Error ? error.message : "Invalid request" });
    }
    const projectScope = resolveProjectScope(parsed.projectScope, auth.projects);
    if (!projectScope) return response(403, { error: "Forbidden" });
    parsed = { ...parsed, projectScope };
    try {
      const result = await runtime.query(parsed, { actor: auth.consumer });
      return response(200, { schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION, ...result });
    } catch {
      return response(500, { error: "Knowledge query failed" });
    }
  }

  if (request.path === "/v1/ingest/text" || request.path === "/v1/ingest/url" || request.path === "/v1/ingest/file") {
    if (method !== "POST") return response(405, { error: "Method not allowed" });
    const auth = authorize(request, env, "ingest");
    if (!auth.ok) return authFailure(auth);

    let parsed: TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest;
    try {
      if (request.path.endsWith("/url")) parsed = parseUrlIngestion(request.body);
      else if (request.path.endsWith("/file")) parsed = parseFileIngestion(request.body);
      else parsed = parseTextIngestion(request.body);
    } catch (error) {
      return response(400, { error: error instanceof Error ? error.message : "Invalid request" });
    }

    const projectScope = resolveProjectScope(parsed.document.projectScope, auth.projects);
    if (!projectScope) return response(403, { error: "Forbidden" });
    parsed = { ...parsed, document: { ...parsed.document, projectScope } };

    try {
      let result: TextIngestionResult;
      if (request.path.endsWith("/url")) result = await runtime.ingestUrl(parsed as UrlIngestionRequest, { actor: auth.consumer });
      else if (request.path.endsWith("/file")) result = await runtime.ingestFile(parsed as FileIngestionRequest, { actor: auth.consumer });
      else result = await runtime.ingest(parsed as TextIngestionRequest, { actor: auth.consumer });
      return response(201, {
        schemaVersion: KNOWLEDGE_RUNTIME_SCHEMA_VERSION,
        documentId: result.document.id,
        sourceId: result.source.id,
        contentHash: result.document.contentHash,
        chunkCount: result.chunks.length,
      });
    } catch {
      const error = request.path.endsWith("/url")
        ? "URL ingestion failed"
        : request.path.endsWith("/file") ? "File ingestion failed" : "Knowledge ingestion failed";
      return response(request.path.endsWith("/url") || request.path.endsWith("/file") ? 422 : 500, { error });
    }
  }

  return response(404, { error: "Not found" });
}
