# Manual evidence import

Because live credentials may not exist, evidence can be supplied by hand — but
**the user never constructs the final report schema**. They supply source
records; the pipeline does identity resolution, normalization, validation,
conflict detection, UniverseInputs generation, scoring, report generation,
briefing, and the journal draft.

## Format (v3.0)

```json
{
  "schemaVersion": "3.0",
  "provider": {
    "providerId": "operator-manual",
    "providerName": "Operator manual evidence",
    "providerType": "manual",
    "sourceTier": 1,
    "legalNotes": "optional"
  },
  "asOf": "2026-07-26T08:00:00Z",
  "records": [
    {
      "sourceRef": "https://example.invalid/filings/aapl-q4",
      "title": "Balance sheet strength from the latest issuer filing",
      "identifiers": [
        { "scheme": "ticker", "value": "AAPL" },
        { "scheme": "exchange", "value": "NASDAQ" }
      ],
      "category": "filing",
      "factorHint": "financialStrength",
      "value": 93,
      "unit": "score",
      "confidence": 94,
      "publishedAt": "2026-07-20T00:00:00Z"
    }
  ]
}
```

Identifier schemes: `ticker`, `exchange`, `isin`, `cusip`, `figi`, `commodity`,
`provider_id`, `name`, `fund_name`, `category`.
Categories: `price`, `fundamental`, `filing`, `macro_indicator`,
`research_opinion`, `news`, `sentiment`, `reference`.
Optional `claimKey` groups records asserting the same fact, which is what
enables conflict detection between them.

## Honesty

Imported records are marked `manual_import` and `unverified`. NeoOS did not
retrieve them and does not claim to. They never contribute to a "Live verified"
label.

## Sample files

In `e2e/fixtures/evidence/`:

| File | Demonstrates |
|---|---|
| `valid.json` | A clean import that flows all the way to a report |
| `ambiguous-identity.json` | Category labels that must not resolve to instruments |
| `conflict.json` | Two comparable sources disagreeing on one claim |
| `stale.json` | A price well past its freshness horizon |
| `invalid.json` | An unsupported unit and a future publication date |

All five are structurally valid imports. `invalid.json` fails later, in
normalization — which is where a bad unit or date belongs, and it is rejected
with reasons rather than silently dropped.
