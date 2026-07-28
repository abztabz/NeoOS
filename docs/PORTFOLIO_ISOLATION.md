# Portfolio isolation

**Demo data may never be mistaken for real holdings.**

This document records why the boundary exists, where it is enforced, and what
would break it.

## The failure this closes

NeoOS carries two different objects that both look like "a portfolio":

- the **declared position** (`IntakeProfile`) — what the subject says they own;
- the **analysed report** (`NeoosReport`) — what the engine has rated, priced
  and formed a thesis about.

They were never merged. The failure was subtler: the report store defaults to a
fixture report, so every workspace rendered the fixture's holdings — Apple, an
S&P 500 tracker, a developed-market ETF — under headings like `PORTFOLIO` and
`WATCHLIST`, distinguished from real holdings only by a badge in the corner.

A badge is not a boundary. A household that had declared its entire net worth
read "Apple · HOLD · 8% allocation" as a statement about its own money.

**This household does not own Apple, SPY, any developed-market ETF, or any other
security that appears in demo or fixture data.** Its declared position is a
family house in Nepal, a partial interest in a second house, physical gold held
in the UAE and Nepal, and a non-itemized brokerage balance in AED.

## The rule

Implemented in `src/domain/portfolio/portfolio.ts`, held by
`src/domain/portfolio/portfolio.test.ts`.

1. **A real portfolio, once it exists, is the portfolio.** No prompt, no toggle,
   no mode to remember. `resolveActivePortfolio` returns `demoVisible: false`
   whenever a declared position exists, and `exploringDemo` is ignored in that
   branch — there is deliberately no route back.
2. **The demo is opt-in and pre-declaration only.** Before anything is declared,
   `/` renders `FirstRun`: "Create my portfolio" or "Explore the worked example".
   Nothing fixture-derived renders until the second is chosen.
3. **Demo content may not reach a user surface.** `mayRender(active, "demo")` is
   false whenever a user portfolio is active, and `reportForSurface` returns
   `null` rather than the fixture.
4. **The absence is stated, not blank.** `ReportGate` renders `NO_ANALYSIS_YET`,
   which distinguishes "we have not analysed your position" from "you own
   nothing".

## Where it is enforced

| Surface | Mechanism |
|---|---|
| `/` | `MorpheusHome` returns `FirstRun` before a choice is made |
| Six workspaces | `<ReportGate>` wraps everything derived from the report |
| Declared holdings | Rendered **outside** the gate — user data survives when no report exists |
| Data-state badge | `DEMO` becomes `Not analysed` once a user portfolio exists |
| Import dialog | "Reset to demo" is withdrawn once a user portfolio exists |
| Totals | `positionsFor` filters by `portfolioId` before any sum |

`useExploringDemo` is backed by **sessionStorage**, not localStorage: exploring
the demo is something you do once while deciding whether to use NeoOS, not a
setting carried between sessions. Its server snapshot is always `false`, so
fixture holdings never appear in initial HTML.

## What would break it

- Rendering `useReport().report` in a component not under `ReportGate`.
- Adding a control that sets `exploringDemo` while a position exists.
- Merging declared holdings into the analysed holdings table. A declared
  estimate presented inside an analysed table inherits a credibility it has not
  earned.
- Seeding the user portfolio with fixture positions "so the page isn't empty".

The E2E spec `e2e/demo-isolation.spec.ts` asserts that no fixture instrument
name appears anywhere on the first screen. That test is the tripwire.
