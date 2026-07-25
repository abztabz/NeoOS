# Test strategy

## Layers

| Layer | Tool | Count | What it proves |
|---|---|---|---|
| Unit — engine | Vitest | 108 | The scoring model behaves as documented |
| Unit — app | Vitest | 48 | Schema validation, state derivation, store behaviour, components |
| Unit + integration — intelligence | Vitest | 86 | The pipeline ingests, resolves, normalizes, validates, and orchestrates correctly |
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

## Gaps

- No visual regression testing.
- The `live_verified` state has no test because no live feed exists — the state
  is modelled and unreachable by design.
- Accessibility scanning covers automatable rules only; it does not replace
  testing with an actual screen reader.
