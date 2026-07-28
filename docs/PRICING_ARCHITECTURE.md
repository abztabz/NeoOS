# Pricing architecture

**Every price shown is either traceable to a named source with a timestamp, or
it is not shown.**

## The three kinds of number

A dashboard renders these identically unless something forces them apart, so the
method travels with the value everywhere (`src/domain/valuation/valuation-record.ts`).

| Method | What it means | May be called "live"? |
|---|---|---|
| `market_price` | Struck on a venue for this instrument, retrieved from a named source, validated | **Yes** — the only one |
| `reference_price` | A benchmark for the underlying, not a quote for this holding | No |
| `manual_estimate` | Somebody's judgement, with a date and a source | No |
| `appraisal` | A professional valuation, with appraiser and date | No |
| `cost_basis` | What was paid — a fact about the past | No |
| `unpriced` | Not enough is known to value it at all | No |

`mayDescribeAsLive()` is a function rather than a convention so a test can hold
it. Gold per gram is a *reference*: it prices the metal, not the bar in the safe,
and not what a dealer would pay for it.

## The quote

`src/server/pricing/quote.ts`. A `MarketQuote` requires `sourceId`,
`sourceName`, `quoteTimestamp` and `retrievedAt`. `validateQuote` rejects:

- zero or negative prices — a broken feed is more dangerous than no feed,
  because it produces a plausible margin of safety from a fiction;
- a missing timestamp — an unageable quote cannot be shown as current without
  lying;
- a missing source — an unattributable price cannot be checked;
- a quote struck after it was retrieved — a clock or mapping error that would
  otherwise never age.

## The decision gate

`canUsePriceForDecision(quote)` is the **single** gate. Every Buy, Strong Buy,
distance calculation and ranking passes through it, so there is one place to
read and one place to change.

`stale`, `manual` and `unavailable` all fail. Manual fails not because the
figure is wrong but because it is unverified: somebody typed it, and a Buy
issued on a number the system cannot check is a Buy issued on nothing.

Freshness is recomputed **on read** from the clock, never trusted from the
provider's stamp. A quote cached at 09:00 is not still `live` at 16:00. Cached
entries keep their original `quoteTimestamp`; only `freshness` is recomputed,
and it can only get worse.

## Identity before price

`src/server/pricing/instrument.ts`. A bare ticker resolves to `ambiguous`, not to
a symbol. `AAPL` is unambiguous on Nasdaq and means other things elsewhere; a
quote for an ambiguous symbol is a confident number about possibly the wrong
asset. `mayRequestPrice` gates the provider call on identity, not the reverse.

## Environment safety

`src/server/pricing/environment.ts`. Production permits **no** mock, fixture,
seeded or fallback-constant pricing. Not "discourages" — permits none, and
`assertPricingStartup` turns that into a refusal to construct the service rather
than a preference. The alternative is a deployment that serves invented prices
until somebody notices.

## Provider fallback

`PricingService` walks providers in declared priority order, recording every
consultation in a trail. A source change is **recorded** rather than performed
silently, so the evidence view can never attribute a price to a source that did
not return it. Falling back means trying another *source*, never another
*number*.

## What the deployment may claim

`describeCapability()` returns, when no provider is registered, exactly:

> Production pricing architecture is implemented, but live pricing remains
> inactive until approved provider credentials are configured.

That sentence is the honest state of this deployment today. NeoOS does not claim
live pricing is operational without a connected, credentialed, approved
provider.

## Gold

`src/domain/gold/uae-gold.ts` and `src/server/gold/uae-gold-service.ts`.

AED per gram by karat is the headline, because that is how the person holding
the metal thinks about it. XAU/USD per troy ounce is retained as the underlying
reference and shown in the evidence detail — it is how the number was derived,
not the number.

- Conversion runs through `GRAMS_PER_TROY_OUNCE = 31.1034768` exactly.
- 22K is derived from 24K by exact purity, `22/24`. Valuing 22K at the 24K price
  overstates a holding by about 9% and looks entirely plausible.
- The USD/AED peg (3.6725, UAE Central Bank, in force since 1997) is usable as a
  **documented policy rate** and is labelled as such — never presented as an
  observed live quote. The distinction is invisible on every ordinary day and
  decisive on the one day it is not.
- Every reference carries `GOLD_REFERENCE_EXCLUSIONS`: making charges, premiums,
  taxes and dealer spreads. On jewellery that gap can swamp any market move.

With no gold provider configured the board shows **no number at all** and states
the production wording above.

## Property and unitemized holdings

`src/domain/valuation/holding-valuation.ts`.

- **Property** defaults to `manual_estimate` and can be upgraded to `appraisal`.
  There is no path to `market_price`, because no market prices a specific house.
  That ceiling is permanent and is not a gap waiting to be closed.
- **A lump sum called "stocks"** is `manual_estimate` with `needsItemization`.
  The display reads: *manual reported value · holdings not itemized · live
  pricing unavailable — add the individual holdings to enable pricing.* The
  limit and the remedy in one line, because a limitation without a remedy reads
  as a defect.
- A **quantity is not an identification**. "500 shares" names no security.
  Itemization requires an `identifier` or a `registryAssetId`.

## Ownership share

`ownershipPercent` is optional and defaults to whole ownership, because whole
ownership is the ordinary case. Where declared it is applied to net worth,
liquid net worth, allocation and debt-to-assets: a family house held jointly is
not wholly the subject's, and counting it in full is the largest single
overstatement available to this household.
