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

## Database testing

`src/server/persistence/store.test.ts` runs the storage contract against the
memory implementation, so it proves the interface without needing a server.

`src/server/persistence/postgres-store.test.ts` runs 24 tests against a real
PostgreSQL instance and is **skipped unless `TEST_DATABASE_URL` is set**. It is
the only thing that exercises the SQL: JSONB round-tripping without structural
loss, report and profile immutability, lineage foreign keys rejecting an orphan
parent, the partial unique index that stops two corrections claiming the same
version, timestamps returned as ISO strings rather than `Date` objects, the
review queue, a corrupt row throwing rather than reaching the render path, an
intake profile whose content no longer matches its hash, and the append-only
triggers.

```bash
TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/db npx vitest run postgres-store
```

**Run it as a non-superuser as well as a superuser.** Both are cheap and they do
not agree. Two findings came from exactly that:

1. A superuser bypasses privilege checks entirely, so the original `REVOKE
   UPDATE, DELETE` enforced nothing for a superuser connection.
2. Worse, the revoke *broke* foreign keys for a non-superuser: PostgreSQL takes a
   `SELECT ... FOR KEY SHARE` lock to check a foreign key, and that lock requires
   UPDATE or DELETE privilege. Every insert carrying a foreign key failed for the
   dedicated role production is told to use, and a superuser connection masked it
   for a whole sprint.

Both are fixed by enforcing append-only with a statement-level trigger instead.
The suite now passes under both roles, and carries a regression test that takes
the row lock directly.

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
- The production instance has not yet had `migrate()` run against it. The
  connection there is verified; the schema is created on the first cycle run.
- **No live EDGAR fetch has been verified.** See the Sprint 4 completion report.
- Accessibility scanning covers automatable rules only; it does not replace
  testing with an actual screen reader.

## Intake and the calculated profile

`src/domain/profile/profile.test.ts` — 38 tests over the provenance system, the
ten required calculated outputs, and the personalisation gate.

The provenance tests are the load-bearing ones. They pin the weakest-link rule:
arithmetic on a model assumption yields a model assumption, not a calculation,
and a missing input makes the whole result missing rather than being computed
around as a zero. Without that rule, provenance decays quietly — one assumption
enters a chain of arithmetic and the answer is presented as a calculation, which
is true and misleading at the same time.

The gate tests assert the three conditions for `available` independently: no
blocking gap in intake, every core output computable, and no core output resting
on a NeoOS assumption. A single undated debt is enough to drop the whole surface
to `provisional`, and there is a test for exactly that.

`e2e/intake.spec.ts` covers the surface without a configured token: the gate must
hold, the reason must be legible, and nothing about the position may render.

**Match the alert assertion to a test id, not `role="alert"`.** Next renders its
own empty `role="alert"` route announcer, so matching on the role alone is a
strict-mode collision that appears and disappears with hydration timing — it
passed in isolation and failed in the full parallel run.

### Verify the API against a real database, not only the unit suite

The intake route shipped without `store.migrate()`. Every unit test passed, the
build passed, and the first real request against a fresh Postgres returned
`42P01 undefined_table`. Nothing short of running the actual server against an
actual database would have caught it.

The verification that now matters before claiming an API works: stand up a
throwaway Postgres, run `next start` with `DATABASE_URL` and
`OPERATOR_API_TOKEN`, then exercise unauthenticated, wrong-token and
authenticated requests, a save, and a correction — checking the supersedes chain
and the drift trends that follow from it.

---

## Conversational-first coverage (added 2026-07-28)

**Unit — `src/domain/morpheus/morpheus.test.ts` (31 tests).** Intent
classification including the honest `unrecognised` outcome; refusal phrasing;
determinism (same question, same words); the forbidden-vocabulary assertion that
keeps "personalisation unavailable" and "blocking fields" out of every visible
sentence; follow-up continuity; briefing shape; one-question-at-a-time gap
ordering; voice helpers.

The vocabulary assertion looks fussy and is the point. "Personalisation
unavailable. Blocking fields: dependants" is a correct sentence and a product
failure, and the only way to keep it out is to assert it stays out.

**E2E — `e2e/morpheus.spec.ts`,** run on desktop and both iPhone viewports:
Morpheus opens the app rather than a dashboard; the conclusion is above the fold
and free of internal vocabulary; all six workspaces remain reachable; the Capital
dashboard survives at `/capital`; typed and suggested questions produce answers;
unrecognised questions are refused honestly; evidence is hidden until requested
then shows provenance; the thread survives navigation *and* a hard reload; each
workspace carries its own strip without replaying another workspace's
conversation; the gap prompt shows exactly one question; guided intake asks one
question at a time; no horizontal overflow at 320/390/430; the composer has an
accessible name and a 44px target.

**Repointed specs.** `gauge`, `import`, `import-v11`, `intelligence`, `engine`,
`rendering`, `a11y` and one `axe` case now target `/capital`, because that is
where the cockpit they test now lives. The mobile-nav count assertion moved from
7 to 8 and gained a width floor — eight tabs on a 390px phone is genuinely tight,
so it is asserted rather than assumed.

---

## Demo isolation and pricing coverage (added 2026-07-28)

**Unit — `src/domain/portfolio/portfolio.test.ts` (10 tests).** Which portfolio
is active; that a declared position makes itself active with no prompt; that the
demo becomes unreachable once one exists *even when `exploringDemo` is set*; the
isolation rule in both directions; that `reportForSurface` withholds the fixture
report from a user surface. The last is the load-bearing one — returning the
fixture there is the original bug.

One test asserts that the fixture universe *does* contain Apple. It reads oddly
until you need it: if a future change puts fixture instruments on a user
surface, that test is the written record of why that is wrong.

**Unit — `src/server/pricing/pricing.test.ts` (33 tests).** Quote validation
(zero, negative, unsourced, undated, future-dated); the single decision gate;
freshness recomputed from the clock rather than trusted; cache entries keeping
their original `quoteTimestamp`; identity resolution refusing a bare ticker;
production refusing to construct a service configured for fake pricing; provider
fallback recording each source switch with the actual failure reason.

**Unit — `src/domain/watchlist/opportunity.test.ts` (27 tests) and
`from-report.test.ts` (20 tests).** Current Price, Fair Value and Good Buy Price
staying three distinct fields; the buy-distance arithmetic; a missing price
suspending the decision *even at a 95% discount to fair value*; a stale valuation
suspending the ranking while still showing the verified price; Strong Buy
omitted rather than zeroed when a gate fails; the interpretation line carrying no
status codes; report prices shown only where a verified `marketData` evidence
record can attribute them.

**Unit — `src/domain/gold/uae-gold.test.ts` (16) and
`src/server/gold/uae-gold-service.test.ts` (11).** Conversion through the exact
troy-ounce constant; 22K derived by exact purity and asserted strictly below the
24K valuation; the peg labelled as documented rather than observed; refusal
without a verified spot or FX; and — with no provider — that the board contains
no number at all and states the production wording verbatim.

**Unit — `src/domain/valuation/holding-valuation.test.ts` (12) and
`readiness.test.ts` (9).** Property as a manual estimate with no path to market
price; a quantity not counting as identification; the unitemized-holdings wording
including its remedy; the readiness list ordered by declared value with unvalued
holdings last rather than guessed.

**E2E — `e2e/demo-isolation.spec.ts`.** That the first screen offers a choice
instead of a fixture; that **no fixture instrument name appears anywhere on it**;
that opening the worked example survives a reload; that every workspace carries
the data-state badge while the demo is showing; that every opportunity card
either names a price source or says the price is unavailable; and that the gold
board shows a sourced price or no price.

The instrument-name assertion is the tripwire. It fails on any change that puts
the fixture universe back in front of somebody before they have asked for it.

**The worked-example fixture.** `e2e/helpers.ts` exports a `test` that opens the
demo through an init script, and every spec written against the fixture universe
now imports from there instead of `@playwright/test`. `demo-isolation.spec.ts`
deliberately does not — its subject is what happens *before* that choice. Having
to opt in is the point: the old behaviour was that every test, and every user,
got somebody else's portfolio by default.
