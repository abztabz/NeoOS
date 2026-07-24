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
