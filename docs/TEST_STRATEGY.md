# Test strategy

## Layers

| Layer | Tool | Count | What it proves |
|---|---|---|---|
| Unit — engine | Vitest | 108 | The scoring model behaves as documented |
| Unit — app | Vitest | 48 | Schema validation, state derivation, store behaviour, components |
| Unit + integration — intelligence | Vitest | 86 | The pipeline ingests, resolves, normalizes, validates, and orchestrates correctly |
| Unit + contract — server | Vitest | 179 | Providers, valuation from filings, live states, signing, storage, authorisation, and the static security invariants |
| End-to-end | Playwright | 232 | The rendered app matches the engine, on desktop and both iPhone viewports, including 9 axe-core scans |

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
`npm run build`. All five must pass. Accessibility scanning runs inside the
Playwright suite (`e2e/axe.spec.ts`), so it is part of the same gate.

## What the engine tests cover

- **Weighting** — weights sum to 1; each contribution equals adjusted × weight;
  the total equals the sum over contributing weight; intermediates are unrounded.
- **Penalties** — coverage, freshness, and conflict penalties in isolation, each
  against its documented formula, including the conflict cap.
- **Confidence propagation** — weaker evidence lowers recommendation confidence.
- **Rating boundaries** — every band edge, in both directions.
- **The Strong Buy gate** — a qualifying asset reaches Strong Buy; a qualifying
  *score* is still downgraded when the valuation rests on a sentiment-tier
  source or a critical input has gone stale; every failed condition is recorded,
  not just the first. The margin-of-safety check is tested directly because
  reaching 95 with no discount is arithmetically impossible.
- **The insufficient-evidence gate** — fires on missing critical factors and on
  low confidence; never emits a score alongside it.
- **Vetoes** — governance below the floor caps at Reduce; an unresolved
  high-severity conflict caps at Hold.
- **Deployment constraints** — every cap, individually and in combination, with
  the tightest winning; Maximum Deployment unreachable without pristine reserves
  and evidence.
- **Evidence** — per-type freshness horizons, expiry excluded rather than
  decayed, tier-ranked conflict detection preserving both records, severity
  assignment, integrity scoring.
- **Valuation** — all five methods produce ordered cases and complete traces;
  margin-of-safety mapping; derived thresholds land exactly on the documented
  grades.
- **Generation** — determinism, schema conformance, JSON round trip, every
  displayed score traceable to the engine, journal immutability and integrity
  hashing, change-log behaviour.

## What the end-to-end tests cover

Pre-hydration rendering, navigation across all six workspaces, the gauge and its
explanation, import (valid, invalid, oversized, schema-invalid, v1.0 migration,
v1.1 sections), persistence across refresh, blocked storage, demo reset,
accessibility (touch targets, focus, reduced motion, rating meaning carried by
text), the data-state badge and metadata dialog, stale reports, insufficient
evidence in the ranking and action board and trace, the factor waterfall and
gate, posture drivers, provenance-gated thresholds, no horizontal overflow at
320/390/430px, and a clean console on every route.

## Principles

**Expectations derive from the engine, not from constants.** `e2e/expected.ts`
imports the generated demo report. Tuning the model updates the expectations
automatically, so a spec failure means the UI diverged from the engine — which
is the thing worth catching. Pinning `35%` in a spec would only prove that
someone once typed 35.

**Tests are written to fail for the right reason.** Several tests in this suite
found real defects: `buyThresholds` used the wrong numerator, quoting Buy Below
at valuation grade 75 instead of 85; `deploymentBand` returned Preserve Cash for
fractional scores that fell between integer-labeled bands.

**Boundaries are tested on both sides.** Band edges, freshness horizons, and
constraint thresholds are each tested at the value and just past it.

## What the intelligence tests cover

Identity resolution across every fixture case (ticker with and without exchange,
name, alias, ISIN, commodity, category labels, mismatched exchange, conflicting
identifiers, unknown identifiers); unit, scale, date, and currency handling
including the refusal to convert without a verified rate; ingestion immutability,
checksum verification, duplicate detection, and corrections that supersede;
staged validation including the provider-mode honesty check; the complete
fixture cycle with all its awkward cases; day-over-day comparison and causal
attribution; briefing structure and epistemic typing; provider honesty; manual
import; and the journal append flow with corrections and integrity checks.

## Accessibility scanning

`e2e/axe.spec.ts` runs axe-core against every workspace and every dialog, tagged
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Serious and critical violations fail
the build; moderate and minor findings are printed alongside a failure so a fix
has the full picture.

It found two real defects on its first run: a token measuring 3.58:1 against the
panel background, and a focusable chart element inside an `aria-hidden` wrapper.

## What the server tests cover

**Providers.** The EDGAR client's fair-access enforcement (required User-Agent,
request spacing, bounded retries that skip 404s and shape changes); tag selection
across candidate tags; restatements resolving to the latest filing; quarterly
comparatives excluded by elapsed days; a ragged submissions response refused
outright; every value carrying its citation. The price adapter's refusal to
substitute anything when unconfigured, and its rejection of quotes lacking a
currency, a provider-stated time, or plausibility.

**Fundamental analysis.** Every derived measure against its formula; bounded
growth and balance-sheet adjustments at and beyond their caps; the refusal to
value absent or negative earnings; determinism; confidence rising with coverage
rather than with company quality.

**Live states.** The two-input test; each state's precedence; policy ceilings
clamping an assessment down but never up; the roll-up refusing to round a report
up to its most flattering description.

**Signing.** A verified round trip; an edited number inside the nested engine
report detected as `content_modified`; a forged signature distinguished from
modified content; an unknown key reported without implying the report is bad;
key-order independence in canonicalisation.

**Storage.** The append-only contract: no overwrite, no duplicate, superseded
entries retained, and the review queue excluding both reviewed and too-recent
decisions.

**Authorisation.** Constant-time comparison; unconfigured secrets denying rather
than opening; a cron secret refused on operator endpoints; errors that never echo
the expected value.

**Static security invariants** (`src/server/security.test.ts`). No client
component imports a credentialed server module; only `env.ts` reads credentials;
no credential carries a `NEXT_PUBLIC_` prefix; the browser guard runs at module
scope; no API route references a secret-reading function; every write route
authorises. These would otherwise depend on nobody making a specific mistake.

## Environment split

Server tests that touch `@/server/config/env` declare `// @vitest-environment
node`. This is not a workaround — `env.ts` throws when a `window` exists, and the
guard firing under jsdom is the control working as designed.

## Live-provider testing

No test in the normal suite makes a network call. Provider tests run against
recorded fixtures with an injected `fetchImpl`, so the real parsing, retry, and
error handling are exercised without depending on a public agency's uptime.

The EDGAR fixtures are **hand-authored to the documented response shape, not
captured** — see `src/server/providers/sec-edgar/fixtures/README.md`, which says
so plainly and uses a synthetic issuer so no invented figure is attached to a real
company.

## Gaps

- No visual regression testing.
- **`live_verified` has never been reached in a test or a real run.** It requires
  a licensed price feed alongside EDGAR, and no such feed is configured. The state
  is modelled, gated, and unit-tested at the function level; it has not been
  observed end to end.
- **The Postgres store is only partly exercised.** The contract suite runs
  against the memory implementation. In production the connection is verified
  (`SELECT 1` via `/api/health`, 2026-07-25); the DDL in `schema.sql` runs on the
  first cycle or journal read and has not yet been observed.
- **No live EDGAR fetch has been verified.** See the Sprint 4 completion report.
- Accessibility scanning covers automatable rules only; it does not replace
  testing with an actual screen reader.
