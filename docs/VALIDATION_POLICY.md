# Validation policy

Validation runs in six stages. Each returns issues rather than throwing, so a
run reports everything wrong with it rather than stopping at the first problem.

| Stage | Checks |
|---|---|
| `raw_input` | Provenance present, provider registered, declared mode matches the provider's actual mode, identifiers present for non-macro records |
| `identity` | Resolution outcome; unattributed records warned with candidates |
| `normalized_evidence` | Critical-factor evidence not entirely expired; fiscal-period contradictions |
| `universe_inputs` | Universe non-empty, every valuation reproducible, allocations sane |
| `generated_report` | Rated recommendations carry a score and a reproducible trace; every scored asset appears in the view |
| `journal_entry` | Schema and integrity marker |

## Severity

| Severity | Consequence |
|---|---|
| `blocking` | The affected conclusion cannot be rated; the record is rejected |
| `warning` | Recorded and displayed; scoring continues |
| `informational` | Noted for audit only |

## Codes

Stable codes so tests and the UI never match on prose: `unknown_asset_identity`,
`ambiguous_asset_identity`, `conflicting_asset_identity`, `unsupported_unit`,
`impossible_date`, `future_publication_date`, `stale_critical_evidence`,
`incompatible_currency`, `duplicate_source_record`, `unsupported_evidence_type`,
`conflicting_fiscal_period`, `provider_mode_misrepresented`,
`missing_provenance`, `malformed_numeric_value`,
`non_reproducible_valuation_input`, `schema_violation`, `unresolved_conflict`,
`no_usable_evidence`.

## Nothing is discarded silently

Every rejected record is kept in `rejectedRecords` with all of its reasons and
shown in the panel's diagnostics.

## Two checks worth naming

**`provider_mode_misrepresented`** blocks any record claiming a mode its
provider is not in. This is the enforcement behind "fixture data is never
presented as live".

**`non_reproducible_valuation_input`** blocks a valuation that cites no evidence
or states no assumptions. A valuation that cannot be reproduced is not evidence;
it is a rumour with a decimal point.
