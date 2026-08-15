# Knowledge Core Foundation Verification Record

**Issue:** #1  
**Branch:** `agent/knowledge-core-foundation`  
**Status:** Implemented in branch; local structural tests passed; dedicated Neon project provisioned; production schema migration pending governed commit.

## Evidence

- Module boundary: `modules/knowledge-core/README.md`
- Type contracts: `modules/knowledge-core/src/contracts.ts`
- Text ingestion: `modules/knowledge-core/src/ingest.ts`
- Retrieval/router foundation: `modules/knowledge-core/src/retrieval.ts`
- Source Registry boundary: `modules/knowledge-core/src/source-registry.ts`
- Database schema blueprint: `modules/knowledge-core/sql/schema.sql`
- Verification tests: `modules/knowledge-core/tests/knowledge-core.test.ts`
- Architectural decision: `docs/adrs/0003-shared-knowledge-core.md`

## Verified properties

- External knowledge defaults to untrusted.
- Content and chunks receive deterministic SHA-256 hashes.
- Embeddings are optional and accessed through a replaceable provider interface.
- Retrieval can combine lexical evidence, semantic evidence, and internal decisions while preserving evidence type.
- Current/live requirements can trigger Source Registry candidate resolution.
- Source Registry integration is capability-based.
- Schema isolates Knowledge Core in a private PostgreSQL schema, enables RLS on every table, and embeds no vendor-specific database roles.
- NeoOS CIO is not referenced as a dependency or backend.
- A dedicated Neon Postgres project named `NeoOS Knowledge Core` has been provisioned for the shared infrastructure boundary.

## Local verification result

TypeScript compilation passed and 4/4 Node tests passed on 2026-08-15, including the schema RLS/private-access guard. The first test run identified a chunk-boundary overflow; the implementation was corrected and the full suite then passed. The schema guard was subsequently updated to require provider-neutral PostgreSQL/pgvector semantics after the infrastructure target changed from Supabase to Neon.

## Infrastructure decision

The initial attempt to provision a dedicated Supabase project was blocked by the active free-project limit. Existing project databases and `neoos-cio` were deliberately not reused because Knowledge Core requires an independent shared data boundary. Neon Postgres was selected as the current deployment target because it preserves the PostgreSQL + pgvector architecture while keeping the domain schema portable.

## Not yet verified

- Main-branch Neon schema migration completion.
- pgvector query performance at production corpus scale.
- Storage ingestion for PDFs/DOCX/URLs.
- Runtime authentication between consuming NeoOS projects and Knowledge Core.
- Production API deployment, observability, backups, or disaster recovery.

Those items remain gated and must not be represented as production-ready.
