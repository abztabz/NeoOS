# Provider adapters

A provider is anything that can hand NeoOS raw source records. The contract
exists so the application can always say precisely where a claim came from and
whether it was actually retrieved.

## The interface

`describe()` returns a `ProviderDescriptor` and must be safe to call at any
time, including unconfigured — the provider panel depends on it and must never
trigger a network call. `fetch()` returns a `ProviderFetchResult`; failure is
returned as data, never thrown.

Each descriptor carries: id, name, type, source tier, capabilities, supported
asset classes, mode, configured and authenticated flags, health, last successful
retrieval, failure reason, licensing notes, and rate-limit metadata.

## Modes

| Mode | Label shown | Meaning |
|---|---|---|
| `live` | Live verified | Actually retrieved from a configured, authenticated provider |
| `fixture` | Fixture intelligence | Bundled illustrative records |
| `manual_import` | Manual evidence | Operator-supplied source records |
| `disabled` | Disabled | Not configured; no request attempted |
| `error` | Provider error | Configured but the retrieval failed |

**Only `live` may be described as live.** A run's label is derived from the
modes that actually contributed: any non-live contribution downgrades it, so a
mixed run reads "Partial live" rather than "Live verified".

The honesty control is enforced, not merely documented: `validateRawRecord`
blocks any record whose declared mode differs from its provider's actual mode.

## Shipped adapters

**FixtureProviderAdapter** serves bundled records, stamps every one `fixture`,
and reports `authenticated: false` — a fixture is not authenticated against
anything real. It can simulate an outage for partial-success testing.

**ManualEvidenceImportAdapter** parses a versioned v3.0 evidence file into raw
records marked `manual_import`. See `MANUAL_EVIDENCE_IMPORT.md`.

**HttpProviderAdapter** is the shape a real vendor integration takes. It ships
unconfigured and fails safe: with no credential it attempts no request, reports
`disabled`, and contributes nothing. Enable it by setting
`NEOOS_MARKET_DATA_API_KEY` and `NEOOS_MARKET_DATA_BASE_URL` in the server
environment.

## Credentials

Credentials are read from the server environment by name; no key is embedded in
source, and the adapter must not be constructed in client code. The descriptor
exposes whether a credential is present, never its value.

## Adding a provider

1. Implement `ProviderAdapter`.
2. Map the vendor payload into `RawEvidenceRecord`s, using
   `computeRawChecksum` so integrity verification succeeds.
3. State the licensing position in `legalNotes` — it is displayed, not hidden.
4. Never scrape a source whose terms or robots rules make it inappropriate.
