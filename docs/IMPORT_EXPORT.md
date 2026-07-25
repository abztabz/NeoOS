# Import and export guide

## Supported schema versions

| Version | Contents | On import |
|---|---|---|
| **1.0** | Core report: deployment, scores, radar, assets | Validated against the v1.0 contract, then migrated to the v1.1 shape. Workspace sections are absent, so the UI falls back to clearly labeled demo content |
| **1.1** | v1.0 plus optional workspace sections | Validated directly. Any subset of sections is accepted |
| **2.0** | `{ schemaVersion, engine, view }` — full engine report plus its derived view | The view is validated with the v1.1 contract; the engine payload supplies the calculation trace |

Machine-readable contracts live in `schemas/`. Only v2.0 files carry the
calculation trace, so only they enable the full explainability panels and
provenance-gated price thresholds.

## Import behaviour

Import is **atomic**. The file is parsed and validated in full before anything
changes; a failure at any step leaves the current report untouched and shows the
failing path.

Validation rejects, at minimum:

- malformed JSON
- missing required fields
- values outside enums
- negative scores and scores above 100
- non-finite values (`1e999` parses to `Infinity`)
- invalid dates
- duplicate asset ids
- a generic category carrying a ticker
- files over 1 MB
- unsupported schema versions

The preview shows the declared version, whether a migration will apply, the
radar and asset counts, and exactly which workspace sections the file provides —
all before you apply it.

## Persistence

An applied report is persisted as **the original text**, not the derived view,
so a v2.0 file's calculation trace survives a refresh.

If browser storage is unavailable, the import still applies for the session and
a status note says so. If a persisted report later fails to load, the raw bytes
are copied to a recovery key (`neoos.report.recovery`), the app enters the
explicit `error` state, and the demo content shown is labeled — the failure is
never hidden.

## Export

A generated report serialises as a v2.0 file containing both the engine payload
and the view, so an exported report carries its own audit trail and can be
re-imported with full explainability intact.

## Producing a report

`generateReport(inputs)` in `src/engine/generate.ts` takes a `UniverseInputs`:
canonical assets with optional valuation inputs, evidence records, the cash
position, macro context and regions, portfolio holdings and allocations,
editorial text, and prior journal history. It returns
`{ schemaVersion: "2.0", engine, view }`.

`src/data/demo-universe.ts` is a complete worked example: 50 evidence records
across six assets, including one asset deliberately left evidence-poor so the
Insufficient Evidence path is exercised, and one genuine source conflict.

The pipeline is deterministic — identical inputs produce byte-identical output.

## Version compatibility

Reports are comparable only within an engine major version. When a report's
`engineVersion` differs from the previous report's, the change log records it
and notes the scores are not directly comparable.
