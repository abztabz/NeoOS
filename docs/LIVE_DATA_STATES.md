# Live data states

The honesty model. One rule governs all of it:

> Prefer `partial_live` or `insufficient_evidence` over false completeness.

---

## 1. Two scales, deliberately separate

A global "live" report does not imply every asset is live. Collapsing the two
would force a report to round itself either up or down, and both are lies.

### Report states

| State | Meaning |
|---|---|
| `live_verified` | Every supported asset is live verified |
| `partial_live` | Live evidence exists; at least one asset falls short |
| `live_stale` | Live evidence exists but all of it has aged out |
| `manual_verified` | Operator-supplied evidence, no live retrieval |
| `fixture` | Bundled illustrative records |
| `insufficient_evidence` | Nothing could be rated |
| `failed` | The run did not complete |

### Asset states

| State | Tone | Meaning |
|---|---|---|
| `live_verified` | green | Current filing **and** current price |
| `partial_live` | cyan | Live evidence, one half missing |
| `stale` | amber | Retrieved, but past its horizon |
| `conflicted` | amber | Unresolved evidence conflict |
| `insufficient_evidence` | amber | The engine could not rate it |
| `unsupported` | amber | No configured provider covers it |
| `provider_error` | red | Every provider for it failed |

Text always carries the meaning; colour is secondary.

---

## 2. The two-input test

An asset is `live_verified` only with **both** a current official filing and a
current price.

Neither half is sufficient. A price without fundamentals cannot support a rating.
Fundamentals without a price cannot support a margin of safety — and margin of
safety is what the whole Strong Buy gate turns on. Either alone is `partial_live`.

This is why a fully configured EDGAR-only deployment still reports `partial_live`
across the board. That is not a defect; it is the model working.

---

## 3. Freshness horizons

Staleness depends on what a feed claims about itself:

| Timeliness | Stale after |
|---|---|
| `real_time` | 30 minutes |
| `delayed` | 2 hours |
| `end_of_day` | 36 hours |
| `unknown` | 1 hour |

An end-of-day mark is *expected* to be hours old and should not be flagged for
it; a real-time quote that is two hours old is stale by definition. Holding both
to one threshold would either cry wolf on one or miss the other.

`unknown` is the default when a provider states nothing, and it is treated
conservatively. **There is no code path that infers real-time** — from response
latency, from market hours, or from anything else. Claiming real-time without the
licence to do so misrepresents both the data and the agreement it came under.

Official filings go stale after **120 days**. A company that has not filed in
four months has missed a quarter.

---

## 4. Ordering of the assessment

The most serious honest description wins:

1. `unsupported` — no provider covers it at all
2. `provider_error` — every provider failed **and** nothing came back
3. `insufficient_evidence` — the engine could not rate it regardless of data
4. `conflicted` — unresolved disagreement between sources
5. `stale` — retrieved but aged out
6. `live_verified` — both halves current
7. `partial_live` — otherwise

A provider error only wins when nothing arrived. If a price feed timed out but
fundamentals came through, the asset is `partial_live` with a warning, not an
error — something useful is present and the state should say so.

---

## 5. Policy ceilings

Every assessment is clamped to the ceiling its jurisdiction and asset class
permit, at assessment time rather than at display time, so no rendering path can
bypass it.

| Class | Ceiling | Why |
|---|---|---|
| US equity | `live_verified` | EDGAR publishes structured filings |
| UAE equity | `partial_live` | No structured official endpoint — see [UAE_EVIDENCE_POLICY.md](UAE_EVIDENCE_POLICY.md) |
| Commodity | `partial_live` | No issuer, so no filing, permanently |
| Unknown jurisdiction | `partial_live` | Defaults to the stricter global policy |

An asset can fall short of its ceiling for evidence reasons. It can never exceed
it, however good the evidence looks.

---

## 6. Roll-up

Global `live_verified` requires **every supported asset** to be `live_verified`.
One partial asset makes the whole report partial.

Unsupported assets are excluded from the judgement rather than dragging it down —
a report covering three US equities should not be marked down because gold has no
filings.

The report never rounds up to the most flattering description of itself.
