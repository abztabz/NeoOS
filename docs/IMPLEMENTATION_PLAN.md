# NeoOS CIO — Sprint 1 Implementation Plan

Controlling directive: `CLAUDE.md` (repo root). Product requirements: `docs/PRODUCT_SPEC.md`.
Engineering constraints: `docs/ARCHITECTURE.md`. Definition of done: `tests/ACCEPTANCE_TESTS.md`.
Visual truth: `reference/approved-visual-baseline-v2.html` + `reference/approved-mobile-direction.png`.
Data contract: `schemas/neoos-report.schema.json` (v1.0).

## 0. Controlling interface decision (added 2026-07-28)

**Morpheus leads. Workspaces support. Evidence remains inspectable.**

`/` is the Morpheus conversational home. The Capital dashboard moved intact to
`/capital`. All six workspaces remain in mobile and desktop navigation as
supporting routes. Intake has two doors — conversational guided flow and the
structured form — writing to the same schema with the same provenance rules.

New modules: `src/domain/morpheus/` (answer contract, voice, intents, answers,
briefing, gaps), `src/domain/intake/guided.ts`,
`src/data/conversation-store.tsx`, `src/components/morpheus/`,
`src/components/intake/GuidedIntake.tsx`.

See [CONVERSATIONAL_ARCHITECTURE.md](CONVERSATIONAL_ARCHITECTURE.md).

---

## 1. Goal

A production-grade, installable, mobile-first capital-allocation cockpit. The home screen answers
"How hard should I press the accelerator today?" within five seconds, before hydration, on a
390×844 viewport.

## 2. Stack (fixed by directive)

| Concern | Choice |
|---|---|
| Framework | Next.js (current stable) App Router, static prerender of all workspaces |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4, design tokens from the approved baseline (`--bg #050607`, cyan `#54d6ff`, green `#64f0a5`, amber `#f2b56b`, red `#ff7b7b`) |
| Motion | Framer Motion, restrained; `prefers-reduced-motion` honored |
| Charts | Recharts (timeline cash-score trend); gauge is hand-built CSS/SVG per baseline |
| Validation | Zod schema mirroring `schemas/neoos-report.schema.json` |
| Unit tests | Vitest + React Testing Library |
| E2E | Playwright — projects: desktop Chromium, iPhone 390×844, iPhone 430×932 |
| PWA | `manifest.webmanifest`, icons, theme color, installability metadata |

## 3. Architecture

```
app/                    # App Router: layout + 6 workspace routes
  (workspaces)/
    page.tsx            # Capital (home)
    markets/ portfolio/ gold/ cash/ timeline/
components/neoos/       # Gauge, ScoreCard, RadarList, RatingPill, Nav, ImportPanel, ...
domain/
  scoring.ts            # deployment bands, rating bands, cash-score decisions, posture
  radar.ts              # severity presentation mapping
data/
  demo-report.ts        # canonical demo report (always labeled DEMO)
  report-store.tsx      # React provider + defensive localStorage adapter
schemas/
  neoos-report.ts       # Zod mirror of the v1.0 JSON schema
lib/format.ts
e2e/                    # Playwright specs (repo tests/ holds governance + acceptance docs)
```

### Rendering strategy
All six workspaces are statically prerendered with the demo report so useful content exists
before hydration (acceptance: no blank shell, gauge visible pre-JS). A client provider then
hydrates any persisted imported report from localStorage. Storage is wrapped in a defensive
adapter: unavailable/blocked storage degrades to in-memory + a small status note, never a crash.

### Report lifecycle
demo (build-time) → optional import (file → parse → Zod validate → size limit 1 MB → preview →
atomic apply) → persist when possible → demo reset returns to baseline. Invalid input never
destroys current state. Imported JSON is data only — never rendered as HTML, never executed.

## 4. Domain rules encoded

- Deployment bands: 0–20 Preserve Cash · 21–40 Deploy Gradually · 41–60 Selective Deployment ·
  61–80 Increase Deployment · 81–95 Aggressive Deployment · 96–100 Maximum Deployment.
- Ratings: 95+ Strong Buy (rare, evidence-heavy) · 85+ Buy · 70+ Accumulate · 55+ Hold ·
  40+ Reduce · <40 Sell/Avoid. Ratings carry text + shape cues, not color alone.
- Cash score decisions: 90+ Hold Cash · 70+ Deploy Gradually · 50+ Increase Deployment ·
  30+ Deploy Aggressively · <30 Maximum Deployment.
- Posture precedes assets; the gauge is the hero; cash is a first-class asset.
- Every score explainable: gauge opens a "Why this score" dialog fed by `deployment.reasons`.

## 5. Milestones

1. **M1 — Foundation**: scaffold, tokens, layout, nav (bottom mobile / top desktop), PWA metadata.
2. **M2 — Capital Cockpit**: gauge + explanation dialog, recommendation/posture, six score cards,
   Capital Radar, action board, watchlist, deployment plan, Morpheus commentary.
3. **M3 — Workspaces**: Markets (regime, heat map, region cards, ranking), Portfolio (drill-down),
   Gold, Cash, Timeline (with cash-score trend chart).
4. **M4 — Import & persistence**: import panel, validation errors, preview, apply, reset, storage
   status note.
5. **M5 — Hardening**: accessibility pass (44px targets, focus visible, reduced motion,
   non-color rating cues), empty/invalid states, no horizontal overflow.
6. **M6 — Gates**: `lint`, `typecheck`, `test`, `test:e2e` (desktop + both iPhone viewports),
   `build` all green. BUILD_LOG updated per milestone.

## 6. Sprint 2 (delivered): report schema v1.1

All workspace content became report-driven: v1.1 adds optional sections (regime, commentary,
markets, portfolio, gold, cash, timeline, tiers, deploymentPlan) with v1.0 migration and
per-section demo fallback labeled in the UI. One JSON drop now updates every workspace.

## 7. Out of scope so far

Live market data, user action notes on the Timeline, real report generation, auth, deployment to
a public audience (requires explicit approval per CLAUDE.md).

## 8. Risks & mitigations

- **Storage-blocked browsers** → defensive adapter + in-memory fallback (acceptance-tested).
- **Sandbox has no outside network at runtime** → no external fonts/CDNs; system font stack per
  approved baseline.
- **Playwright browser availability** → pre-installed Chromium at `/opt/pw-browsers`; mobile
  projects emulate iPhone viewports in Chromium.
