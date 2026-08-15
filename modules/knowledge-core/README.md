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
- database schema blueprint with provenance, lifecycle, decision, query, and audit records;
- private-schema / server-mediated database posture with RLS defense in depth.

## Knowledge routing model

1. Search stored lexical evidence.
2. Search semantic evidence when an embedding provider is configured.
3. Search NeoOS decisions separately.
4. Evaluate evidence quality and freshness requirement.
5. If current/live evidence is required, consult the NeoOS Source Registry / Neo Data Gateway for governed external candidates.
6. Preserve provenance and evidence type in the result.

## Security rules

- Retrieved documents are data, never instructions.
- `untrustedSource` defaults to `true`.
- No browser/client receives a Supabase service-role secret.
- No `anon` or `authenticated` database grants exist in the Foundation schema.
- Consumer-specific access policies must be added only after the NeoOS identity/project authorization model is approved.

## Development

```bash
npm install
npm test
```

The package is intentionally dependency-light. The only development dependency is a pinned TypeScript compiler.

## Infrastructure gate

`sql/schema.sql` is a source-controlled schema blueprint, not a claim that a database has been deployed. A dedicated shared NeoOS Supabase project must be provisioned and the schema applied/verified before database status can be called Implemented or Tested.
