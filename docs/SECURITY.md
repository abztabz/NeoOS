# Security

Every control here corresponds to a specific way this system could leak a
credential, publish a false claim, or be driven by someone who should not be
driving it. Each is enforced in code and, where possible, pinned by a test.

---

## 1. Credentials never reach the browser

Four independent controls, because one is a convention and four is a property.

**One module reads them.** `src/server/config/env.ts` is the only file that reads
a credential from the environment. A test asserts this by scanning the source
tree.

**It refuses to load in a browser.** `assertServerOnly()` runs at module scope and
throws if `window` exists. This is not theoretical — the server test suite had to
move to the node environment because the guard fired under jsdom.

**No `NEXT_PUBLIC_` prefix.** Next.js inlines only that prefix into client
bundles, so the variables NeoOS uses are structurally incapable of reaching one. A
test fails the build if any credential-shaped name acquires the prefix.

**No client component imports a credentialed module.** A test walks every file
carrying `"use client"` and asserts none imports `@/server/config`,
`@/server/providers`, `@/server/persistence`, `@/server/signing`,
`@/server/runtime`, `@/server/api`, or `@/server/orchestration`.

Client components may import server **type** modules — the status panel needs the
live-state labels — and a test asserts those modules contain no `process.env` and
no config import.

**Presence, never value.** `describeConfiguration()` returns booleans.
Not masked values: `sk_live_…abcd` still leaks length and prefix.

---

## 2. Authorisation

**Constant-time comparison.** A `===` on a token returns sooner the earlier it
finds a mismatch, which is measurable over enough attempts. A length mismatch
still burns a comparison so it is not faster to detect.

**Unconfigured means closed.** With no secret set, the endpoint returns 503. The
tempting alternative — skip the check when there is nothing to check against —
turns a forgotten environment variable into an open endpoint on the route that
triggers runs and writes to the journal.

**No echo.** An error never contains the expected value, truncated or otherwise,
and never a stack trace or configuration detail.

**Separated principals.** The cron secret authorises `/api/cron/daily` only. The
operator token authorises that plus the write endpoints. A cron secret reaching an
operator endpoint is rejected — verified against a running server.

**Which surfaces are public.** `/api/health` and `/api/gold/uae` are open. Health
carries booleans and provider ids, never a credential value. The gold board is a
reference price for a metal, which is a public fact and not a statement about
anybody's holdings.

`/api/pricing/quote` is operator-authenticated even though a share price is also
public, because the *question* is not: the list of instruments somebody asks
about is itself a statement about what they own. Its response carries provider
ids and outcomes so a reader can see which sources were consulted, and never an
endpoint, a URL or a key.

**Rate limiting.** Per-instance and honestly documented as such: it resets on cold
start and does not coordinate across instances. It stops an accidental loop, not a
determined attacker. Real rate limiting belongs at the edge.

---

## 3. Provider egress

**Keys travel in headers, never query strings.** Query strings land in proxy logs,
browser history, and error reports.

**Every request is bounded** by a timeout and an attempt ceiling. A 404 and a
malformed response are not retried — neither will repair itself, and hammering a
public agency's servers over a settled answer is both futile and rude.

**Responses are validated, not trusted.** EDGAR is a public endpoint that changes
without notice. An unrecognised shape becomes a provider error rather than wrong
fundamentals.

**No scraping.** `rendered_page_scrape` and `aggregator_secondary` are prohibited
source kinds with stated reasons, not merely unimplemented ones.

---

## 4. Input handling

| Surface | Control |
|---|---|
| Portfolio context | Zod-validated, 256 KB body cap |
| Decisions and outcomes | Zod-validated; an outcome for an unrecorded decision is 404 |
| Report id in a path | Regex-validated before touching storage, on top of parameterised queries |
| Stored rows | Re-validated on read; storage is untrusted input |
| Prices | Rejected if zero, negative, NaN, currency-less, timestamp-less, or moved implausibly in one step |
| Instrument descriptions | Zod-validated; no caller-supplied identity — `resolveIdentity` derives it, so an ambiguous symbol cannot be asserted as verified |

The price guards matter more than they look. A malfunctioning feed is more
dangerous than a missing one: it produces a plausible margin of safety from a
fictional number, and every downstream control will treat it as real.

---

## 5. Claim integrity

**Live is structurally gated.** `contextPermitsLive()` returns true for exactly
one execution context. The orchestrator throws — not warns, not downgrades — if a
non-server context produces records claiming live retrieval.

**Policy ceilings are applied at assessment**, not at display, so no rendering
path can bypass them.

**No fixture fallback on the server path.** An unconfigured deployment produces
nothing and returns 409 with what is missing. See
[SERVER_ARCHITECTURE.md](SERVER_ARCHITECTURE.md) §3.

**Signatures are verified on read.** See
[PERSISTENCE_AND_SIGNING.md](PERSISTENCE_AND_SIGNING.md).

---

## 6. Notifications

The payload carries findings only — severity, title, body, details, timestamp. No
credentials, no connection strings, no report content. A webhook URL is a shared
secret at best and often lands in a chat channel with a wide audience.

Delivery failure never fails a cycle. A report generated, signed, and stored
correctly has succeeded even if the webhook was down; throwing would turn a
messaging outage into a lost report.

---

## 7. What is not covered

Stated plainly, because a security document that lists only strengths is
marketing.

- **No user authentication.** There is one operator token, not accounts, roles, or
  sessions. NeoOS is a single-operator tool as built.
- **Rate limiting is per-instance**, as above.
- **No audit log of API access.** Journal entries record what a run did, not who
  called what.
- **A private-key holder can sign a false report.** Signing proves origin and
  integrity, not honesty.
- **Deletion is not prevented.** Append-only stops rewriting, not removal. Someone
  with database access can drop a row; they cannot alter one undetectably.
- **Append-only can be switched off by anyone who can `ALTER TABLE`.** It is
  enforced by a trigger on each table, which does block a superuser — unlike the
  privilege revoke it replaced — but a role that can disable the trigger can
  disable the guarantee. See PERSISTENCE_AND_SIGNING.md §5.
- **No secret rotation automation.** Rotation is manual and documented.
- **The dependency audit reports pre-existing advisories** in eslint, postcss, and
  sharp — build-time tooling, not runtime request paths. They predate this sprint
  and are not addressed by it.
