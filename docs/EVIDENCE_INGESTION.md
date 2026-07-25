# Evidence ingestion

## RawEvidenceRecord

The record as it arrived, before interpretation. It carries the provider and its
mode, the provider's own record id, retrieval and publication timestamps, the
source reference, the title and text or payload, the asset identifiers **as the
source supplied them**, the evidence category, the value in the source's own
units and currency, geographic scope, any source-stated confidence, a checksum,
ingestion status, parsing warnings, original payload metadata, and a
`supersedesRawEvidenceId` pointer.

## Immutability

Records are frozen at ingestion and content-addressed by checksum. They are
never edited: a correction produces a **new** record whose
`supersedesRawEvidenceId` points at the original, and the original is marked
`superseded` rather than removed (`superseding()`).

`computeRawChecksum` is the single canonical checksum function. Every
construction site — fixtures, the manual-import adapter, any future vendor
mapper — must use it. A record whose checksum was computed differently would
fail verification and raise a false integrity alarm; that was a real defect
caught by test during this sprint.

The checksum covers the fields that define a record's identity: provider,
provider record id, source reference, title, text, value, unit, currency,
publication date, and identifiers. It deliberately excludes `rawEvidenceId`, so
the same content arriving under two ids is recognised as one record.

## Duplicate detection

Identical content arriving twice in a run is dropped once, with an
informational issue naming the record it duplicated. Two *different* providers
reporting the same fact are **not** duplicates: both are kept, and their
agreement or disagreement is handled as a conflict.

## Rejection

A record failing schema validation or a blocking raw-input check is not
discarded. It is recorded in `rejectedRecords` with every reason, and surfaced
in the panel's diagnostics.

## Audit path

Every normalized claim keeps the `evidenceId` of the raw record it came from,
and every factor score lists the evidence ids behind it. From a displayed score
you can therefore reach the raw record, its provider, its mode, and its source
reference.
