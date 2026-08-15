import type { KnowledgeSourceInput, StoredSource } from "./contracts.js";
import { PostgresKnowledgeRepository, type SqlExecutor, type SqlRow } from "./postgres-repository.js";

const text = (value: unknown): string => String(value ?? "");
const optionalText = (value: unknown): string | undefined => value == null ? undefined : String(value);
const metadata = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

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
    metadata: metadata(row.metadata),
  };
}

/**
 * Source identity is part of the trust boundary.
 *
 * The Foundation repository matched canonical URL alone, which is convenient
 * for a single trusted writer but unsafe once multiple project consumers can
 * ingest content. Phase 2 namespaces consumer source types by project and this
 * repository requires both canonical URL and source type to match before a
 * source can be reused. Existing source authority/license/publisher fields are
 * deliberately immutable through normal ingestion; governance can manage
 * those fields through a separate privileged path later.
 */
export class ScopedPostgresKnowledgeRepository extends PostgresKnowledgeRepository {
  constructor(private readonly scopedSql: SqlExecutor) {
    super(scopedSql);
  }

  override async upsertSource(source: KnowledgeSourceInput): Promise<StoredSource> {
    const existing = await this.scopedSql.query(
      `select * from knowledge_core.knowledge_sources
       where ($3::text is not null and canonical_url = $3 and source_type = $2)
          or ($3::text is null and name = $1 and source_type = $2)
       order by created_at asc
       limit 1`,
      [source.name, source.sourceType, source.canonicalUrl ?? null],
    );

    if (existing[0]) {
      const rows = await this.scopedSql.query(
        `update knowledge_core.knowledge_sources
         set last_checked_at = now(),
             updated_at = now(),
             metadata = metadata || $2::jsonb
         where id = $1
         returning *`,
        [text(existing[0].id), JSON.stringify(source.metadata ?? {})],
      );
      if (!rows[0]) throw new Error("Knowledge source refresh returned no row");
      return toSource(rows[0]);
    }

    const rows = await this.scopedSql.query(
      `insert into knowledge_core.knowledge_sources
         (name, source_type, canonical_url, publisher, authority_class,
          license_spdx, license_uri, freshness_policy, last_checked_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::jsonb)
       returning *`,
      [
        source.name,
        source.sourceType,
        source.canonicalUrl ?? null,
        source.publisher ?? null,
        source.authorityClass,
        source.licenseSpdx ?? null,
        source.licenseUri ?? null,
        source.freshnessPolicy ?? null,
        JSON.stringify(source.metadata ?? {}),
      ],
    );
    if (!rows[0]) throw new Error("Knowledge source insert returned no row");
    return toSource(rows[0]);
  }
}
