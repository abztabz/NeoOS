import type { KnowledgeQueryRequest, KnowledgeQueryResult } from "./contracts.js";
import type { SqlExecutor, SqlRow } from "./postgres-repository.js";

export interface KnowledgeRuntimeHealth {
  databaseReachable: boolean;
  vectorEnabled: boolean;
  knowledgeSchemaPresent: boolean;
}

const rowId = (row: SqlRow | undefined): string => String(row?.id ?? "");

export class PostgresKnowledgeTelemetry {
  constructor(private readonly sql: SqlExecutor) {}

  async recordQuery(
    request: KnowledgeQueryRequest,
    result: KnowledgeQueryResult,
    requestedBy?: string,
  ): Promise<string> {
    const rows = await this.sql.query(
      `insert into knowledge_core.knowledge_queries
         (query, project_scope, freshness_requirement, requested_by, live_research_required, route)
       values ($1,$2,$3,$4,$5,$6::jsonb)
       returning id`,
      [
        request.query,
        request.projectScope ?? "global",
        request.freshnessRequirement ?? "stable",
        requestedBy ?? null,
        result.liveResearchRequired,
        JSON.stringify({ ...result.route, registryCapabilities: request.registryCapabilities ?? [] }),
      ],
    );
    const queryId = rowId(rows[0]);
    if (!queryId) throw new Error("Knowledge query telemetry insert returned no id");

    for (const evidence of result.evidence) {
      await this.sql.query(
        `insert into knowledge_core.knowledge_query_evidence
           (query_id, chunk_id, decision_id, evidence_kind, score, provenance)
         values ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          queryId,
          evidence.kind === "knowledge" ? evidence.id : null,
          evidence.kind === "decision" ? evidence.id : null,
          evidence.kind,
          evidence.score,
          JSON.stringify({ title: evidence.title, projectScope: evidence.projectScope, ...evidence.provenance }),
        ],
      );
    }

    for (const candidate of result.externalCandidates) {
      await this.sql.query(
        `insert into knowledge_core.knowledge_query_evidence
           (query_id, chunk_id, decision_id, evidence_kind, score, provenance)
         values ($1,null,null,'external-candidate',0,$2::jsonb)`,
        [queryId, JSON.stringify({
          capability: candidate.capability,
          selectedProvider: candidate.selectedProvider,
          observationTimestamp: candidate.observationTimestamp,
          sourceObservationTimestamp: candidate.sourceObservationTimestamp,
          durationMs: candidate.durationMs,
          provenance: candidate.provenance,
        })],
      );
    }

    return queryId;
  }

  async audit(
    actor: string,
    action: string,
    entityType: string,
    entityId?: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.sql.query(
      `insert into knowledge_core.audit_log
         (actor, action, entity_type, entity_id, details)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [actor, action, entityType, entityId ?? null, JSON.stringify(details)],
    );
  }

  async health(): Promise<KnowledgeRuntimeHealth> {
    const rows = await this.sql.query(
      `select
         true as database_reachable,
         exists(select 1 from pg_extension where extname = 'vector') as vector_enabled,
         exists(select 1 from information_schema.schemata where schema_name = 'knowledge_core') as knowledge_schema_present`,
    );
    const row = rows[0];
    return {
      databaseReachable: row?.database_reachable === true,
      vectorEnabled: row?.vector_enabled === true,
      knowledgeSchemaPresent: row?.knowledge_schema_present === true,
    };
  }
}
