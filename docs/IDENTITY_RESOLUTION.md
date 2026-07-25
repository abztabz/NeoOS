# Identity resolution

Mapping a source's idea of an asset onto a canonical NeoOS asset is where a
silent guess does real damage: attributing one issuer's filing to another
produces a confident, wrong recommendation.

## Supported identifiers

Ticker, exchange, ISIN, CUSIP, FIGI, commodity symbol, provider-specific ids,
aliases, legal names, fund names, and category labels.

## Confidence by method

| Method | Confidence |
|---|---|
| ISIN / FIGI | 99 |
| CUSIP | 98 |
| Ticker **with** exchange | 96 |
| Commodity symbol | 95 |
| Provider id | 92 |
| Exact legal or fund name | 80 |
| Alias | 74 |
| Category label | 55 |

The confidence floor is **70**. A category label scores below it *by
construction*, so a generic phrase can never resolve to a specific instrument.

## Outcomes

| Outcome | Meaning |
|---|---|
| `matched` | One asset at or above the floor |
| `ambiguous` | Best candidate below the floor |
| `conflicted` | Two or more assets matched decisively — the identifiers disagree |
| `unmatched` | No candidate at all |

Only `matched` populates `assetId`. The other three leave it null and list every
candidate considered.

## Rules

- **A ticker alone is not decisive.** Tickers repeat across exchanges. Without
  an exchange the candidate is scored down and a warning is emitted.
- **A ticker with a mismatched exchange does not match.** It warns instead.
- **Category labels never identify an instrument.**
- **Conflicting identifiers are surfaced, not averaged.**

## What happens to an unattributed record

The record is dropped — never attached to a guess — and a warning naming the
candidates is recorded. Whether that shortfall matters is then decided by the
engine's own insufficient-evidence gate: an asset left without critical-factor
coverage cannot be rated, while an asset with ample other evidence is unaffected
by one unusable record.

This is deliberate. Blocking an asset outright on any ambiguous record would
punish well-evidenced assets for one sloppy feed.

## Fixture coverage

AAPL by ticker and exchange; Apple by name and by alias; ISIN-only; SPY
correctly; "S&P 500 ETF" remaining ambiguous; XAU as gold; a generic
developed-market value ETF not mapping to a ticker; a UAE listing by ticker and
exchange; a mismatched exchange; and identifiers pointing at different assets.
