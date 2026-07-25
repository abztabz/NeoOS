# Engine architecture (as built, Sprint 2)

`docs/ARCHITECTURE.md` is the original handoff specification. This document
describes what was actually built.

## Layers

```
src/engine/          Deterministic domain engine. No React, no I/O, no framework imports.
  constants.ts       Every threshold, with rationale. The only place numbers are declared.
  models.ts          Canonical Zod models + the v2.0 engine report envelope.
  evidence.ts        Freshness, confidence decay, conflict detection, integrity.
  valuation.ts       Five modular valuation methods, each with a full trace.
  scoring.ts         Factor scoring, penalties, vetoes, Strong Buy and insufficient gates.
  deployment.ts      Capital posture and the hard constraint caps.
  generate.ts        The report pipeline: engine truth → derived presentation view.
  hash.ts            Stable stringify + FNV-1a, for journal integrity markers.

src/domain/          Presentation-adjacent rules, still pure.
  scoring.ts         Band definitions shared by engine and UI.
  app-state.ts       The six data states and report freshness.
  provenance.ts      The gate on displaying price conclusions.
  report-view.ts     Per-section selectors with labeled demo fallback.

src/schemas/         The v1.0/v1.1 presentation contract and the import parser.
src/data/            Demo universe (evidence fixtures), generated demo report, store.
src/components/      React. Renders engine output; performs no calculation.
src/app/             Six App Router routes, statically prerendered.
```

The dependency rule is one-directional: `components → domain → engine`. The
engine never imports React, and no component computes a score.

## The two report shapes

**Engine report (schema v2.0)** is the auditable truth: canonical assets,
evidence records, conflicts, per-asset recommendations with full factor traces,
capital posture, evidence summary, change log, warnings, and the journal entry.

**View report (schema v1.1)** is the presentation projection the UI renders. It
is *derived* from the engine report by `deriveViewReport`, never hand-authored.

A `.json` export contains both (`{ schemaVersion: "2.0", engine, view }`), so an
exported report carries its own audit trail. Importing a v1.0 or v1.1 file still
works — those carry the view only, and the UI degrades honestly: explainability
panels say the trace is unavailable, and price thresholds are withheld.

## Data states

Six explicit states, derived in `domain/app-state.ts` and shown in the header:
`demo`, `imported`, `live_verified`, `stale`, `insufficient_evidence`, `error`.

There is no silent fallback between them. When persisted data fails to load, the
raw bytes are copied to a recovery key, the state becomes `error`, and the demo
content that appears is labeled as such — the failure is never hidden behind
plausible-looking numbers.

`live_verified` is deliberately unreachable today: no live feed exists, and the
app will not claim otherwise.

## Rendering

All six routes are statically prerendered with the demo report so the primary
decision is readable before hydration. A client provider then rehydrates any
persisted import. Browser storage is optional throughout: blocked storage
degrades to in-memory with a status note, never a crash.

## Determinism

`generateReport` is a pure function of its inputs. Identical inputs produce
byte-identical output (asserted by test via stable stringify). This is what
makes a calculation trace reproducible and a report hash meaningful.

## Immutability

Decision journal entries are append-only. Each carries an `integrityHash`
(FNV-1a over its stable-stringified contents) and a `reportHash` over the
recommendations and posture it describes. Corrections create a new entry with
`supersedes` pointing at the old one; history is never rewritten. This is
tamper-**evident**, not tamper-proof — see `docs/DECISION_JOURNAL.md`.

## Architecture decisions

**Engine truth separate from presentation view.** The alternative — one schema
serving both — would have forced either an unauditable UI contract or a
presentation layer carrying the entire evidence graph. Deriving the view keeps
the UI contract stable while the engine payload stays complete.

**Nullable score and rating rather than a sentinel value.** Insufficient
Evidence is represented as `null`, not `0` or `"Unrated"`. A sentinel number
would eventually be averaged, sorted, or displayed by accident. `null` fails
loudly in every one of those paths.

**Renormalizing the weighted total.** Dividing by the weight of factors that
have evidence, rather than by 1, stops a missing minor factor from silently
depressing every score. The absence surfaces through the coverage penalty and
the trace, where it can be seen.

**Thresholds centralized in `constants.ts`.** Any number that shapes a decision
is declared once with a written rationale. Tuning the model is then a review of
one file, not an archaeology exercise across the codebase.

**Deterministic fixtures over hand-typed demo data.** The demo runs the same
code path as imported data. A demo that was hand-written could drift from engine
behaviour without any test noticing.
