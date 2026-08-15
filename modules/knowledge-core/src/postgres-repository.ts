import type {
  ChunkInput,
  DecisionEvidence,
  KnowledgeDocumentInput,
  KnowledgeRepository,
  KnowledgeSourceInput,
  SearchHit,
  StoredChunk,
  StoredDocument,
  StoredSource,
} from "./contracts.js";

export type SqlRow = Record<string, unknown>;

export interface SqlExecutor {
  query<T extends SqlRow = SqlRow>(text: string, params?: unknown[]): Promise<T[]>;
}

const text = (value: unknown): string => String(value ?? "");
const optionalText = (value: unknown): string | undefined => value == null ? undefined : String(value);
const timestamp = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optionalTimestamp = (value: unknown): string | undefined => value == null ? undefined : timestamp(value);
const jsonObject = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};
const jsonArray = (value: unknown): unknown[] | undefined => Array.isArray(value) ? value : undefined;

function toSource(row: SqlRow): StoredSource {
  return {
    id: text(row.id),
    name: text(row.name),
    sourceType: text(row.source_type),
    canonicalUrl: optionalText(row.canonical_url),
    publisher: optionalText(row.publisher),
    authorityClass: text(row.authority_class) as StoredSource["authorityClass"],
    licenseSpdx: optionalText(row.license_spdx),
    licenseUri: optionalText(row.license_uri),
    freshnessPolicy: optionalText(row.freshness_policy),
    metadata: jsonObject(row.metadata),
  };
}

function toDocument(row: SqlRow): StoredDocument {
  return {
    id: text(row.id),
    sourceId: text(row.source_id),
    title: text(row.title),
    author: optionalText(row.author),
    publishedAt: optionalTimestamp(row.published_at),
    retrievedAt: timestamp(row.retrieved_at),
    canonicalUrl: optionalText(row.canonical_url),
    mimeType: optionalText(row.mime_type),
    language: optionalText(row.language),
    projectScope: text(row.project_scope || "global"),
    knowledgeDomain: optionalText(row.knowledge_domain),
    verificationStatus: text(row.verification_status) as StoredDocument["verificationStatus"],
    lifecycleStatus: text(row.lifecycle_status) as StoredDocument["lifecycleStatus"],
    licenseStatus: optionalText(row.license_status),
    metadata: jsonObject(row.document_metadata ?? row.metadata),
    contentHash: text(row.content_hash),
    untrustedSource: Boolean(row.untrusted_source),
  };
}

function toChunk(row: SqlRow): StoredChunk {
  const embedding = Array.isArray(row.embedding) ? row.embedding.map(Number) : undefined;
  return {
    id: text(row.chunk_id ?? row.id),
    documentId: text(row.document_id),
    chunkIndex: Number(row.chunk_index),
    section: optionalText(row.section),
    pageNumber: row.page_number == null ? undefined : Number(row.page_number),
    content: text(row.content),
    contentHash: text(row.chunk_content_hash ?? row.content_hash),
    embedding,
    embeddingModel: optionalText(row.embedding_model),
    embeddingDimensions: row.embedding_dimensions == null ? undefined : Number(row.embedding_dimensions),
    metadata: jsonObject(row.chunk_metadata ?? row.metadata),
  };
}

function toSearchHit(row: SqlRow): SearchHit {
  return {
    chunk: toChunk(row),
    document: toDocument(row),
    source: toSource({
      id: row.source_id,
      name: row.source_name,
      source_type: row.source_type,
      canonical_url: row.source_canonical_url,
      publisher: row.publisher,
      authority_class: row.authority_class,
      license_spdx: row.license_spdx,
      license_uri: row.license_uri,
      freshness_policy: row.freshness_policy,
      metadata: row.source_metadata,
    }),
    retrievalScore: Number(row.retrieval_score ?? 0),
    freshnessScore: Number(row.freshness_score ?? 0.5),
  };
}

const hitSelect = `
  c.id as chunk_id, c.document_id, c.chunk_index, c.section, c.page_number,
  c.content, c.content_hash as chunk_content_hash, c.embedding_model,
  c.embedding_dimensions, c.metadata as chunk_metadata,
  d.id, d.source_id, d.title, d.author, d.published_at, d.retrieved_at,
  d.canonical_url, d.mime_type, d.language, d.project_scope, d.knowledge_domain,
  d.verification_status, d.lifecycle_status, d.license_status,
  d.untrusted_source, d.content_hash, d.metadata as document_metadata,
  s.name as source_name, s.source_type, s.canonical_url as source_canonical_url,
  s.publisher, s.authority_class, s.license_spdx, s.license_uri,
  s.freshness_policy, s.metadata as source_metadata,
  case
    when d.published_at is null then 0.5
    when d.published_at >= now() - interval '30 days' then 1.0
    when d.published_at >= now() - interval '180 days' then 0.8
    when d.published_at >= now() - interval '730 days' then 0.6
    else 0.4
  end::float8 as freshness_score`;

export class PostgresKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async upsertSource(source: KnowledgeSourceInput): Promise<StoredSource> {
    const existing = await this.sql.query(
      `select * from knowledge_core.knowledge_sources
       where ($3::text is not null and canonical_url = $3)
          or ($3::text is null and name = $1 and source_type = $2)
       order by created_at asc limit 1`,
      [source.name, source.sourceType, source.canonicalUrl ?? null],
    );

    if (existing[0]) {
      const rows = await this.sql.query(
        `update knowledge_core.knowledge_sources set
           name = $2, source_type = $3, canonical_url = $4, publisher = $5,
           authority_class = $6, license_spdx = $7, license_uri = $8,
           freshness_policy = $9, metadata = metadata || $10::jsonb,
           last_checked_at = now(), updated_at = now()
         where id = $1 returning *`,
        [
          text(existing[0].id), source.name, source.sourceType, source.canonicalUrl ?? null,
          source.publisher ?? null, source.authorityClass, source.licenseSpdx ?? null,
          source.licenseUri ?? null, source.freshnessPolicy ?? null,
          JSON.stringify(source.metadata ?? {}),
        ],
      );
      if (!rows[0]) throw new Error("Knowledge source update returned no row");
      return toSource(rows[0]);
    }

    const rows = await this.sql.query(
      `insert into knowledge_core.knowledge_sources
         (name, source_type, canonical_url, publisher, authority_class,
          license_spdx, license_uri, freshness_policy, last_checked_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::jsonb)
       returning *`,
      [
        source.name, source.sourceType, source.canonicalUrl ?? null, source.publisher ?? null,
        source.authorityClass, source.licenseSpdx ?? null, source.licenseUri ?? null,
        source.freshnessPolicy ?? null, JSON.stringify(source.metadata ?? {}),
      ],
    );
    if (!rows[0]) throw new Error("Knowledge source insert returned no row");
    return toSource(rows[0]);
  }

  async insertDocument(input: KnowledgeDocumentInput & { sourceId: string; contentHash: string; untrustedSource: boolean }): Promise<StoredDocument> {
    const rows = await this.sql.query(
      `insert into knowledge_core.knowledge_documents
         (source_id, title, author, published_at, retrieved_at, canonical_url,
          content_hash, mime_type, language, project_scope, knowledge_domain,
          verification_status, lifecycle_status, license_status, untrusted_source, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
       on conflict (source_id, content_hash) do update set
         title = excluded.title, author = excluded.author,
         published_at = excluded.published_at, retrieved_at = excluded.retrieved_at,
         canonical_url = excluded.canonical_url, mime_type = excluded.mime_type,
         language = excluded.language, project_scope = excluded.project_scope,
         knowledge_domain = excluded.knowledge_domain,
         verification_status = excluded.verification_status,
         lifecycle_status = excluded.lifecycle_status,
         license_status = excluded.license_status,
         untrusted_source = excluded.untrusted_source,
         metadata = knowledge_core.knowledge_documents.metadata || excluded.metadata
       returning *`,
      [
        input.sourceId, input.title, input.author ?? null, input.publishedAt ?? null,
        input.retrievedAt, input.canonicalUrl ?? null, input.contentHash,
        input.mimeType ?? null, input.language ?? null, input.projectScope ?? "global",
        input.knowledgeDomain ?? null, input.verificationStatus ?? "unverified",
        input.lifecycleStatus ?? "ingested", input.licenseStatus ?? null,
        input.untrustedSource, JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (!rows[0]) throw new Error("Knowledge document insert returned no row");
    return toDocument(rows[0]);
  }

  async insertChunks(documentId: string, chunks: ChunkInput[]): Promise<StoredChunk[]> {
    const stored: StoredChunk[] = [];
    for (const chunk of chunks) {
      const vector = chunk.embedding ? `[${chunk.embedding.join(",")}]` : null;
      const rows = await this.sql.query(
        `insert into knowledge_core.knowledge_chunks
           (document_id, chunk_index, section, page_number, content, content_hash,
            embedding, embedding_model, embedding_dimensions, metadata)
         values ($1,$2,$3,$4,$5,$6,$7::vector,$8,$9,$10::jsonb)
         on conflict (document_id, chunk_index) do update set
           section = excluded.section, page_number = excluded.page_number,
           content = excluded.content, content_hash = excluded.content_hash,
           embedding = excluded.embedding, embedding_model = excluded.embedding_model,
           embedding_dimensions = excluded.embedding_dimensions,
           metadata = knowledge_core.knowledge_chunks.metadata || excluded.metadata
         returning id as chunk_id, document_id, chunk_index, section, page_number,
                   content, content_hash as chunk_content_hash, embedding_model,
                   embedding_dimensions, metadata as chunk_metadata`,
        [
          documentId, chunk.chunkIndex, chunk.section ?? null, chunk.pageNumber ?? null,
          chunk.content, chunk.contentHash, vector, chunk.embeddingModel ?? null,
          chunk.embeddingDimensions ?? null, JSON.stringify(chunk.metadata ?? {}),
        ],
      );
      if (!rows[0]) throw new Error(`Knowledge chunk ${chunk.chunkIndex} insert returned no row`);
      stored.push(toChunk(rows[0]));
    }
    await this.sql.query(
      `delete from knowledge_core.knowledge_chunks
       where document_id = $1 and chunk_index >= $2`,
      [documentId, chunks.length],
    );
    return stored;
  }

  async searchLexical(query: string, options: { projectScope: string; limit: number }): Promise<SearchHit[]> {
    const rows = await this.sql.query(
      `with q as (select websearch_to_tsquery('simple', $1) as value)
       select ${hitSelect}, ts_rank_cd(c.lexical, q.value)::float8 as retrieval_score
       from knowledge_core.knowledge_chunks c
       join knowledge_core.knowledge_documents d on d.id = c.document_id
       join knowledge_core.knowledge_sources s on s.id = d.source_id
       cross join q
       where c.lexical @@ q.value
         and d.lifecycle_status in ('ingested','verified','active')
         and (d.project_scope = 'global' or d.project_scope = $2)
       order by retrieval_score desc, d.retrieved_at desc
       limit $3`,
      [query, options.projectScope, options.limit],
    );
    return rows.map(toSearchHit);
  }

  async searchSemantic(embedding: number[], options: { projectScope: string; limit: number }): Promise<SearchHit[]> {
    if (!embedding.length) return [];
    const vector = `[${embedding.join(",")}]`;
    const rows = await this.sql.query(
      `select ${hitSelect}, greatest(0, 1 - (c.embedding <=> $1::vector))::float8 as retrieval_score
       from knowledge_core.knowledge_chunks c
       join knowledge_core.knowledge_documents d on d.id = c.document_id
       join knowledge_core.knowledge_sources s on s.id = d.source_id
       where c.embedding is not null
         and c.embedding_dimensions = $2
         and d.lifecycle_status in ('ingested','verified','active')
         and (d.project_scope = 'global' or d.project_scope = $3)
       order by c.embedding <=> $1::vector
       limit $4`,
      [vector, embedding.length, options.projectScope, options.limit],
    );
    return rows.map(toSearchHit);
  }

  async searchDecisions(query: string, options: { projectScope: string; limit: number }): Promise<DecisionEvidence[]> {
    const rows = await this.sql.query(
      `with q as (select websearch_to_tsquery('simple', $1) as value)
       select d.*,
         ts_rank_cd(to_tsvector('simple', d.decision_key || ' ' || d.decision || ' ' || d.rationale), q.value)::float8 as rank
       from knowledge_core.neoos_decisions d cross join q
       where to_tsvector('simple', d.decision_key || ' ' || d.decision || ' ' || d.rationale) @@ q.value
         and (d.project_scope = 'global' or d.project_scope = $2)
       order by rank desc, d.decided_at desc
       limit $3`,
      [query, options.projectScope, options.limit],
    );
    return rows.map((row) => ({
      id: text(row.id),
      decisionKey: text(row.decision_key),
      projectScope: text(row.project_scope),
      decision: text(row.decision),
      rationale: text(row.rationale),
      status: text(row.status),
      decidedAt: timestamp(row.decided_at),
      supersedes: optionalText(row.supersedes),
      evidence: jsonArray(row.evidence),
    }));
  }
}
