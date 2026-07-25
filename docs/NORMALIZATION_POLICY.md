# Normalization policy

Normalization converts a `RawEvidenceRecord` plus an already-resolved identity
into an engine `EvidenceRecord`. It performs no identity guessing and no
scoring.

## Currency

**A converted number never replaces the original.** Every conversion records the
original value, original currency, rate, rate source, rate timestamp, normalized
value, and normalized currency.

**Without a verified rate, no conversion happens.** The original is preserved
and the record is blocked from calculations that would mix currencies — the
`incompatible_currency` code. A plausible-looking rate is never invented.

## Units

Supported: `score`, `percent`, `basis_points`, `ratio`, `currency_per_share`,
`currency_per_troy_ounce`, `currency`, `multiple`, `count`, `index_level`. An
unrecognised unit is blocking: silently treating basis points as percent moves a
number by two orders of magnitude.

Only units with a defensible mapping reach the engine's 0–100 factor scale —
`score`, `percent`, `basis_points`, `ratio`. A price has no intrinsic 0–100
meaning, so currency-denominated records feed valuation inputs instead and
return null rather than an invented score.

## Scale

Recognised prefixes: thousand, million, billion and their abbreviations. An
unknown scale is an error, not a shrug.

## Dates

All timestamps normalize to UTC ISO-8601. An unparseable date is blocking
(`impossible_date`) rather than becoming an Invalid Date that poisons later
arithmetic. A publication date more than 90 minutes in the future is blocking
(`future_publication_date`); clock skew between a provider and this machine is
normal, a day is not.

## Type, tier, and freshness

The evidence category maps to an engine evidence type, which fixes the source
tier and therefore the freshness horizon. Where a source states no confidence,
the tier's standing is used (tier 1 → 92 … tier 6 → 45) rather than inventing a
number.

Records from a `live` provider are marked `verified`; manual imports are marked
`unverified`, because NeoOS did not retrieve them.

## Determinism

Normalization is a pure function of the record, the identity, and the cycle
context. It never reads the clock.
