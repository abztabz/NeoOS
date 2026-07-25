# UniverseInputs generation

`buildUniverseInputs` is the **only** place `UniverseInputs` is composed. No UI
component builds one, and the generator never computes a score.

## Inputs

The canonical asset registry, normalized evidence, identity traces, validation
issues, portfolio and mandate context, per-asset valuation configuration,
provider descriptors, prior journal history, and the previous report.

## Outputs

The validated `UniverseInputs` plus everything needed to explain it: excluded
assets with reasons, excluded evidence with reasons, warnings, blocking errors,
per-asset evidence coverage, a freshness summary, an identity-resolution
summary, a conflict summary, and provider health.

## Exclusion rather than guessing

An asset with a blocking issue is **dropped from the entry list with a stated
reason** rather than scored on partial data. The engine then reports Insufficient
Evidence for it. Expired evidence is likewise removed from the engine's input
set and recorded in `excludedEvidence`.

## Valuation configuration

Each asset supplies a builder that turns its evidence into a `ValuationInput`,
or returns null when the required inputs are absent. Absence is recorded as a
warning; the engine's gates decide the consequence.

`value-etf` deliberately has **no** builder in the fixture configuration, which
is what leaves it evidence-poor and demonstrates the Insufficient Evidence path
end to end.

## Mode

The generator sets `mode: "live"` only when every contributing record came from
a live provider. Fixture and manual runs are `demo` as far as the engine is
concerned, regardless of how rich the evidence is.
