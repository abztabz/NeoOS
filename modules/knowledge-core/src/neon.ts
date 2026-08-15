import { neon } from "@neondatabase/serverless";
import type { EmbeddingProvider, KnowledgeQueryRequest, KnowledgeQueryResult, SourceRegistryAdapter } from "./contracts.js";
import { ingestText, type TextIngestionRequest, type TextIngestionResult } from "./ingest.js";
import { PostgresKnowledgeRepository, type SqlExecutor, type SqlRow } from "./postgres-repository.js";
import { queryKnowledge } from "./retrieval.js";
import { HttpSourceRegistryAdapter } from "./source-registry.js";

export interface NeonKnowledgeRuntimeOptions {
  databaseUrl?: string;
  embedder?: EmbeddingProvider;
  registry?: SourceRegistryAdapter;
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

export function createNeonKnowledgeRuntime(options: NeonKnowledgeRuntimeOptions = {}) {
  const repository = new PostgresKnowledgeRepository(createNeonSqlExecutor(options.databaseUrl));
  const registry = options.registry ?? registryFromEnvironment();
  return {
    repository,
    ingest(request: TextIngestionRequest): Promise<TextIngestionResult> {
      return ingestText(request, { repository, embedder: options.embedder });
    },
    query(request: KnowledgeQueryRequest): Promise<KnowledgeQueryResult> {
      return queryKnowledge(request, {
        repository,
        embedder: options.embedder,
        registry,
      });
    },
  };
}
