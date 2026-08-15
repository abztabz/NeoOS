import { neon } from "@neondatabase/serverless";
import type { EmbeddingProvider, KnowledgeQueryRequest, KnowledgeQueryResult, SourceRegistryAdapter } from "./contracts.js";
import { ingestFile, type FileIngestionPolicy, type FileIngestionRequest } from "./file-ingest.js";
import { ingestText, type TextIngestionRequest, type TextIngestionResult } from "./ingest.js";
import { PostgresKnowledgeRepository, type SqlExecutor, type SqlRow } from "./postgres-repository.js";
import { PostgresKnowledgeTelemetry, type KnowledgeRuntimeHealth } from "./postgres-telemetry.js";
import { queryKnowledge } from "./retrieval.js";
import { HttpSourceRegistryAdapter } from "./source-registry.js";
import { ingestUrl, type UrlIngestionPolicy, type UrlIngestionRequest } from "./url-ingest.js";

export interface KnowledgeRuntimeContext {
  actor?: string;
}

export interface NeonKnowledgeRuntimeOptions {
  databaseUrl?: string;
  embedder?: EmbeddingProvider;
  registry?: SourceRegistryAdapter;
  urlPolicy?: UrlIngestionPolicy;
  filePolicy?: FileIngestionPolicy;
  captureQueryText?: boolean;
}

export function createNeonSqlExecutor(databaseUrl?: string): SqlExecutor {
  const connectionString = databaseUrl ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for NeoOS Knowledge Core");
  const sql = neon(connectionString);
  return {
    async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []): Promise<T[]> {
      return await sql.query(text, params) as T[];
    },
  };
}

function registryFromEnvironment(): SourceRegistryAdapter | undefined {
  const token = process.env.NEO_SOURCE_REGISTRY_TOKEN?.trim();
  if (!token) return undefined;
  return new HttpSourceRegistryAdapter({
    baseUrl: process.env.NEO_SOURCE_REGISTRY_URL?.trim() || "https://neoos-source-registry.vercel.app",
    consumer: process.env.NEO_SOURCE_REGISTRY_CONSUMER?.trim() || "knowledge-core",
    token,
  });
}

const actorFrom = (context?: KnowledgeRuntimeContext): string => context?.actor?.trim() || "neoos-system";

export function createNeonKnowledgeRuntime(options: NeonKnowledgeRuntimeOptions = {}) {
  const sql = createNeonSqlExecutor(options.databaseUrl);
  const repository = new PostgresKnowledgeRepository(sql);
  const telemetry = new PostgresKnowledgeTelemetry(sql, {
    captureQueryText: options.captureQueryText === true || process.env.NEO_KNOWLEDGE_CAPTURE_QUERY_TEXT === "true",
  });
  const registry = options.registry ?? registryFromEnvironment();

  return {
    repository,
    telemetry,

    async ingest(request: TextIngestionRequest, context?: KnowledgeRuntimeContext): Promise<TextIngestionResult> {
      const result = await ingestText(request, { repository, embedder: options.embedder });
      await telemetry.audit(actorFrom(context), "knowledge.ingest.text", "knowledge_document", result.document.id, {
        sourceId: result.source.id,
        contentHash: result.document.contentHash,
        chunkCount: result.chunks.length,
        projectScope: result.document.projectScope ?? "global",
      });
      return result;
    },

    async ingestUrl(request: UrlIngestionRequest, context?: KnowledgeRuntimeContext): Promise<TextIngestionResult> {
      const result = await ingestUrl(request, {
        repository,
        embedder: options.embedder,
        policy: options.urlPolicy,
      });
      await telemetry.audit(actorFrom(context), "knowledge.ingest.url", "knowledge_document", result.document.id, {
        sourceId: result.source.id,
        canonicalUrl: result.document.canonicalUrl,
        contentHash: result.document.contentHash,
        chunkCount: result.chunks.length,
        projectScope: result.document.projectScope ?? "global",
      });
      return result;
    },

    async ingestFile(request: FileIngestionRequest, context?: KnowledgeRuntimeContext): Promise<TextIngestionResult> {
      const result = await ingestFile(request, {
        repository,
        embedder: options.embedder,
        policy: options.filePolicy,
      });
      await telemetry.audit(actorFrom(context), "knowledge.ingest.file", "knowledge_document", result.document.id, {
        sourceId: result.source.id,
        contentHash: result.document.contentHash,
        originalFileSha256: result.document.metadata?.originalFileSha256,
        detectedFileType: result.document.metadata?.detectedFileType,
        chunkCount: result.chunks.length,
        projectScope: result.document.projectScope ?? "global",
      });
      return result;
    },

    async query(request: KnowledgeQueryRequest, context?: KnowledgeRuntimeContext): Promise<KnowledgeQueryResult> {
      const result = await queryKnowledge(request, {
        repository,
        embedder: options.embedder,
        registry,
      });
      await telemetry.recordQuery(request, result, actorFrom(context));
      return result;
    },

    health(): Promise<KnowledgeRuntimeHealth> {
      return telemetry.health();
    },
  };
}
