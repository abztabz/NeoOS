# NeoOS CIO — Morpheus Autonomous Build Directive

You are the implementation team for NeoOS CIO. Morpheus is product lead and final quality gate.

## Mission
Build a production-grade, installable, mobile-first capital allocation operating system that feels like **Bloomberg Terminal × Apple Health × Jarvis**.

NeoOS is not a stock picker. The first question is always:

> Should capital be deployed today, and how aggressively?

The home screen must answer within five seconds:
1. How hard should I press the accelerator today?
2. Why?
3. What materially changed?

## Primary interface — Morpheus leads

**Morpheus is the primary interface. The workspaces support it. Evidence remains
inspectable.** This is controlling, not incidental.

NeoOS must feel like an ongoing conversation with a seasoned, trusted adviser —
not a dashboard, a scoring engine, or a compliance form with a chat box bolted
on. The user experiences judgment first, explanation second, evidence on demand,
and detail behind progressive disclosure. The rigour underneath does not soften:
evidence, provenance, confidence, jurisdiction, audit and decision controls are
unchanged.

Product hierarchy, in order:

1. Morpheus home
2. Daily two-answer briefing
3. Conversational question and response
4. Contextual follow-up
5. Supporting evidence and workspace links
6. Full analytical workspaces

`/` is Morpheus. The Capital dashboard lives at `/capital`. The six workspaces
remain in mobile and desktop navigation and must not be removed — they are
supporting routes, not the spine.

**The home screen must not open with** score grids, large tables, status codes,
database or provenance vocabulary, a wall of metrics, or every unresolved gap at
once. Those remain available through disclosure.

**Morpheus speaks** in plain language, leads with the conclusion, connects market
evidence to the user's actual position, asks one high-value question at a time,
remembers the thread, and acknowledges uncertainty without sounding mechanical.
He is calm, direct, protective without alarmism, willing to disagree and willing
to say "not yet". He is never robotic, bureaucratic, verbose by default,
theatrical, flattering, or falsely certain.

Say `"I can see the broad shape of your position, but I'm missing your household
obligations. Without that, I can't tell you how much is genuinely safe to
invest."` Never `"Personalisation unavailable. Blocking fields: dependants."`

**No fake AI.** Answers are deterministic functions of the declared position and
the current report. No random canned responses. Where a generation path is not
connected, build the interface and the response contract honestly and mark
preview content visibly.

See `docs/CONVERSATIONAL_ARCHITECTURE.md`.

## Authority
Work autonomously. Do not stop for routine approval. Make sensible implementation decisions, document them, and continue.

Stop only for:
- paid services or credentials,
- irreversible destructive actions,
- production release to a public audience,
- legal or compliance ambiguity,
- missing information that materially changes the architecture.

## Non-negotiable product rules
- The Capital Deployment Gauge is the dominant hero component.
- Capital posture precedes asset recommendations.
- Strong Buy must be rare and evidence-heavy.
- Cash is a first-class asset.
- Every score must be explainable.
- Demo data must always be visibly labeled.
- No generic fintech dashboard aesthetic.
- iPhone is the primary acceptance viewport.
- Never ship a blank shell, broken preview, or JavaScript-only empty state.
- Use server/static rendering for the initial cockpit so useful content is visible before hydration.

## Approved visual baseline
Use `reference/approved-visual-baseline-v2.html` as the baseline for hierarchy, proportions, and visual direction.
Use `reference/approved-mobile-direction.png` for mobile acceptance.
The static reference is content inspiration, not an implementation target.

## Required stack
- Next.js current stable with App Router
- TypeScript strict mode
- Tailwind CSS
- Framer Motion for restrained motion
- Recharts or ECharts for charts
- Zod for report validation
- Vitest and React Testing Library
- Playwright for end-to-end and mobile viewport tests
- PWA manifest and installability

## Required routes
Morpheus (`/`) is the primary surface. The six workspaces are supporting routes
and must all remain:
- Capital (`/capital`)
- Markets
- Portfolio
- Gold
- Cash
- Timeline

## Required capabilities
- Morpheus-first home with a conversational daily briefing
- Persistent conversational input on every surface
- Contextual suggested questions, computed from the position
- One-question-at-a-time gap resolution
- Progressive evidence disclosure
- Conversation continuity across navigation into workspaces
- Conversational guided intake alongside the structured form, same schema
- Explainable deployment gauge
- Capital Radar showing only meaningful changes
- Daily NeoOS JSON import
- Persistent local report storage with safe fallback
- Demo reset
- Portfolio drill-down
- Opportunity watchlist with Buy Below and Strong Buy Below
- Evidence freshness and confidence
- Responsive mobile bottom navigation and desktop navigation
- Graceful empty, loading, and invalid-report states
- Accessibility and reduced-motion support

## Delivery behavior
1. Inspect all handoff files.
2. Create an implementation plan in `docs/IMPLEMENTATION_PLAN.md`.
3. Scaffold the application.
4. Implement vertical slices, beginning with the Capital Cockpit.
5. Run lint, typecheck, unit tests, Playwright, and production build after each milestone.
6. Fix failures before proceeding.
7. Keep `docs/BUILD_LOG.md` updated.
8. Never claim completion unless the build and tests pass.

## Definition of done for Sprint 1
- Hosted-quality local app starts with one command.
- Morpheus opens the app and answers within five seconds.
- Capital, Markets, Portfolio, Gold, Cash, Timeline tabs work.
- Capital Cockpit is polished and useful on 390×844 and 430×932 viewports.
- Gauge explanation opens and closes.
- JSON import validates and updates the UI.
- Invalid JSON produces a clear non-destructive error.
- Refresh preserves imported report when browser storage is available.
- App still renders demo content when browser storage is blocked.
- PWA metadata exists.
- No horizontal overflow at mobile widths.
- Lighthouse-style accessibility basics are met.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, and `npm run build` all pass.
