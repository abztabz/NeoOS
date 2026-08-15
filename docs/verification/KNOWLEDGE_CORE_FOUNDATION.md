# Knowledge Core Foundation Verification Record

**Issue:** #1  
**Branch:** `agent/knowledge-core-foundation`  
**Status:** Implemented in branch; dedicated Neon database deployed; live foundation retrieval verified; production API and least-privilege runtime identity still gated.

## Evidence

- Module boundary: `modules/knowledge-core/README.md`
- Type contracts: `modules/knowledge-core/src/contracts.ts`
- Text ingestion: `modules/knowledge-core/src/ingest.ts`
- Retrieval/router foundation: `modules/knowledge-core/src/retrieval.ts`
- PostgreSQL repository: `modules/knowledge-core/src/postgres-repository.ts`
- Neon runtime adapter: `modules/knowledge-core/src/neon.ts`
- Source Registry boundary: `modules/knowledge-core/src/source-registry.ts`
- Database schema: `modules/knowledge-core/sql/schema.sql`
- Verification tests: `modules/knowledge-core/tests/`
- Architectural decision: `docs/adrs/0003-shared-knowledge-core.md`

## Verified properties

- External knowledge defaults to untrusted.
- Content and chunks receive deterministic SHA-256 hashes.
- Embeddings are optional and accessed through a replaceable provider interface.
- Retrieval can combine lexical evidence, semantic evidence, and internal decisions while preserving evidence type.
- Lexical relevance is normalized within its candidate set before evidence scoring so PostgreSQL raw rank magnitude does not incorrectly force live research.
- Current/live requirements can trigger Source Registry candidate resolution.
- Source Registry integration is capability-based.
- Schema isolates Knowledge Core in a private PostgreSQL schema, enables RLS on every table, and embeds no vendor-specific database roles.
- NeoOS CIO is not a Knowledge Core data dependency or backend.
- A dedicated Neon Postgres project named `NeoOS Knowledge Core` is provisioned and the Foundation schema is applied to its main branch.
- `vector` and `pgcrypto` extensions were verified in Neon.
- All eight Knowledge Core tables were verified with RLS enabled.
- NeoOS decisions D-019 and D-020 are persisted in the live database.
- ADR-0003 is persisted as the first governed internal knowledge document and is retrievable through the live lexical path.

## Test history

The original local suite passed 4/4 tests on 2026-08-15 after fixing a chunk-boundary overflow. A regression test was then added for lexical score normalization after the live Neon acceptance query showed PostgreSQL full-text rank magnitude was not directly comparable to a 0..1 evidence score.

A GitHub Actions workflow has been added for Knowledge Core compilation/tests. At this stage its execution has not yet been observed through the connector, so CI must not be represented as passing until a run is visible.

## Infrastructure decision

The initial attempt to provision a dedicated Supabase project was blocked by the active free-project limit. Existing project databases and `neoos-cio` were deliberately not reused because Knowledge Core requires an independent shared data boundary. Neon Postgres was selected as the current deployment target because it preserves the PostgreSQL + pgvector architecture while keeping the domain schema portable.

## Security / deployment findings

- The NeoOS GitHub repository is currently linked to the existing `neoos-cio` Vercel project, causing Knowledge Core branch pushes to trigger failed CIO preview deployments. Knowledge Core must not be deployed through that binding.
- The Neon project owner identity is bootstrap/admin access and bypasses RLS; it is not the intended application identity.
- The provisioning response surfaced the initial owner connection string during setup. An attempted credential rotation through the connector was blocked by the connector safety layer. Rotate that bootstrap credential before production application use.

## Not yet verified

- Dedicated Knowledge Core API deployment.
- Least-privilege runtime database role/policies and application authentication.
- pgvector query performance at production corpus scale.
- Storage ingestion for PDFs/DOCX/URLs.
- Runtime authentication between consuming NeoOS projects and Knowledge Core.
- Production observability, backup/recovery checks, and disaster recovery.

Those items remain gated and must not be represented as production-ready.
