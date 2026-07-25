# EDGAR contract fixtures

**These are hand-authored, not captured.**

They were written against the SEC's documented response shape for
`/api/xbrl/companyfacts/CIK##########.json` and
`/submissions/CIK##########.json`. They are **not** recordings of real EDGAR
responses, and the session that wrote them had no outbound network access to
verify them against the live endpoint.

That distinction matters, so it is stated here rather than left to be inferred:

- **What these fixtures prove.** That the client, schema validation, tag
  selection, restatement handling, period filtering, and record mapping behave
  as specified — including on the awkward inputs, which is why the fixture is
  built out of awkward inputs.
- **What they do not prove.** That EDGAR's live responses match this shape
  today. A shape change would surface as `malformed_response` from the client
  (loudly, as a provider error) rather than as wrong numbers, but the first real
  fetch is what confirms it.

The issuer is **synthetic on purpose**. It is `Fixture Issuer Inc.`, CIK
`0001234567`, ticker `FIXT`, with round invented figures. Using a real company's
name over invented financials would create a document that looks like a
statement of fact about that company, and someone would eventually read it as
one. Tests point the coverage table at this synthetic CIK.

## What each fixture exercises

`fixture-issuer-companyfacts.json`

| Case | Why it is here |
|---|---|
| `Revenues` (legacy) alongside `RevenueFromContractWithCustomerExcludingAssessedTax` | The current tag must win. A filer carrying a stale legacy tag must not have its old figures reported. |
| `NetIncomeLoss` with the same period filed twice at different values | A restatement. The later filing wins, because that is the company's current position on its own past. |
| An operating-cash-flow value from a `10-Q` | Must be excluded from the annual series by form. |
| A 92-day duration inside a `10-K` | A Q4 comparative. Must be excluded by elapsed-day range, which is why the filter measures days rather than trusting `fp`. |
| `Liabilities` entirely absent | Must produce a named warning and no record — never a zero. |
| `EntityCommonStockSharesOutstanding` under `dei` | The taxonomy is not always `us-gaap`. |

`fixture-issuer-submissions.json`

| Case | Why it is here |
|---|---|
| Parallel column arrays | EDGAR stores filings column-wise; the mapper has to zip them. |
| A mix of `10-K`, `10-Q`, `8-K`, and `4` | Only periodic and current reports are kept. |

`fixture-issuer-submissions-ragged.json` has one column shorter than the rest.
That response is treated as corrupt and produces no records at all, because
pairing the wrong form with the wrong date is worse than reporting nothing.
