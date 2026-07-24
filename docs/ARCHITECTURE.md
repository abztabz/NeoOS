# Technical Architecture

## Rendering strategy
Use server-rendered or statically rendered initial content so the Capital Cockpit is visible before client hydration. Interactive components may hydrate progressively.

## Application layers
1. Presentation: workspace screens and reusable components
2. Domain: scoring, rating, deployment posture, change detection
3. Data: demo report, imported report, local persistence adapter
4. Validation: Zod schema and version migration
5. Observability: non-sensitive client diagnostics and error boundary

## Suggested modules
- `app/`
- `components/neoos/`
- `domain/scoring/`
- `domain/radar/`
- `data/demo-report.ts`
- `data/report-store.ts`
- `schemas/neoos-report.ts`
- `lib/format.ts`
- `tests/`

## Persistence
Browser storage is optional, never required for first render. Wrap persistence in defensive adapters. If unavailable, continue in-memory and show a small status note rather than failing.

## Import flow
1. User selects JSON
2. Parse safely
3. Validate schema
4. Migrate if supported version differs
5. Preview summary
6. Apply atomically
7. Persist when possible
8. Retain previous report on failure

## Security
- No secrets in client bundle
- Treat imported JSON as untrusted
- No arbitrary HTML rendering
- Enforce file size limit
- Do not execute imported content
