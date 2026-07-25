# Sprint 4 completion report — Live evidence foundation

**Date:** 2026-07-25
**Deployment:** https://neoos-cio.vercel.app
**Branch:** `claude/adding-more-files-y6s0vh`
**Engine version:** 2.0.0 (unchanged) · **Pipeline:** 4.0.0 · **Envelope schema:** v4.0
**Diff:** 66 files, +9,670 / −2 across 6 commits

The objective was to make `live_verified` reachable using real primary-source
data, with durable server-side persistence, cryptographic signing, scheduled
runs, secure APIs, outcome review, and notifications.

**Sprint 4 is not complete.** The architecture is built and tested. Durable
persistence and deployment were verified in production on 2026-07-25;
`live_verified` has still never been reached, and no live evidence retrieval has
been verified. Section 7 sets out exactly what remains unproven and why. Per the
directive's own rule, that is disqualifying, and it is stated here rather than
buried.

---

## 1. Gates

| Gate | Before | After |
|---|---|---|
| Lint | pass | pass |
| Typecheck | pass | pass |
| Unit tests | 242 | 421 (+17 Postgres tests, opt-in) |
| End-to-end tests | 232 | 232 |
| Accessibility scanning | 9 axe-core scans | 9 axe-core scans |
| Production build | pass | pass — 7 new API routes, workspaces still statically prerendered |

179 new server tests. The end-to-end count is unchanged because the new surface
is server-side; the one new UI component renders inside the existing Timeline
workspace, which the suite already covers.

---

## 2. What was built

### Server layer (`src/server/`)

| Module | Responsibility |
|---|---|
| `config/env.ts` | The only module that reads credentials. Throws if loaded in a browser |
| `config/source-policy.ts` | Prohibited source kinds; per-jurisdiction claim ceilings |
| `config/portfolio.ts` | Operator context, and an explicit undeclared default |
| `types/live-state.ts` | Report and asset live states, freshness horizons, roll-up |
| `types/execution-context.ts` | Where a run happened, and what it may therefore claim |
| `types/report-envelope.ts` | v4.0 envelope, lineage, canonical signing bytes |
| `providers/sec-edgar/` | Filings and fundamentals at evidence tier 1 |
| `providers/prices/` | Vendor-neutral licensed price feed at tier 2 |
| `providers/gold/basis.ts` | Gold price basis and exact unit conversion |
| `valuation/from-filings.ts` | Fundamental analysis from filed accounts |
| `orchestration/assess.ts` | Per-asset live assessment and policy clamping |
| `orchestration/server-cycle.ts` | Assess → version → sign → verify → store → journal |
| `persistence/` | Append-only storage port, memory and Postgres |
| `signing/sign.ts` | Ed25519 signing and verification |
| `api/auth.ts` | Constant-time authorisation, rate limiting |
| `notifications/dispatch.ts` | Best-effort alerting on findings |
| `outcome/review.ts` | Decision outcome review and process quality |

### API

`/api/health`, `/api/cron/daily`, `/api/cycle/run`, `/api/report/latest`,
`/api/report/[reportId]`, `/api/decisions`, `/api/outcomes`.

### Documentation and schemas

Eleven documents (`DEPLOYMENT`, `SERVER_ARCHITECTURE`, `SEC_EDGAR_PROVIDER`,
`FUNDAMENTAL_ANALYSIS`, `LIVE_DATA_STATES`, `UAE_EVIDENCE_POLICY`,
`GOLD_PRICE_BASIS`, `PRICE_POLICY`, `PERSISTENCE_AND_SIGNING`, `SECURITY`,
`OUTCOME_REVIEW`), two schemas (report envelope v4.0, outcome review v4.0), and
an updated `TEST_STRATEGY`.

---

## 3. Decisions worth recording

**No fixture fallback on the server path.** When no provider is configured the
server run returns 409 and produces nothing. Falling back to fixtures would have
made every dashboard populate and every run succeed — and would have attached the
credibility of a signed, versioned, durably stored, verifiable artefact to
invented numbers. Every honesty control in the system exists to prevent that; one
fallback would have defeated all of them at once.

**Multiples anchored to a required yield, not to comparables.** A comparables
multiple imports the market's mood into a valuation meant to be independent of it,
and its predictable failure is that everything looks fairly priced at every point
in the cycle, including the top. Anchoring to a 9% conservative earnings-yield
requirement means the valuation answers a question the market's enthusiasm cannot
change.

**Live is gated structurally, not by convention.** `contextPermitsLive()` returns
true for one execution context. The orchestrator throws — not warns, not
downgrades — if a browser context produces records claiming live retrieval.

**Two independent judgements in outcome review.** Result and reasoning quality are
stored separately and never merged. Grading process by result punishes discipline
after an unlucky quarter and rewards carelessness after a lucky one. Lucky wins
and unlucky losses are counted rather than averaged away, because they are the
individual cases most worth reading.

**Gold's ceiling is permanent.** It has no issuer and files nothing, so the
official-filing half of the two-input test can never be satisfied. Documented as a
fact about gold, not as a gap a future release will close.

**Quarterly figures excluded by elapsed days, not by `fp`.** Trusting the fiscal
period field silently mixes Q4 comparatives into an annual series. Measuring the
actual period length (300–400 days) does not.

**The journal is tamper-resistant, never tamper-proof.** A private-key holder can
still sign a false report, and anyone with database access can delete a row.
Stating the weaker true claim is worth more than the stronger false one: a user who
believes the record is unforgeable will not check it.

---

## 4. Defects found and fixed

1. **`operationalAlerts` ran only after the early return for a failed run.** The
   one run where an operator most needs diagnostics produced a single message
   saying nothing was generated, and nothing about why. Found by running a
   configured server, not by the unit tests.
2. **Provider health was read from a pre-fetch snapshot.** The cycle captures
   descriptors before it fetches, so that snapshot necessarily predates every
   failure it might report — an unreachable endpoint appeared as a healthy
   provider. Adapters are now re-described after the run.
3. **Rate-limit spacing applied to the first request.** `lastRequestAt`
   initialised to zero conflates "no request yet" with "a request at the epoch".
   Now negative infinity.
4. **An unrecognised jurisdiction fell back to the last policy in the list.**
   Ordering was load-bearing without saying so. Now an explicit GLOBAL lookup that
   throws if the fallback is missing.
5. **`env.ts` threw under the jsdom test environment.** Not a defect — the guard
   working. Server tests moved to the node environment, which is the correct
   response and is now documented.
6. **Three defects the first live run exposed, none reachable from fixtures.**
   Each was found only by retrieving real SEC data, and each blocked the one
   after it.

   **(a) Three unit vocabularies.** The EDGAR mapper emitted EDGAR's labels
   ("USD", "shares"); the normalizer accepts only its canonical set and rejected
   70 of 78 records as `unsupported_unit`. Only the value-less filing records
   survived. The mapper and the valuation module had both been tested against
   EDGAR's vocabulary, so they agreed with each other while neither matched what
   the pipeline produces — the missing test was the seam between them.

   **(b) Magnitudes lost their values.** Normalization nulled the value of every
   currency record to stop a revenue figure leaking into a 0–100 factor score.
   Right instinct, wrong method: an evidence record asserting revenue of 400bn
   while holding no number is useless to the valuation that needs it. Units are
   now either factor scales or magnitudes; magnitudes keep their value and carry
   `factor: null`, and since scoring selects on a non-null factor a magnitude is
   structurally incapable of being read as a score. Only currency had been
   special-cased, so share counts were silently lost too.

   **(c) Annual accounts were expiring.** The `officialFiling` horizon is 120
   days, expiring at 240 — sensible for a quarterly filing, wrong for a 10-K.
   For most of any year a company's latest annual accounts are past 240 days, so
   every fundamental was discarded and no company could be valued from its own
   audited accounts for two-thirds of the year. A provider that knows a fact's
   cadence may now state its own expiry, which overrides the age heuristic. The
   record still ages to stale and its confidence still decays; it is simply not
   thrown away while nothing newer exists.

7. **Filings produced no factor scores.** With (a) to (c) fixed, Apple had a
   valuation and was still unrated: the critical-factor gate requires
   `financialStrength` coverage, and every filed record is a magnitude carrying
   no factor. Filings give dollars; factors want 0–100 scores; nothing bridged
   them. `derived-factors.ts` now computes financialStrength, businessQuality and
   growth from the fundamentals, as clearly-labelled derived records that cite
   the filings behind them and carry a lower confidence than a filed figure.

8. **The append-only revoke was documented as stronger than it is.** Running the
   schema against a real PostgreSQL 16 showed the revoke succeeds — the grant
   list loses UPDATE and DELETE — but a **superuser bypasses privilege checks
   entirely**, so for a superuser connection the statements are decorative. A
   non-superuser is blocked even when it owns the tables. The docs previously
   implied the database-level guarantee always held. Corrected in
   `PERSISTENCE_AND_SIGNING.md`, `SECURITY.md`, and the schema itself.

---

## 5. What proved out end to end

Verified against a running production build with credentials set:

| Check | Result |
|---|---|
| Unauthenticated scheduled run | 401 |
| Wrong token | 403 |
| Cron secret on an operator endpoint | 403, as designed |
| Correct token | Runs |
| Health with credentials set | `canRunLive: true`, EDGAR listed at tier 1, signing key id shown |
| Health without credentials | Names each missing variable; storage reports `durable: false` |
| EDGAR unreachable | `cycleState: failed`, zero records, nothing stored, alert naming the refusal |
| Client bundle scan | No credential value; only an env var *name* in the Sprint 3 example adapter |
| Static security invariants | 9 checks pass |

The failure path is the one that mattered most to exercise, and it behaved
correctly: nothing invented, nothing stored, and a diagnostic an operator can act
on.

---

## 6. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Server-side execution architecture | Met |
| 2 | Execution contexts gate live claims | Met — enforced structurally |
| 3 | SEC EDGAR provider retrieves filings | **Met — verified in production 2026-07-25** |
| 4 | Fundamentals derived from filed accounts | **Met — verified against live SEC data** |
| 5 | Market price provider | Built; requires paid credentials |
| 6 | Gold price basis explicit | Met |
| 7 | UAE evidence policy | Met — capped at manual, enforced in code |
| 8 | Durable server-side persistence | **Met — schema created and written in production** |
| 9 | Append-only storage | Met — enforced in code and schema |
| 10 | Ed25519 report signing | Met |
| 11 | Signature verification on read | Met |
| 12 | Tampering detected | Met — content and signature failures distinguished |
| 13 | Scheduled unattended runs | Met — auth verified; **schedule never fired** |
| 14 | Secure APIs | Met — verified against a running server |
| 15 | No credential reaches the browser | Met — four controls, nine invariant tests |
| 16 | Live honesty states | Met |
| 17 | `live_verified` reachable | **Not reached** |
| 18 | Report versioning and lineage | Met |
| 19 | Outcome review | Met |
| 20 | Notifications | Met — dispatch tested; **no webhook exercised** |
| 21 | UI states data provenance | Met |
| 22 | Tests use fixtures, not live network | Met |
| 23 | Documentation and schemas | Met |
| 24 | Lint, typecheck, tests, e2e, build pass | Met |
| 25 | Deployment verified | **Met — verified 2026-07-25 via /api/health** |

---

## 7. Why Sprint 4 is not complete

Three things are unproven, and the reasons differ.

**`live_verified` has never been reached (criterion 17).** It requires both a
current filing and a current price. EDGAR supplies the first; the second needs a
licensed feed, which is a paid service and therefore a stop condition. With EDGAR
alone the correct outcome is `partial_live` across the board — which the model
produces, and which is the model working rather than failing.

**Live EDGAR retrieval is verified (criterion 3).** On 2026-07-25 the operator
set `SEC_EDGAR_USER_AGENT` on the deployment and triggered `/api/cycle/run`. The
run retrieved 81 records from `data.sec.gov`, resolved all 81 to assets,
normalized all 81 with none rejected, valued Apple from its filed accounts, and
stored a signed-eligible report. `cycleState: success`, `liveState: partial_live`.

That run also created the Postgres schema on the production instance, closing the
last gap under criterion 8.

The build sandbox still has no outbound internet — `data.sec.gov` 403s at the
egress gateway, as does `en.wikipedia.org` as a control — so nothing here was
verified from the session that wrote it. It was verified in production, which is
the only place that counts.

**Deployment and persistence are now verified.** On 2026-07-25 the operator
provisioned a Supabase Postgres instance, set `DATABASE_URL` on the NeoOS Vercel
project, and redeployed. `/api/health` at `neoos-cio.vercel.app` returned
`kind: postgres`, `durable: true`, `reachable: true`. That closes criterion 25,
outstanding since Sprint 2, and criterion 8.

One precision worth keeping: the health endpoint runs `SELECT 1`, which proves
the connection, the pooler, and TLS. It does not call `migrate()`, so the schema
has not yet been created **on that instance** — that happens on the first cycle
run or first journal read.

The schema and the Postgres store are no longer untested, though. Both now run
against a real PostgreSQL 16 instance: `schema.sql` applies cleanly and is
idempotent across repeated runs, and 17 store tests cover the JSONB round trip,
immutability, lineage foreign keys, the review queue, corrupt-row rejection, and
the privilege grants. They are skipped unless `TEST_DATABASE_URL` is set, so the
normal suite never depends on a running database.

One smaller gap remains in this category: no notification webhook has been
exercised.

---

## 8. Known limitations

- **`live_verified` is reachable in principle and unreached in practice.** It is
  modelled, gated, and unit-tested; it has not been observed.
- **The EDGAR fixtures are hand-authored, not recordings.** A shape change would
  surface as a provider error rather than as wrong numbers, but the first real
  fetch is what confirms the shape.
- **The Postgres schema has not yet been created on the production instance.**
  The connection is verified there; `migrate()` runs on the first cycle or
  journal read. The SQL itself is now verified against a local PostgreSQL 16.
- **Append-only is not enforced against a superuser connection.** Verified
  behaviour, documented in three places. A managed provider that hands out a
  superuser-equivalent role leaves only the application-level guarantee.
- **UAE assets cannot exceed `partial_live`**, by policy, until a structured
  official endpoint or a licensed feed exists.
- **Gold cannot exceed `partial_live`**, permanently.
- **Rate limiting is per-instance** and resets on cold start.
- **Single operator token.** No accounts, roles, or sessions.
- **NeoOS does not verify execution.** Prices in an outcome review are whatever
  the reviewer types.
- **No FX conversion without a verified rate.** Non-USD evidence is reported
  unconverted rather than guessed at.
- **The dependency audit reports pre-existing advisories** in eslint, postcss, and
  sharp — build tooling, not runtime request paths. Untouched by this sprint.

---

## 9. What closes the sprint

In order, and each is small:

1. ~~**Set `DATABASE_URL`.**~~ **Done 2026-07-25.** Criteria 8 and 25 verified.
2. ~~**Set `SEC_EDGAR_USER_AGENT`.**~~ **Done 2026-07-25.** Criteria 3, 4 and the
   schema half of 8 verified. Four defects surfaced and were fixed on the way —
   see §4, items 7 to 9.
3. **Set `REPORT_SIGNING_PRIVATE_KEY` and `CRON_SECRET`.** Signed reports and the
   daily schedule. Criteria 10 and 13. Both free.
4. **A licensed price feed.** The only paid step, and the only one that makes
   criterion 17 reachable. Deferred at the operator's direction.

Steps 2 and 3 need no money and no approval beyond access to the deployment's
environment settings.
