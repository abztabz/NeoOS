# Completion report — demo isolation and traceable pricing

Date: 2026-07-28
Branch: `claude/adding-more-files-y6s0vh`

## What this addressed

The dashboard showed Apple and an S&P 500 tracker under `PORTFOLIO` for a
household that owns neither, distinguished from its real holdings by a badge in
the corner. It also showed prices with no source, no timestamp, and no way to
tell an owner's estimate from a struck market quote.

## 1. Demo can no longer be confused with real holdings

`PortfolioMode`, `USER_PORTFOLIO_ID` / `DEMO_PORTFOLIO_ID` and
`resolveActivePortfolio` in `src/domain/portfolio/portfolio.ts`.

A declared position makes itself active with no prompt, and the demo becomes
unreachable — `exploringDemo` is ignored once a real portfolio exists, so there
is no route back. `ReportGate` wraps every surface derived from the analysed
report; declared holdings render **outside** it so user data survives when no
report exists. `positionsFor` filters by `portfolioId` before any total.

`/` now renders a first-run choice rather than a fixture briefing. Reset-to-demo
and the fixture day runs are withdrawn once a position exists. The DEMO badge
becomes "Not analysed".

See `PORTFOLIO_ISOLATION.md`.

## 2. Displayed prices are traceable or absent

`src/server/pricing/`. `MarketQuote` requires source, timestamps and freshness.
`validateQuote` rejects zero, negative, unsourced, undated and future-dated
quotes. `canUsePriceForDecision` is the single gate every Buy, ranking and
distance passes through; `stale` and `manual` both fail it. Freshness is
recomputed from the clock on read, and a cached quote keeps its original
`quoteTimestamp`.

Identity is resolved before any price is requested — a bare ticker is
`ambiguous`, not a symbol. Production permits no mock, fixture, seeded or
fallback-constant pricing, enforced at service construction.

Report-derived prices are shown only where a verified `marketData` evidence
record can attribute them (`src/domain/watchlist/from-report.ts`).
`valuation.marketPrice` on its own is refused — that was the source of the
unattributed prices.

See `PRICING_ARCHITECTURE.md`.

## 3. Watchlist is the canonical Top Opportunities section

"Buy below" is retired. **Good Buy Price** names what it is: Fair Value less the
margin of safety this asset requires. Current Price, Fair Value and Good Buy
Price are three separate fields on the card and in the model. Fair Value comes
from the engine's valuation trace or not at all.

A missing price suspends the decision. A stale valuation suspends the ranking
while still showing the verified price. Strong Buy is omitted entirely — not
zeroed, not "n/a" — when any of the ten governance gates fails. Every card
carries a plain-language interpretation and an evidence disclosure naming the
real source, quote status, verification time, valuation method and assumptions.

## 4. Gold is UAE 24K/22K in AED per gram

Converted through `GRAMS_PER_TROY_OUNCE = 31.1034768` exactly; 22K derived by
exact purity. XAU/USD is retained as the underlying reference in the evidence
line, not as the headline. The USD/AED peg is labelled a documented policy rate
and never presented as an observed quote. Every reference states that making
charges, premiums, taxes and dealer spreads are excluded.

## 5. Property and unitemized holdings are honestly labelled

The valuation method travels with every declared figure. Property is a manual
estimate with no path to `market_price` — no market prices a specific house, and
that ceiling is permanent. A lump sum called "stocks" reads *manual reported
value · holdings not itemized · live pricing unavailable — add the individual
holdings to enable pricing*. A quantity is not an identification.

`ownershipPercent` was added to the schema and applied to net worth, liquid net
worth, allocation and debt-to-assets.

`PortfolioReadiness` ("Complete your portfolio pricing") names the holdings still
blocking a priced view and what each one needs, largest first.

## Live pricing status

**Production pricing architecture is implemented, but live pricing remains
inactive until approved provider credentials are configured.**

The free official adapters (ECB FX, US Treasury yields) need no credentials and
are always constructed. Equity and gold-spot prices require a configured
provider; none is configured in this deployment, so those surfaces state their
unavailability rather than showing a number.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | 896 passed, 24 skipped, 50 files |
| `npx playwright test` | 354 passed, 0 failed (desktop, iphone-390, iphone-430) |
| `npm run build` | succeeds (run by the Playwright web server) |

Three tests were rewritten rather than made to pass as written, both changes
argued in "Deliberate deviations" below: the two pre-hydration cockpit
assertions, and the `/capital` route added to the overflow loops (it was the one
route those loops missed, and it is where the densest cards are).

## Constraints observed

- No credential appears in browser code, public environment variables, logs,
  error messages, page source, or client responses. `/api/gold/uae` returns
  provider ids and outcomes, never endpoints or keys.
- No rendered webpage is scraped.
- Only providers permitted by the existing NeoOS source policy are used.
- No missing production value is filled with demo, fixture, placeholder or
  fabricated data.

## Deliberate deviations

Two, both stated rather than quietly absorbed.

**There was no gold setup modal to replace.** No such component exists in this
repository. The readiness flow the directive describes as its replacement was
built (`PortfolioReadiness`, on `/portfolio`).

**The pre-hydration cockpit guarantee is narrowed.** The build directive asks for
server-rendered cockpit content before hydration. Whether the worked example is
open is a client decision, so the server cannot know it, and rendering the
fixture cockpit by default is what put Apple in front of somebody who owns none.
The rule underneath survives — never a blank shell — and the server still paints
the header, navigation, and either the choice or the no-analysis card. The
guarantee lost was narrower than it looked: a real subject's position is fetched
client-side behind the operator token and was never in the server HTML.
`e2e/rendering.spec.ts` now runs with JavaScript disabled and asserts that no
fixture instrument name appears in the default HTML.

## Still outstanding

- The corrected position file (`neoos-position-corrected.json`, salary
  jurisdiction NP→AE) has not been submitted.
- `DATABASE_CA_CERT` and `REPORT_SIGNING_PRIVATE_KEY` remain unset (both
  optional).
- No equity or gold-spot price provider is configured, so no live price is
  displayed anywhere today.
