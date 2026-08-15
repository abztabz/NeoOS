import type {
  AuthorityClass,
  FreshnessRequirement,
  KnowledgeDocumentInput,
  KnowledgeQueryRequest,
  KnowledgeSourceInput,
  LifecycleStatus,
  VerificationStatus,
} from "./contracts.js";
import type { FileIngestionRequest } from "./file-ingest.js";
import type { TextIngestionRequest } from "./ingest.js";
import type { UrlIngestionRequest } from "./url-ingest.js";

const authorityClasses = new Set<AuthorityClass>([
  "primary-authority", "peer-reviewed", "official-documentation",
  "reputable-secondary", "community", "unknown",
]);
const freshnessValues = new Set<FreshnessRequirement>(["historical", "stable", "current", "live"]);
const verificationValues = new Set<VerificationStatus>(["unverified", "verified", "challenged"]);
const lifecycleValues = new Set<LifecycleStatus>([
  "candidate", "ingested", "verified", "active", "challenged", "superseded", "archived",
]);

function object(value: unknown, field = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, maxLength: number, required = true): string | undefined {
  if (value == null && !required) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) throw new Error(`${field} is invalid`);
  return normalized || undefined;
}

function metadata(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  const record = object(value, field);
  if (Object.keys(record).length > 50) throw new Error(`${field} is invalid`);
  let serialized: string;
  try { serialized = JSON.stringify(record); } catch { throw new Error(`${field} is invalid`); }
  if (serialized.length > 65_536) throw new Error(`${field} is too large`);
  return record;
}

function date(value: unknown, field: string): string | undefined {
  const parsed = string(value, field, 100, false);
  if (!parsed) return undefined;
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${field} is invalid`);
  return parsed;
}

export function parseRuntimeSource(value: unknown): KnowledgeSourceInput {
  const source = object(value, "source");
  const authority = string(source.authorityClass, "source.authorityClass", 64) as AuthorityClass;
  if (!authorityClasses.has(authority)) throw new Error("source.authorityClass is invalid");
  return {
    name: string(source.name, "source.name", 300)!,
    sourceType: string(source.sourceType, "source.sourceType", 100)!,
    canonicalUrl: string(source.canonicalUrl, "source.canonicalUrl", 2_048, false),
    publisher: string(source.publisher, "source.publisher", 300, false),
    authorityClass: authority,
    licenseSpdx: string(source.licenseSpdx, "source.licenseSpdx", 100, false),
    licenseUri: string(source.licenseUri, "source.licenseUri", 2_048, false),
    freshnessPolicy: string(source.freshnessPolicy, "source.freshnessPolicy", 500, false),
    metadata: metadata(source.metadata, "source.metadata"),
  };
}

export function parseRuntimeDocument(value: unknown): Omit<KnowledgeDocumentInput, "retrievedAt"> & { retrievedAt?: string } {
  const document = object(value, "document");
  const verification = string(document.verificationStatus, "document.verificationStatus", 32, false) as VerificationStatus | undefined;
  if (verification && !verificationValues.has(verification)) throw new Error("document.verificationStatus is invalid");
  const lifecycle = string(document.lifecycleStatus, "document.lifecycleStatus", 32, false) as LifecycleStatus | undefined;
  if (lifecycle && !lifecycleValues.has(lifecycle)) throw new Error("document.lifecycleStatus is invalid");
  return {
    title: string(document.title, "document.title", 500)!,
    author: string(document.author, "document.author", 300, false),
    publishedAt: date(document.publishedAt, "document.publishedAt"),
    retrievedAt: date(document.retrievedAt, "document.retrievedAt"),
    canonicalUrl: string(document.canonicalUrl, "document.canonicalUrl", 2_048, false),
    mimeType: string(document.mimeType, "document.mimeType", 200, false),
    language: string(document.language, "document.language", 50, false),
    projectScope: string(document.projectScope, "document.projectScope", 100, false),
    knowledgeDomain: string(document.knowledgeDomain, "document.knowledgeDomain", 100, false),
    verificationStatus: verification,
    lifecycleStatus: lifecycle,
    licenseStatus: string(document.licenseStatus, "document.licenseStatus", 100, false),
    metadata: metadata(document.metadata, "document.metadata"),
  };
}

function chunking(value: Record<string, unknown>): Pick<TextIngestionRequest, "chunkSize" | "overlap"> {
  const chunkSize = value.chunkSize == null ? undefined : Number(value.chunkSize);
  const overlap = value.overlap == null ? undefined : Number(value.overlap);
  if (chunkSize !== undefined && (!Number.isInteger(chunkSize) || chunkSize < 300 || chunkSize > 10_000)) throw new Error("chunkSize is invalid");
  if (overlap !== undefined && (!Number.isInteger(overlap) || overlap < 0 || overlap >= (chunkSize ?? 1_800))) throw new Error("overlap is invalid");
  return { chunkSize, overlap };
}

export function parseTextIngestion(value: unknown): TextIngestionRequest {
  const body = object(value, "body");
  return {
    source: parseRuntimeSource(body.source),
    document: parseRuntimeDocument(body.document),
    content: string(body.content, "content", 2_000_000)!,
    ...chunking(body),
  };
}

export function parseUrlIngestion(value: unknown): UrlIngestionRequest {
  const body = object(value, "body");
  const rawUrl = string(body.url, "url", 2_048)!;
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("url is invalid"); }
  if (url.protocol !== "https:") throw new Error("url must use HTTPS");
  return {
    url: url.toString(),
    source: parseRuntimeSource(body.source),
    document: parseRuntimeDocument(body.document),
    ...chunking(body),
  };
}

export function parseFileIngestion(value: unknown): FileIngestionRequest {
  const body = object(value, "body");
  if (!(body.bytes instanceof Uint8Array)) throw new Error("file bytes must be a Uint8Array");
  return {
    filename: string(body.filename, "filename", 500)!,
    declaredMimeType: string(body.declaredMimeType, "declaredMimeType", 200, false),
    bytes: body.bytes,
    source: parseRuntimeSource(body.source),
    document: parseRuntimeDocument(body.document),
    ...chunking(body),
  };
}

export function parseKnowledgeQuery(value: unknown): KnowledgeQueryRequest {
  const body = object(value, "body");
  const freshness = string(body.freshnessRequirement, "freshnessRequirement", 20, false) as FreshnessRequirement | undefined;
  if (freshness && !freshnessValues.has(freshness)) throw new Error("freshnessRequirement is invalid");
  const limit = body.limit == null ? undefined : Number(body.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) throw new Error("limit is invalid");
  let registryCapabilities: string[] | undefined;
  if (body.registryCapabilities != null) {
    if (!Array.isArray(body.registryCapabilities) || body.registryCapabilities.length > 10) throw new Error("registryCapabilities is invalid");
    registryCapabilities = body.registryCapabilities.map((item, index) => string(item, `registryCapabilities[${index}]`, 100)!);
  }
  return {
    query: string(body.query, "query", 4_000)!,
    projectScope: string(body.projectScope, "projectScope", 100, false),
    freshnessRequirement: freshness,
    limit,
    registryCapabilities,
  };
}
