# The daily Morpheus cycle

`runDailyMorpheusCycle(input)` in `src/intelligence/orchestration/cycle.ts`.

## Steps

1. Load provider configuration
2. Ingest raw evidence (with duplicate detection and raw validation)
3. Resolve asset identity
4. Normalize evidence
5. Validate normalized evidence
6. Detect and resolve conflicts
7. Build UniverseInputs
8. Invoke the existing scoring engine
9. Validate the generated report
10. Compare with the prior report
11. Generate the Morpheus briefing
12. Draft a decision-journal entry

Each step appends an `AuditStep` with timings, outcome, and counts.

## Input

`runId`, the cycle timestamp `now` (nothing downstream reads the clock),
adapters, portfolio context, valuation configuration, the FX table, base
currency, journal history, and the previous report.

## Result

State, timings, provider descriptors as they were during the run, contributing
modes, the honest data label, evidence counts, raw and normalized evidence,
rejected records, identity traces, issues, excluded assets and evidence,
warnings, blocking errors, the UniverseInputs, the report, the diff, the
briefing, a draft journal entry, and the audit trace.

## State selection

- Every asset unratable → `insufficient_evidence`
- No usable evidence, or the report failed validation → `failed`
- A provider failed, records were rejected, an asset was excluded, or a blocking
  issue exists → `partial_success`
- Otherwise → `success`

A run with any rejection is never reported as `success`.

## Failure behaviour

On `failed` the result carries **no report**, so the caller keeps the last valid
one. The store only advances its comparison baseline when a run actually
produced a report, so a failure never becomes the thing the next run is
compared against.

## Provenance stamping

After generation the orchestrator stamps the run's provenance label onto the
report — the engine knows nothing about providers, so it cannot do this itself.
The label then travels with the report, and the cockpit states it.

## Determinism

Identical inputs produce identical output, asserted by test.
