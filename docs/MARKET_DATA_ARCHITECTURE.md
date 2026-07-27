# Market data architecture

How NeoOS obtains a price, how it says what kind of price it is, and what it
does when it cannot get one.

---

## 0. The correction this document exists to make

NeoOS previously stated, in effect:

> NeoOS cannot access live market data without a paid API.

That was wrong, and it was wrong in a way that mattered: it took a restriction of
the sandbox the code was written in and reported it as a permanent property of the
product. The accurate statement is:

> The current execution environment cannot directly retrieve external market
> observations. NeoOS requires a network-enabled production data adapter. Many
> official, delayed and end-of-day sources are available without paid exchange
> licensing; true exchange-grade real-time or streaming data may require a
> licensed provider.

Three separate facts had been collapsed into one sentence:

| Fact | What it actually is | How it is fixed |
|---|---|---|
| The build sandbox blocks outbound requests | An environment policy | Deploy where egress is allowed. Free. |
| No provider covers this instrument | A coverage gap, per asset class | Add an adapter, or use manual entry |
| No licensed subscription is configured | An optional upgrade | Buy one, or don't — the briefing works either way |

Only the third involves money. Only the second is about the instrument.

**NeoOS is a long-horizon system.** It does not need tick data to decide whether
to deploy capital this month. It needs the last *disclosed* observation, dated,
sourced, and honest about its own latency.

---

## 1. What a price must carry

`MarketObservation` (`src/server/types/market-observation.ts`). Every field a
reader would need in order to disagree with the number is mandatory:

instrument identifier · instrument name · venue · currency · price · price unit ·
observed timestamp · retrieval timestamp · observation class · source class ·
provider · source name · known delay · adjustment basis · corporate-action
handling · freshness · validation state · failure reason · previous close ·
attribution.

A source that cannot supply a timestamp, a currency, or its own latency does not
produce a weaker observation. It produces a **failure**.

---

## 2. Latency is a class, not the word "live"

`live` was doing three jobs and has been retired as a status. Six classes replace it:

| Class | Meaning | Licence needed |
|---|---|---|
| `real_time` | Struck on the venue, no deliberate delay | Usually yes |
| `delayed` | Genuine venue price, held back by a stated interval | Usually no |
| `end_of_day` | Session close or settlement mark | Usually no |
| `latest_official` | Most recent publication by the primary institution | No |
| `manual` | Operator entry with a citation | No |
| `unavailable` | Nothing usable was obtained | — |

Only `real_time` may ever be described as real-time, and only when the operator
has stated their licence grants it. `unknown` timeliness maps to `delayed`, never
upward.

---

## 3. Freshness depends on the decision, not the clock alone

A two-hour-old quote is stale for a trade and entirely adequate for a decision
measured in years. `FRESH_WITHIN_MINUTES` crosses observation class with decision
horizon (`intraday`, `daily`, `strategic`; default `daily`).

An end-of-day mark from yesterday evening is **fresh** for a daily briefing. It is
**expired** for an intraday decision at any age — waiting does not help, because
the wrong instrument is being used for the job.

Past the freshness window an observation ages, then goes stale, then expires. What
each state permits:

| State | May rate | May upgrade | May support Strong Buy | Confidence |
|---|---|---|---|---|
| `fresh` | yes | yes | yes | ×1.0 |
| `aging` | yes | yes | **no** | ×0.85 |
| `stale` | yes | **no** | no | ×0.6 |
| `expired` | **no** | no | no | ×0 |
| `unknown` | **no** | no | no | ×0 |

The asymmetry is the safeguard. Stale evidence may still support *holding* or
*reducing*, because those are the conservative directions. It may never support a
new Buy and never a Strong Buy. Deploying capital on evidence you have already
admitted is stale is the specific mistake worth engineering against.

An observation that cannot be dated is treated as unusable, not as current.

---

## 4. Source hierarchy

Default order, per `DEFAULT_SOURCE_ORDER`:

1. official exchange, regulator, issuer or fund source
2. licensed or high-quality provider
3. official source, republished
4. reputable delayed or end-of-day provider
5. independently verified secondary source
6. manual evidence entry
7. unavailable

Freshness and authority are independent axes. A real-time quote from an
unaccountable aggregator is worse evidence than yesterday's settlement from the
exchange that struck it, so the hierarchy ranks on authority and lets the
freshness rules handle age.

**Two asset classes deviate, and say why.** For `fx_pair` and
`government_bond_yield`, `official_primary` outranks `licensed_market_data`: for a
central bank's own reference rate or a treasury's own cost of debt, the issuing
institution *is* the origin, and a vendor restating it adds latency without adding
authority.

Fallback means trying another **source**, never another **number**. The resolver
will not return an observation for a different instrument, basis, or date than the
one asked for.

---

## 5. Coverage — claimed only where an adapter exists

| Asset class | Coverage | Path |
|---|---|---|
| FX pairs | **Free** | ECB euro reference rates |
| Government bond yields | **Free** | U.S. Treasury Fiscal Data |
| US-listed equity | Optional paid | EDGAR fundamentals free; price needs a feed |
| US-listed ETF | Optional paid | Sponsor NAV pages would be a free path; not yet built |
| Global equity | Optional paid | Varies by exchange |
| Gold spot | Optional paid | LBMA restricts redistribution; else manual |
| Gold futures | Optional paid | Exchange settlement; kept separate from spot |
| UAE-listed equity | **Manual only** | No public structured endpoint; no scraping |
| Nepal-listed equity | **Manual only** | No documented public API with stated reuse terms |
| Market index | **Not supported** | Index levels are licensed per index |
| Crypto | **Not supported** | No adapter; Constitution question upstream |

Honest coverage matters more than impressive coverage. An asset class with no
adapter is reported `unsupported`, not degraded into a guess.

FX coverage is the ECB reference set (roughly thirty currencies against the euro).
**AED and NPR are not in it.** Neither is claimed, and neither is approximated.

---

## 6. Providers implemented

| Provider | Source class | Class | Credentials | Cost |
|---|---|---|---|---|
| `sec-edgar` | official primary | filings | User-Agent only | Free |
| `ecb-fx` | official primary | `latest_official` | None | Free |
| `us-treasury-fiscal-data` | official primary | `latest_official` | None | Free |
| `licensed-market-data` | licensed | `delayed`/`real_time` | Yes | Paid, **optional** |
| `licensed-metals` | licensed | `delayed`/`real_time` | Yes | Paid, **optional** |
| `manual-evidence` | manual | `manual` | None | Free |

The free providers are **always constructed**, including when egress is blocked.
They then carry `unavailableReason`. A provider that vanished when the network was
down could not explain that the outage is not a licensing problem.

`us-treasury-fiscal-data` serves the **average interest rate on outstanding
marketable Treasury securities**, published monthly. It is *not* the daily par
yield curve, and the adapter does not describe it as one.

---

## 7. Manual evidence

The last rung of every hierarchy, and never removed from any of them — for UAE and
Nepal equities it is currently the only rung.

Every manual entry carries provenance, an observation timestamp distinct from when
it was typed, a source document or URL, a verification state, and an **expiry**. It
is stamped `manual` / `manual_operator_entry` all the way through to display, and
is never silently promoted to a retrieved observation. An operator who did not check
their source against the primary one gets `unvalidated`, and that is displayed
rather than corrected.

---

## 8. Recommendation rules

A Buy, Hold, Reduce or Sell is never issued from price alone. The evidence bundle
carries, where relevant: current or latest verified price, latest official filing,
material issuer events, macro evidence, valuation or expected-return analysis, an
independent cross-check, portfolio fit, freshness, confidence, and disconfirming
evidence.

Strong Buy still requires demonstrable undervaluation, a substantial margin of
safety, durable economics or asset support, acceptable downside, portfolio fit,
and **verified current evidence** — where "current" now means fresh for the
horizon, which `aging` and worse are not. Free data becoming available does not
create Strong Buy recommendations; it only removes a reason for silence.

---

## 9. Gold

`src/server/providers/gold/bundle.ts`. Spot and futures occupy **different
fields**, not one field with a label, so no code path can put a settlement where a
spot price is expected. A basis that is not spot is refused from the spot field
even when passed as spot.

The daily change is computed only between two quotes of the same basis and
currency — otherwise the basis difference is reported to the user as a price move.

When no exact spot source is reachable, a proxy may be used, but only in
`spotProxy`, only with a stated limitation, and never in `spot`. A posture change
in gold requires spot, a prior close, and macro context. A price with none of the
latter is not a reason.

A news article is not a source. It may enter as cited macro evidence; it may never
be where the gold price came from.
