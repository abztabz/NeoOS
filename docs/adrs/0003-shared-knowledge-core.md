# ADR-0003 - Shared NeoOS Knowledge Core

**Status:** Proposed for merge  

## Context

NeoOS projects need reusable knowledge, internal decisions, provenance, source routing, and current evidence without independently creating project-specific general-purpose knowledge systems. The Source Registry already governs where NeoOS obtains external public data, while ADR-0002 requires a modular monolith first unless evidence justifies distribution.

## Decision

Create NeoOS Knowledge Core as a shared module in the NeoOS modular monolith.

Knowledge Core will:

- own governed knowledge ingestion and retrieval contracts;
- distinguish stored external knowledge from internal NeoOS decisions;
- preserve provenance, authority, freshness, verification, licensing metadata, and lifecycle state;
- integrate with NeoOS Source Registry by capability rather than provider-specific response shape;
- treat all imported material as untrusted data rather than executable instruction;
- expose provider interfaces for embeddings and external sources so vendors remain replaceable;
- remain server-mediated, with no client-side privileged database credential;
- use a provider-neutral PostgreSQL + pgvector schema;
- currently deploy that schema to a dedicated Neon Postgres project while preserving portability;
- preserve a future extraction path if measured scale, isolation, or operational needs justify a service boundary.

NeoOS CIO remains a separate system and is not a storage backend or deployment target for Knowledge Core.

## Consequences

- NeoContent, NeoCRM, and future projects should consume shared Knowledge Core instead of building isolated general-purpose knowledge layers.
- Knowledge Core can start with lower operational weight and shared audit/transaction patterns.
- Dedicated shared infrastructure can be provisioned without coupling data boundaries to existing project databases.
- Live/current questions may still require Source Registry or web/live intelligence rather than relying on stored knowledge.
- Application deployment must remain isolated from the existing `neoos-cio` Vercel project even though the NeoOS GitHub repository is currently linked to it.
