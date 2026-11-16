# Knowledge Core Phase 2 Verification Record

**Issue:** #3  
**Pull request:** #4  
**Branch:** `agent/knowledge-core-phase-2`  
**Status:** Runtime hardening and governed ingestion implemented/CI-verified in branch; production runtime identity and isolated deployment remain gated.

## Implemented in this increment

- scoped machine-to-machine runtime authentication using SHA-256 bearer-token hashes;
- explicit query/ingest/admin action scopes and allowed project scopes;
- project-scope enforcement for query and ingestion;
- consumer trust claims cannot promote authority, verification or lifecycle state;
- source identity is trust-scoped to prevent canonical-URL source impersonation;
- normal source refresh cannot overwrite established authority/publisher/license fields;
- privacy-first query/evidence telemetry and audit persistence;
- coarse health endpoint;
- governed HTTPS URL ingestion with DNS/private-network validation and validated-IP socket pinning;
- redirect revalidation, bounded response size/time and content-type controls;
- governed PDF/DOCX/TXT/Markdown extraction with provenance and parser limits;
- deterministic dependency lock and hardened npm install policy;
- Node 24 runtime baseline with pinned PDF.js 6.1.200.

## CI evidence

GitHub Actions run `31900934837` completed successfully on 2026-08-15.

- Node: 24.11.1
- install: deterministic `npm ci`, with package `.npmrc` omitting optional dependencies and disabling lifecycle scripts;
- TypeScript compilation: passed;
- tests: **36/36 passed, 0 failed**.

The test suite includes the Foundation regression set plus Phase 2 tests covering:

- metadata/private/test network rejection for URL ingestion;
- mixed public/private DNS answer rejection;
- redirect-to-private rejection;
- proof that HTTPS transport receives the exact validated public IP;
- HTML inactive-content stripping;
- unsupported URL content-type rejection;
- runtime auth-not-configured, bad-token and scope-denial behavior;
- project isolation and prevention of global promotion;
- generic runtime errors without secret/internal-detail leakage;
- project consumer trust-escalation attempts;
- admin-only governed trust elevation and verified/active state consistency;
- trust-scoped source identity and immutable established authority metadata;
- query telemetry hashing by default and explicit raw-query opt-in;
- live-source payload exclusion from telemetry persistence;
- TXT/Markdown validation and provenance;
- real DOCX ZIP parsing and macro rejection;
- real PDF.js text extraction fixture;
- stale chunk cleanup and lexical score calibration.

## Supply-chain evidence

`modules/knowledge-core/package-lock.json` was generated from the CI-resolved dependency graph and committed. The package targets Node 24 and pins direct dependencies.

`modules/knowledge-core/.npmrc` enforces:

- `omit=optional`;
- `ignore-scripts=true`;
- `audit=false`;
- `fund=false`.

A CI run proved PDF extraction still passes with optional native canvas packages omitted, so those native binaries are not required for the Knowledge Core text-extraction path.

## Live Neon health/recovery evidence

Main database health was queried successfully on 2026-08-15:

- `knowledge_core` schema present;
- `vector` extension enabled;
- D-019 and D-020 present;
- governed Knowledge Core document present and retrievable.

A temporary recovery branch named `knowledge-core-recovery-check-2026-08-15` was created from main (branch ID `br-shy-cell-adumyonv`). The clone verified:

- Knowledge Core schema present;
- vector extension present;
- both seeded decisions present;
- governed document present.

The recovery branch was then deleted successfully. This verifies current branch-based recovery reproducibility without modifying main.

## Security findings closed in this increment

1. **DNS rebinding window:** initial URL design validated DNS then used normal fetch. Replaced with HTTPS transport pinned to the exact validated public IP while TLS validates the original hostname.
2. **Cross-project authorization:** consumer credentials are now bound to explicit project scopes.
3. **Global write promotion:** non-admin project credentials cannot create global knowledge.
4. **Trust self-promotion:** project ingestion cannot declare itself primary/verified/active operationally.
5. **Source impersonation:** canonical URL alone no longer permits reuse across source trust namespaces.
6. **Raw-query telemetry:** query text is hashed by default.
7. **External payload retention:** live candidate payload data is not copied into evidence telemetry.
8. **PDF provenance transfer:** original file hash is computed before parsing and PDF.js receives a copy of the byte buffer.
9. **Dependency drift/native optional surface:** lockfile committed; optional native canvas dependencies omitted and proven unnecessary by CI.

## Remaining production gates

The following are intentionally **not** represented as complete:

- least-privilege Neon runtime database identity/policies;
- rotation/revocation of the surfaced bootstrap Neon owner credential;
- isolated deployed Knowledge Core HTTP service;
- correction of the existing NeoOS-repository → `neoos-cio` Vercel project binding;
- production `knowledge-core` Source Registry consumer secret configuration;
- embedding provider selection and vector index performance validation;
- deployed API observability and load/scale testing.

Any database role/RLS migration must continue through the governed Neon temporary-branch migration workflow before main is changed.
