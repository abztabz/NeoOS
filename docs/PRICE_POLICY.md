# Price policy

Prices are the one input NeoOS can never derive, infer, interpolate, or carry
forward.

---

## 1. Missing means missing

There is no code path in the price module that produces a number the provider did
not send. No last-known price, no cached value, no fixture substitution, no
interpolation between quotes.

A stale price presented as current is the single most expensive lie this system
could tell: it feeds directly into margin of safety, which is what the Buy and
Strong Buy thresholds turn on. A price six hours old at a moment of volatility
can turn a Hold into a Strong Buy with no visible symptom.

Without credentials the adapter reports `disabled`, makes no request, and returns
nothing. Assets then cap at `partial_live` — see
[LIVE_DATA_STATES.md](LIVE_DATA_STATES.md).

---

## 2. Why it ships unconfigured

Every price feed NeoOS could use requires a paid licence, and the licence terms —
particularly whether quotes may be described as real-time, and whether they may be
redistributed — are the operator's to accept, not the build's.

Shipping with a default vendor would mean shipping an implied agreement to
somebody's terms on the operator's behalf.

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
`real_time`, `delayed`, or `end_of_day`. Unset stays `unknown`, which the
staleness model treats conservatively.

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
