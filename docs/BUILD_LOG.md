# NeoOS CIO — Build Log

## 2026-07-24 — Session start
- Imported handoff package into repo root: `CLAUDE.md` (controlling directive), `docs/PRODUCT_SPEC.md`,
  `docs/ARCHITECTURE.md`, `schemas/neoos-report.schema.json`, `tests/ACCEPTANCE_TESTS.md`,
  `reference/` (approved visual baseline v2, mobile direction screenshot, static content reference,
  investment skill, constitution v1.0), `handoff/` (master prompt + handoff readme).
- Repo previously contained the NeoOS governance pack (docs/charters, constitution, SOPs); the app
  coexists at the root. Governance docs untouched.
- Wrote `docs/IMPLEMENTATION_PLAN.md`.

## 2026-07-24 — M1 Foundation + M2 Cockpit + M3 Workspaces + M4 Import
- Scaffolded at repo root: Next.js 16.2 (App Router), TypeScript strict (`noUncheckedIndexedAccess`),
  Tailwind CSS 4, Framer Motion, Recharts, Zod 4, Vitest 4 + RTL, Playwright 1.61.
- Replaced the Python-boilerplate `.gitignore` (its `lib/`, `build/`, `dist/` patterns would have
  ignored app source) with a Node/Next one.
- Generated PWA icons with a dependency-free PNG encoder (`scripts/gen-icons.mjs`); manifest via
  `src/app/manifest.ts`; installability metadata in the root layout.
- All six workspaces statically prerendered with demo content — the cockpit answers before
  hydration. Report state via `useSyncExternalStore`: server snapshot = demo report; client
  snapshot rehydrates localStorage with a defensive adapter (blocked storage → in-memory + notice).
- Import flow: file → 1 MB cap → safe JSON parse → Zod v1.0 validation → preview → atomic apply →
  persist. Invalid input never touches current state. Demo reset restores baseline.
- Decision: lint rule `react-hooks/set-state-in-effect` rejected the setState-in-effect rehydration
  pattern; switched to `useSyncExternalStore` (the correct primitive for an external store).

## 2026-07-24 — M5 Hardening + M6 Gates
- Unit tests: 23 (deployment/rating/cash/opportunity/confidence band boundaries, Zod schema
  accept/reject paths incl. oversized payloads, store persistence + non-destructive imports +
  reset, gauge rendering + meter semantics + explanation dialog).
- E2E: 76 passed across desktop, iPhone 390×844, iPhone 430×932 (pre-hydration no-JS rendering,
  overflow on all routes, navigation, gauge dialog incl. keyboard, import happy/invalid/oversized/
  blocked-storage/reset/refresh-persistence, touch targets, focus visibility, reduced motion,
  text-not-color rating cues, manifest resolution).
- **Bug found by E2E and fixed:** on 390 px the Portfolio drill-down rows' intrinsic min-content
  widened Chromium's mobile layout viewport to 407 px (shrink-to-fit zoom), shifting the bottom
  nav's tap targets outside the visual viewport. Fix: `min-w-0` on the grid items +
  `overflow-hidden` on `details`. Also hardened the E2E overflow assertion to compare
  `window.innerWidth` against the device viewport so layout-viewport zoom can't mask overflow.
- Final gate run: `lint` ✓ · `typecheck` ✓ · `test` 23/23 ✓ · `test:e2e` 76/76 ✓ · `build` ✓.

## 2026-07-24 — Production deployment (user-approved)
- Deployed to Vercel on user instruction ("Use vercel"): project `neoos-cio`, production target.
- Live URL: https://neoos-cio.vercel.app (deployment dpl_A2yC6p4sHZP4YN6MNmijE7Wt1dLD, framework
  auto-detected as Next.js, all routes statically prerendered).
- PWA icons are generated at build time via the new `prebuild` hook (`scripts/gen-icons.mjs`),
  so the deploy payload is source-only. Verified live: home page serves the full prerendered
  cockpit, `/manifest.webmanifest` resolves, icons serve byte-identical to local output.

## 2026-07-24 — Sprint 2: report schema v1.1 (data-driven workspaces)
- Extended the report contract to v1.1: optional sections `regime`, `commentary`, `markets`
  (regions + macro), `portfolio` (holding details), `gold` (factors + fair value + role),
  `cash` (position + recommendation), `timeline` (events), `tiers`, `deploymentPlan`.
  Machine-readable contract: `schemas/neoos-report-v1.1.schema.json` (v1.0 kept alongside).
- `parseReport` accepts v1.0 and v1.1; v1.0 files are validated against the original schema and
  migrated up (sections absent). Unsupported versions produce a clear error naming both versions.
- Demo workspace content moved into the canonical demo report (`demoSections`); the old
  `data/workspace-content.ts` module is gone. New `domain/report-view.ts` selectors resolve each
  section from the report with per-section demo fallback and provenance.
- Every workspace now renders from the report. When a non-demo report omits a section, the card
  shows an amber "Demo content" badge — imported data and demo filler are never conflated.
- Import preview now shows the declared schema version (and migration note) plus the list of
  workspace sections the file provides.
- Tests: 32 unit (migration, partial sections, malformed-section paths, selector provenance,
  fallback badging) · 85 E2E (adds: v1.1 file drives markets/cash/timeline/tiers with no badges,
  preview names provided sections, v1.0 file migrates with demo-labeled workspace fallback).
- Gates: `lint` ✓ · `typecheck` ✓ · `test` 32/32 ✓ · `test:e2e` 85/85 ✓ · `build` ✓.

## 2026-07-25 — Sprint 1 hardening + Sprint 2: Evidence and Decision Engine

### Part A — Sprint 1 hardening
- Six explicit data states (`demo`, `imported`, `live_verified`, `stale`,
  `insufficient_evidence`, `error`) derived in `domain/app-state.ts` and shown in the header.
  No silent fallback between them: a corrupt persisted report preserves its raw bytes under a
  recovery key and surfaces an explicit error state.
- Report metadata dialog: exact timestamp, last evidence update, engine version, schema version,
  and freshness, with relative age on the badge itself.
- Per-route browser titles for all six workspaces; cash-score meaning explained in plain language.
- Asset identity separates instruments (ticker, exchange, currency) from generic categories;
  a category carrying a ticker is a validation error, as are duplicate asset ids.
- Import hardening battery: negative, overflow, and non-finite scores, invalid dates, null
  scores, duplicates, missing fields, oversized input, unsupported versions.

### Part B — Evidence and Decision Engine
- `src/engine/`: constants (every threshold with rationale), canonical Zod models, evidence
  freshness and conflict handling, five modular valuation methods, factor scoring with three
  penalty classes, the Strong Buy gate, the insufficient-evidence gate, the capital deployment
  engine with hard constraint caps, and a deterministic report pipeline.
- The demo report is now generated by the engine from 50 evidence records; no score is typed
  by hand. Regenerating from identical inputs is byte-identical.
- Insufficient Evidence is visible throughout the UI rather than hidden: unrated assets keep
  their place with a null score and a dedicated pill.
- Full explainability: per-asset factor waterfall, gate checks with actual vs required, vetoes,
  valuation trace, evidence cited, invalidation conditions; posture drivers, active constraints,
  and what would move deployment in either direction.
- Price thresholds are provenance-gated — withheld without a complete valuation trace.
- Schema v2.0 engine reports import and export with the trace intact.

### Defects found by the new tests
- `buyThresholds` used 25/140 rather than 35/140, quoting Buy Below at valuation grade 75
  instead of the documented 85.
- `deploymentBand` returned Preserve Cash for fractional scores falling between integer-labelled
  bands — latent until engine scores became continuous.
- A gold custody record typed as market data expired within a week, silently zeroing governance.

### Gates
`lint` ✓ · `typecheck` ✓ · `test` 156/156 ✓ · `test:e2e` 151/151 ✓ · `build` ✓

## 2026-07-25 — Sprint 3: Morpheus intelligence layer

- New `src/intelligence/` layer: provider adapters, raw evidence ingestion, identity resolution,
  normalization, staged validation, conflict extension, the UniverseInputs generator, the daily
  cycle orchestrator, report comparison, the Morpheus briefing, and the append-only journal.
- NeoOS now produces a daily report from structured evidence without a human assembling the
  report JSON. The operator supplies source records; the pipeline does everything downstream.
- Six-asset proof universe (Apple, SPY, gold, cash/bills, a UAE listing, a value-ETF category)
  with a complete two-day fixture run exercising a stale record, a duplicate, an unresolvable
  identity, a category label, a tier-resolved conflict, an unresolved peer conflict, an
  evidence-poor asset, and a material day-over-day change.
- Provider modes are enforced, not just documented: a record claiming a mode its provider is not
  in is a blocking validation failure. Only genuinely retrieved data may be labelled live.
- Reports carry a provenance label stamped by the orchestrator; the header states it.
- UI additions only where the loop needs operating: Intelligence panel, daily briefing on
  Capital, decision capture, and journal plus run history on Timeline.

### Defects found by the new tests
- Records built outside ingestion computed their checksum over all fields while ingestion's
  canonical checksum covers only the identity-defining subset, so verifying a fixture or manual
  record raised a false integrity alarm.
- `text-faint` measured 3.58:1 against the panel background, below WCAG AA 4.5:1, on the
  provenance and metadata labels added in Sprint 2.
- Recharts marks its own SVG tabbable inside an `aria-hidden` wrapper, leaving an element
  reachable by keyboard but never announced.
- The journal persisted but was never rehydrated on mount, so the Timeline looked empty after
  any page load; run history was session-only.

### Gates
`lint` ✓ · `typecheck` ✓ · `test` 242/242 ✓ · `test:e2e` 232/232 ✓ (incl. 9 axe-core scans) ·
`build` ✓


## Sprint 4 — Live evidence foundation (2026-07-25)

Added `src/server/`: the credentialed layer. The engine and intelligence pipeline
are unchanged; every score still comes from the engine.

- SEC EDGAR provider at evidence tier 1 — free, public, no key, citable to the
  filing. Fair-access terms enforced in the client rather than left to callers.
- Fundamental analysis from filed accounts, with multiples anchored to a required
  earnings yield rather than to comparables.
- Vendor-neutral price adapter that ships unconfigured and substitutes nothing.
- Gold price basis made explicit; gold's ceiling documented as permanently
  `partial_live`.
- UAE assets capped at manual evidence by source policy, enforced in code.
- Append-only Postgres storage behind a port, with a memory fallback that reports
  itself non-durable.
- Ed25519 signing, verified on read rather than trusted from write time.
- Scheduled and operator API routes with constant-time authorisation.
- Outcome review separating result from reasoning quality.
- Nine static security invariants pinning the credential boundary.

Gates: lint, typecheck, 421 unit tests, 232 Playwright tests, production build.

Not complete: `live_verified` unreached (needs a licensed price feed), no live
EDGAR fetch verified (sandbox has no outbound network), deployment unverified.
See `docs/SPRINT4_COMPLETION_REPORT.md` §7.
