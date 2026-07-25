# NeoOS CIO — product definition

Written 2026-07-25, after four sprints of infrastructure revealed that the
product question had never been stated precisely enough to build against.

This document governs. Where it disagrees with a completion report, this wins.

---

## 1. The question the product answers

> **Where is the best place to allocate my money to advance generational wealth
> creation and preservation?**

Not "is this stock cheap". Not "is the market risky today". Not "is this data
trustworthy" — that is a control, not the product.

### What each part of that sentence demands

**"Where is the best place"** — a comparison across the whole opportunity set,
including doing nothing. The answer is a destination for capital, not a score.

**"my money"** — the subject's actual position. Reserves, investable cash,
holdings, obligations, currency exposure, constraints. Without it the system is
producing general commentary, and must say so.

**"generational"** — decades, not quarters. After inflation, after tax, across
regime changes, and transferable to the next holder. A nominal return figure at
this horizon is close to meaningless.

**"creation AND preservation"** — two objectives in tension. They cannot be
collapsed into one ranked list without hiding the tension.

---

## 2. The two answers, every day

The briefing carries two conclusions, always, and never merges them:

| | Question | Failure if omitted |
|---|---|---|
| **Best marginal allocation** | Where should the next unit of capital go? | The user has no action |
| **Largest unaddressed risk** | What most threatens the capital already held? | The user compounds an exposure they cannot see |

A single ranked list expresses the first and hides the second. Most systems
built for this problem only answer the first, which is why they help people get
rich and not stay rich.

Either answer may be **"do nothing"**, and that is a real answer:
holding cash, waiting for evidence, declining an opportunity, and reducing an
exposure are all productive.

---

## 3. Allocation dominates selection

Over a generational horizon, the split between broad categories swamps the
choice of instrument within a category. NeoOS must therefore reason primarily
about **categories of capital**, and only secondarily about specific holdings.

The real answer space is roughly:

- cash and near-cash
- broad public equity
- individual quality equities
- hard assets (gold, commodities)
- real estate
- private and operating businesses
- fixed income

**The six-asset registry is a test fixture, not an answer space.** It exists to
prove identity resolution and the evidence pipeline. It must not be mistaken for
the universe the product reasons over.

An asset class the user cannot access, or that NeoOS has no evidence for, is
reported as **unsupported** with the reason. It is never silently omitted, and
its absence must not make the remaining options look more attractive than they
are.

---

## 4. What "preservation" measures

Nominal return is not the measure. These are:

| Measure | Why |
|---|---|
| Purchasing power after inflation | The only return that compounds into a generation |
| Currency concentration | A single-currency position is a bet, whether or not it feels like one |
| Jurisdiction concentration | Political and legal risk to holdings and transfer |
| Drawdown survivability | Whether the position survives without forced selling |
| Liquidity under stress | Whether reserves hold when they are most needed |
| Counterparty and custody | Who can fail between the user and the asset |
| Transferability | Whether it passes to the next holder intact |

The subject is UAE-based. Currency and jurisdiction concentration are therefore
live questions, not footnotes, and a USD-denominated view is itself a position
rather than a neutral default.

---

## 5. Personalisation is the product, not a feature

Without the subject's position, every number is general commentary.

**Intake is a first-class product surface**, not a settings page. It captures
reserves, investable capital, obligations, holdings, horizon, constraints, and
objectives. It is built to be used by a client, because it will be.

Rules:

- Never invent a personal figure. Missing means missing.
- With no intake, Morpheus gives a **general** view and says plainly that it
  cannot advise on capital it does not know about.
- Missing inputs are named, with what each one would unlock.
- Confidence reflects how much of the answer rests on the subject's real
  position versus a model default.

**A general market view must never be presented as personal advice.**

---

## 6. Subject scoping

Today there is one subject: the operator. The product is intended to serve
clients later.

Therefore: **every record is subject-scoped from the start.** Reports, evidence,
decisions, journal entries, outcomes and intake all carry a subject id, and
there is exactly one subject for now.

Accounts, authentication and isolation are deliberately **not** built yet. But
building single-subject and retrofitting later is the rewrite this decision
exists to avoid.

---

## 7. Interface hierarchy

The primary screen leads with the decision, not the evidence.

1. Morpheus briefing — the two answers
2. Capital implication in the subject's own terms
3. What would change the view
4. Decision actions
5. Supporting evidence
6. Factor scores
7. Raw evidence and audit trace

**The 30-second test:** a user opening NeoOS understands the main conclusion and
the recommended action within thirty seconds, without scrolling into detail.

The current home screen fails this — it opens with a gauge and six score cards,
and reaches Morpheus fourth. The dashboard is the evidence layer. It proves the
briefing; it is not the briefing.

---

## 8. What this does not change

Everything built through Sprint 4 stands. Nothing here weakens:

- the eight-factor engine and its weights
- the Strong Buy gate and its rarity
- the evidence hierarchy, freshness and confidence model
- identity resolution and its refusal to guess
- live-state honesty and the policy ceilings
- append-only persistence, signing, and the audit trail
- the refusal to substitute fixtures for live data

Those are the controls that make the answers trustworthy. The correction is that
they were built *before* the thing they were meant to make trustworthy.

---

## 9. How to tell whether the product is working

Not "do the tests pass". These:

1. Can the subject open NeoOS and know what to do with their next unit of
   capital within thirty seconds?
2. Can they see the largest threat to what they already hold?
3. Can they see why, and what would change it?
4. Does the system say plainly when it does not know enough?
5. Would a disciplined CIO recognise the reasoning as their own?
