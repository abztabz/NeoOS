# Price policy

Prices are the one input NeoOS can never derive, infer, interpolate, or carry
forward.

> The display-side companion to this document is
> [PRICING_ARCHITECTURE.md](PRICING_ARCHITECTURE.md), which covers the quote
> model, the single decision gate, instrument identity, environment safety, the
> UAE gold board, and how property and unitemized holdings are labelled.
> Demo/real separation is in [PORTFOLIO_ISOLATION.md](PORTFOLIO_ISOLATION.md).

---

## 1. Missing means missing

There is no code path in the price module that produces a number the provider did
not send. No last-known price, no cached value, no fixture substitution, no
interpolation between quotes.

A stale price presented as current is the single most expensive lie this system
could tell: it feeds directly into margin of safety, which is what the Buy and
Strong Buy thresholds turn on. A price six hours old at a moment of volatility
can turn a Hold into a Strong Buy with no visible symptom.

Without credentials the licensed adapter reports `disabled`, makes no request, and
returns nothing. Instruments only it would have covered then cap at `partial_live` —
see [LIVE_DATA_STATES.md](LIVE_DATA_STATES.md). Instruments an official free source
covers are unaffected.

---

## 2. Why the licensed adapter ships unconfigured

**This is not a statement that NeoOS needs a paid API.** It does not, and the
correction is important enough to state plainly:

> The current execution environment cannot directly retrieve external market
> observations. NeoOS requires a network-enabled production data adapter. Many
> official, delayed and end-of-day sources are available without paid exchange
> licensing; true exchange-grade real-time or streaming data may require a
> licensed provider.

What commercial vendors sell is **venue latency** — a real-time or deliberately
delayed quote struck on an exchange — and the terms of any such licence,
particularly whether quotes may be described as real-time and whether they may be
redistributed, are the operator's to accept, not the build's. Shipping with a
default vendor would mean shipping an implied agreement to somebody's terms on the
operator's behalf.

What is *not* licensed: FX reference rates from the ECB, government debt series
from the U.S. Treasury, and issuer fundamentals from SEC EDGAR. All three are
published by the institution that creates the fact, free, with documented reuse
terms, and all three are wired. See
[MARKET_DATA_ARCHITECTURE.md](MARKET_DATA_ARCHITECTURE.md).

A licensed feed is an upgrade to latency and instrument coverage. It is not the
door to having a price at all, and `readiness()` reflects that: it appears under
`optionalUpgrades`, never under `missing`.

---

## 3. Vendor neutrality

Price vendors differ in field names and little else, so the response mapping is
configuration (`PriceFieldMapping`, dotted paths) rather than a class per vendor.
Swapping vendors is an environment change.

```
MARKET_DATA_BASE_URL=https://vendor.example/v1
MARKET_DATA_API_KEY=...
MARKET_DATA_TIMELINESS=delayed
```

The key travels in an `Authorization` header, never a query string.

---

## 4. Timeliness is stated, never inferred

`MARKET_DATA_TIMELINESS` records what the operator's licence actually grants:
`real_time`, `delayed`, or `end_of_day`. Unset stays `unknown`, which maps to
`delayed` — the conservative reading. Understating latency costs a slightly tighter
freshness window; overstating it makes a false real-time claim on somebody else's
data.

**"Live" is not a status.** Six observation classes replace it, and every price
carries exactly one: `real_time`, `delayed`, `end_of_day`, `latest_official`,
`manual`, `unavailable`. Only the first may ever be described as real-time, and
only when the operator has said the licence grants it. See
[MARKET_DATA_ARCHITECTURE.md](MARKET_DATA_ARCHITECTURE.md) §2.

**There is no path that infers real-time** — not from response latency, not from
market hours, not from anything else. Claiming real-time without the licence to do
so misrepresents both the data and the agreement it came under.

Market status is read only if the provider states it. Anything unrecognised is
`unknown`, not `closed`.

---

## 5. What a quote must carry

A quote is refused, with the reason, if it lacks any of:

| Missing | Why it is fatal |
|---|---|
| A usable price | Zero, negative, NaN, or non-numeric means the feed is malfunctioning |
| A currency | A price without a currency cannot be compared to a valuation |
| A provider-stated quote time | Retrieval time is not a substitute — it makes a stale quote look current |

Freshness is measured from the quote time, not the fetch time.

---

## 6. Implausible moves

A quote is refused when it moves more than **60%** from the previous close in one
step.

The bound is deliberately loose. Real markets gap, and the goal is catching
corruption — a decimal shift, a currency mix-up, a symbol collision — not
second-guessing volatility. A tenfold jump is a feed error; a 30% gap is a
Tuesday.

The quote is **refused, not smoothed**. Correcting a suspect value would mean
deriving a margin of safety from a number NeoOS invented.

---

## 7. Symbols

Mapped explicitly per asset, with the price unit stated: `share` for equities and
funds, `troy_ounce` for gold.

An unmapped asset is reported `unsupported_symbol` with the reason —
"Rather than guess one" — rather than having a plausible ticker guessed for it. A
ticker collision across venues is a well-known way to price the wrong instrument
with complete confidence.
