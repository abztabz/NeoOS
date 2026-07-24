# NeoOS
NeoOS — an AI-native organizational operating system for founder-led companies.

## NeoOS CIO app (Sprint 1)

A mobile-first capital-allocation cockpit (Next.js App Router + TypeScript strict). The home
screen answers: *should capital be deployed today, and how aggressively?*

```bash
npm install        # once
npm run dev        # start the app → http://localhost:3000
```

Quality gates:

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright (desktop + iPhone 390×844 + 430×932)
npm run build      # production build
```

Docs: `docs/IMPLEMENTATION_PLAN.md` (plan), `docs/BUILD_LOG.md` (history),
`docs/PRODUCT_SPEC.md` + `CLAUDE.md` (requirements), `tests/ACCEPTANCE_TESTS.md` (definition
of done). Daily report contract: `schemas/neoos-report.schema.json` (import via the **Data**
button in the app header).
