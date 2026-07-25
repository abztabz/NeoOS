# Intelligence architecture

Sprint 3 added `src/intelligence/`, a layer that turns raw source records into
the validated domain inputs the scoring engine already consumes. It sits beside
the engine, never inside it.

## The operating loop

```
ingest → identify → normalize → validate → resolve conflicts
      → build UniverseInputs → score → generate report
      → compare with previous → produce briefing → capture decision → append journal
```

`runDailyMorpheusCycle` (`orchestration/cycle.ts`) sequences all of it. It owns
ordering and state and computes nothing itself.

## Layers and the rule between them

```
src/intelligence/
  types/           Contracts: provider, raw evidence, identity, validation,
                   cycle, diff, briefing, decision.
  adapters/        Fixture, manual import, and an example HTTP vendor.
  ingestion/       Immutable raw records, checksums, duplicate detection.
  identity/        The canonical asset registry and the resolver.
  normalization/   Units, scale, currency, dates → EvidenceRecord.
  validation/      Six stages, each emitting typed issues.
  conflicts/       Revisions and measurement mismatch on top of the engine's own.
  universe/        The only composer of UniverseInputs.
  comparison/      Deterministic report diff.
  briefing/        The daily briefing.
  journal/         Append-only journal, decisions, run history.
  orchestration/   The cycle.
  fixtures/        The six-asset proof run.
```

Dependency direction is one-way: `UI → intelligence → engine → domain`.

Four rules hold the separation:

1. **The pipeline never writes a score or a rating.** It produces evidence and
   inputs; the engine produces every number.
2. **The engine never learns about providers.** It has no concept of fixture or
   live. The one exception is a provenance label the orchestrator *stamps onto*
   the finished report so the UI can state where the numbers came from — the
   engine does not read it or act on it.
3. **Normalization never guesses identity.** It receives an already-resolved
   identity and refuses to proceed without one.
4. **No React component composes UniverseInputs or contains provider logic.**

## Why the orchestrator returns data instead of throwing

Every stage returns issues rather than raising. A run therefore produces a
complete picture of everything that went wrong, not just the first failure —
which is what makes the diagnostics panel and the audit trace useful.

## Cycle states

| State | Meaning |
|---|---|
| `success` | Everything ingested cleanly and every asset was assessed |
| `partial_success` | A provider failed, records were rejected, or an asset was excluded |
| `insufficient_evidence` | Nothing in the universe could be rated |
| `failed` | No usable evidence, or the generated report failed validation |
| `cancelled` | Reserved for user-aborted runs |

A run with any rejection is `partial_success`. Presenting it as `success` would
be the kind of quiet overstatement the whole system is built to avoid. On
`failed` the result carries no report, so the caller keeps the last valid one.

## Determinism

Given identical inputs the cycle produces identical output, asserted by test.
Adapters receive the cycle timestamp rather than reading the clock, and no
stage samples randomness.
