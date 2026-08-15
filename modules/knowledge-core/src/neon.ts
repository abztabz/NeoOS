import { neon } from "@neondatabase/serverless";
import type { EmbeddingProvider, KnowledgeQueryRequest, KnowledgeQueryResult, SourceRegistryAdapter } from "./contracts.js";
import { ingestText, type TextIngestionRequest, type TextIngestionResult } from "./ingest.js";
import { PostgresKnowledgeRepository, type SqlExecutor, type SqlRow } from "./postgres-repository.js";
import { queryKnowledge } from "./retrieval.js";

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

export function createNeonKnowledgeRuntime(options: NeonKnowledgeRuntimeOptions = {}) {
  const repository = new PostgresKnowledgeRepository(createNeonSqlExecutor(options.databaseUrl));
  return {
    repository,
    ingest(request: TextIngestionRequest): Promise<TextIngestionResult> {
      return ingestText(request, { repository, embedder: options.embedder });
    },
    query(request: KnowledgeQueryRequest): Promise<KnowledgeQueryResult> {
      return queryKnowledge(request, {
        repository,
        embedder: options.embedder,
        registry: options.registry,
      });
    },
  };
}
