# Knowledge Core Foundation Verification Record

**Issue:** #1  
**Branch:** `agent/knowledge-core-foundation`  
**Status:** Implemented in branch; local structural tests pass; infrastructure not deployed.

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
- Schema isolates Knowledge Core in a private schema, enables RLS on every table, and grants no table access to `anon` or `authenticated` roles.
- NeoOS CIO is not referenced as a dependency or backend.

## Local verification result

TypeScript compilation passed and 4/4 Node tests passed on 2026-08-15, including the schema RLS/private-access guard. The first test run identified a chunk-boundary overflow; the implementation was corrected and the full suite then passed.

## Not yet verified

- Supabase migration execution against a dedicated Knowledge Core project.
- pgvector query performance at production corpus scale.
- Storage ingestion for PDFs/DOCX/URLs.
- Runtime authentication between consuming NeoOS projects and Knowledge Core.
- Production deployment, observability, backups, or disaster recovery.

Those items remain gated and must not be represented as production-ready.
