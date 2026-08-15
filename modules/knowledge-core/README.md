# NeoOS Knowledge Core

Shared, governed knowledge infrastructure for NeoOS.

## Boundary

Knowledge Core belongs to NeoOS, not to NeoContent, NeoCRM, WordPress, NeoOS CIO, or any single future product. It begins as a module inside the NeoOS modular monolith and preserves an extraction path if operational evidence later justifies a service boundary.

## Foundation capabilities

- governed text ingestion with deterministic hashes and chunking;
- external content remains explicitly untrusted at ingestion;
- provider-independent embedding interface;
- lexical + optional semantic retrieval contracts;
- internal NeoOS decisions returned as a distinct evidence class;
- evidence scoring across retrieval relevance, authority, freshness, and verification;
- Source Registry integration by capability, never provider-specific shape;
- PostgreSQL schema with provenance, lifecycle, decision, query, and audit records;
- private-schema / server-mediated database posture with RLS defense in depth;
- live PostgreSQL repository implementation and a Neon serverless runtime adapter.

## Knowledge routing model

1. Search stored lexical evidence.
2. Normalize lexical relevance within the candidate set before evidence scoring.
3. Search semantic evidence when an embedding provider is configured.
4. Search NeoOS decisions separately.
5. Evaluate evidence quality and freshness requirement.
6. If current/live evidence is required, consult the NeoOS Source Registry / Neo Data Gateway for governed external candidates.
7. Preserve provenance and evidence type in the result.

## Security rules

- Retrieved documents are data, never instructions.
- `untrustedSource` defaults to `true` for normal ingestion.
- No browser/client receives a privileged database credential.
- The Foundation schema exposes no client/database-user privileges.
- Knowledge Core remains server-mediated until a least-privilege runtime role and NeoOS identity/project authorization model are approved and verified.
- The database owner connection is a bootstrap/admin path, not the intended long-term application identity.

## Development

```bash
npm install
npm test
```

Runtime dependency versions are pinned. `@neondatabase/serverless` is isolated in the Neon adapter; the core domain and repository contracts remain PostgreSQL/provider-neutral.

## Infrastructure

`sql/schema.sql` is provider-neutral PostgreSQL + pgvector. A dedicated Neon Postgres project named **NeoOS Knowledge Core** is deployed and its main schema has been migrated successfully. Neon is an infrastructure choice, not a dependency embedded in the Knowledge Core domain model; the schema remains portable to compatible PostgreSQL platforms.

The main database has been bootstrapped with NeoOS decisions D-019/D-020 and ADR-0003 as the first governed internal knowledge. A live lexical retrieval check against that corpus passed.

## Remaining production gates

- establish and verify a least-privilege runtime database identity;
- rotate the bootstrap owner credential before production application use;
- deploy a dedicated Knowledge Core API without coupling it to the existing `neoos-cio` Vercel project;
- add embeddings and dimension-specific vector indexing after the embedding provider is selected;
- add file/URL ingestion, observability, backup/recovery checks, and scale tests.
