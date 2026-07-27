# Network architecture

Where NeoOS makes outbound requests, where it deliberately cannot, and why those
two facts must never be reported as the same thing.

---

## 1. Three environments

| Environment | Egress | Providers run against | A failure here means |
|---|---|---|---|
| `development` | Often blocked by sandbox policy | Fixtures and recorded responses | Nothing about production |
| `ci` | **Deliberately blocked** | Fixtures only | A test reaching the internet is a defect |
| `production` | **Required** for retrieval | Live endpoints | A real outage worth alerting on |

Detected by `currentNetworkEnvironment()`: `NEOOS_NETWORK_ENV`, then `CI`, then
`VERCEL_ENV`, then `NODE_ENV`. Read from configuration, **never inferred from a
failed request** — a timeout is not evidence of being in CI, and treating it as
such would let a production outage relabel itself as an expected test condition.

### The honest sentence for a blocked environment

`egressBlockedReason()` produces it, and it is worded so nobody reads it as a
product limitation or a bill:

> This deployment is declared as having no outbound network access, so no provider
> can be reached. This is an environment restriction, not a licensing one: free and
> official sources become available as soon as the deployment can make outbound
> requests.

A local machine is **not** assumed blocked. Pre-emptively disabling providers in
development would hide real integration problems.

---

## 2. Egress allowlist

`EGRESS_ALLOWLIST` in `src/server/config/network.ts`. Every standing outbound
destination, and every one of them free and unauthenticated:

| Host | Provider | Purpose | Terms |
|---|---|---|---|
| `data.sec.gov` | `sec-edgar` | US issuer facts and filings | Public domain; descriptive User-Agent required; rate-limited |
| `data-api.ecb.europa.eu` | `ecb-fx` | Euro FX reference rates | Free to use and redistribute with attribution |
| `api.fiscaldata.treasury.gov` | `us-treasury-fiscal-data` | Treasury average interest rates | US federal government work, public domain |

Optional licensed providers add hosts derived from their configured base URLs
(`optionalAllowlistHosts()`), so a new vendor cannot quietly widen the deployment's
network surface without appearing in the allowlist.

A test asserts that every standing entry is credential-free. That assertion is the
claim "NeoOS needs a paid API" contradicted in code rather than in prose.

---

## 3. Retrieval discipline

`OUTBOUND_POLICY`, applied to every provider:

| Control | Value | Why |
|---|---|---|
| Timeout | 10s | A hanging provider must not hold the cycle |
| Retries | 2, exponential from 500ms | Transient failures are common; hammering is rude |
| Min interval between identical requests | 60s | Free official endpoints stay free partly because their users behave |
| Cache TTL | 300s | Well under the shortest freshness window, so caching can never be what makes an observation stale |
| Default rate limit | 30 req/min per host | Applies where the provider states none |
| User-Agent | Identifies NeoOS and a contact | Anonymous automated traffic to a public institution is refused by this codebase |

**Failure isolation.** A provider that throws is one dead branch, not a dead walk.
The resolver records the failure in its trail and continues down the hierarchy.

---

## 4. Client boundary

Providers are called from the server only. The browser never fetches authoritative
market data directly and never receives a credential.

Two structural controls, not conventions:

1. `src/server/config/env.ts` calls `assertServerOnly()` at module scope and throws
   if evaluated in a browser.
2. No provider variable carries the `NEXT_PUBLIC_` prefix, so Next.js is
   structurally incapable of inlining one into a client bundle.

Enforced by a test (`src/server/security.test.ts`).

---

## 5. What production actually needs

In order, and the order is the message:

1. **Outbound HTTPS to the allowlist.** Free. Sufficient on its own for FX,
   government yields, and US issuer fundamentals.
2. **`SEC_EDGAR_USER_AGENT`.** Free. A contact string the SEC requires.
3. **Server-side retrieval only.** Already structural.
4. **Optionally, licensed credentials.** Lowers latency and widens instrument
   coverage. Required by no part of the daily briefing.

---

## 6. Observability

`GET /api/health` reports, without exposing a single secret value:

- `network.environment` and `network.egressBlockedReason`
- `marketData.freeProvidersUsable` / `licensedProvidersUsable` / `blocked`
- every market provider with `requiresCredentials`, `requiresPaidSubscription`,
  `outboundHosts`, `unavailableReason`, and its attribution
- `marketData.freelyCovered` and `marketData.unsupported` asset classes
- `optionalUpgrades`, kept strictly separate from `missing`

An operator looking at a failing deployment can tell "my environment has no egress"
from "this instrument needs a subscription" from "this asset class is not
supported" — which was precisely the distinction the previous single-sentence
readiness message destroyed.

---

## 7. Verification status of the official adapters

Stated plainly because the alternative is a claim this codebase cannot support.

The ECB and Treasury adapters are implemented against those services' documented
response shapes and are **contract-tested against recorded fixtures**. They have
**not** been exercised against the live endpoints from the environment this code
was written in, because that environment returns `403` on `CONNECT` to every
external host.

That is a statement about the sandbox, not about the adapters and not about the
data. First production deployment with egress should confirm both, and
`/api/health` will show whether they resolved.
