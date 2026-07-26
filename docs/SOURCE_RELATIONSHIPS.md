# Source relationships and contradiction map

How the proposed sources relate. **No relationship below is publishable** — every
one lacks the citation that `isPublishable()` requires, because nothing has been
verified. This is the map to be checked, not the map to be used.

Model: `src/domain/knowledge/relationships.ts`.

---

## 0. Why this replaced the disagreement table

The first version had a two-column table: "one side" and "the other". It
produced debates that do not exist and hid the ones that do.

- Buffett and Marks differ in **emphasis**, not conclusion.
- Graham and Dalio address **different analytical levels** and largely do not
  meet.
- Taleb does not argue that historical data is worthless — he argues it is
  misused, which is a different claim and compatible with using it carefully.
- Malkiel challenges **persistent advantage after costs**, which is a claim about
  distributions, not a verdict that any particular decision was luck.

Forcing these into binary opposition misrepresents four of the corpus's most
important voices at once.

---

## 1. Relationship kinds

| Kind | Meaning | Both sides must be shown |
|---|---|---|
| `agreement` | Same conclusion, compatible reasoning | No |
| `partial_agreement` | Agree on substance, differ on emphasis or degree | No |
| `different_scope` | Address different questions and do not meet | No |
| `methodological_tension` | Same question, incompatible methods | **Yes** |
| `direct_contradiction` | Incompatible claims, same question, same scope | **Yes** |
| `unresolved_controversy` | Genuinely open in the literature | **Yes** |

Only the last three oblige NeoOS to present both. Presenting `different_scope`
sources as opposed manufactures a conflict.

---

## 2. The map

Every row needs `citations` before use. All are currently empty.

### Whether selection produces persistent advantage

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K3.1 Buffett | K4.1 Malkiel | `methodological_tension` | Listed equities, long horizon, after costs and taxes | Whether documented outperformance reflects skill, risk exposure, or selection of the sample. Genuinely open |
| K3.3 Graham | K4.1 Malkiel | `methodological_tension` | Security selection under disclosure regimes | Graham's screens address a market with different frictions; comparability across eras is unclear |
| K5.6 Expectations Investing | K4.1 Malkiel | `partial_agreement` | Price-implied expectations | Both accept prices carry information; they differ on whether the residual is exploitable |

### Cycle awareness

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K3.1 Buffett | K3.2 Marks | `partial_agreement` | Whether cycle position should influence deployment | Emphasis differs; both reject forecasting. Not a contradiction |
| K3.2 Marks | K3.4 Dalio | `partial_agreement` | Credit and debt cycles | Similar direction, very different method and time scale |

### Analytical level

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K3.3 Graham | K3.4 Dalio | `different_scope` | Security analysis vs macro debt cycles | They do not meet. Treating them as opposed is a category error |
| K5.1 Damodaran | K3.4 Dalio | `different_scope` | Asset-level valuation vs regime analysis | — |

### Valuation method

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K5.1 Damodaran | K5.3 Penman | `methodological_tension` | How to derive intrinsic value | Cash-flow-forecast-based vs accounting-based. Both defensible; they disagree on which anchors better |
| K5.2 McKinsey | K5.1 Damodaran | `partial_agreement` | ROIC-driven value creation | Broad agreement; McKinsey is more prescriptive about corporate practice |

### Long-horizon equity risk

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K1.5 Anarkulova et al. | K2.1 Dimson et al. | `methodological_tension` | Whether a long horizon reduces equity risk | Sample construction and bootstrap method. **The most consequential open question in the corpus for a generational objective** |
| K1.5 Anarkulova et al. | K3.1 Buffett | `direct_contradiction` | Whether equities are reliably safe over long holding periods | If confirmed, the empirical finding contradicts the practitioner position at the same scope |
| K1.1 Jordà et al. | K1.5 Anarkulova et al. | `partial_agreement` | Long-run asset returns | Same broad territory, different treatment of failed markets |

### Historical data and tail risk

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K4.3 Taleb | K2.1 Dimson et al. | `methodological_tension` | Whether historical series support inference about tails | **Not a contradiction.** Taleb argues short samples understate tails; Dimson et al. extend the sample, which is a response rather than a rebuttal |
| K4.3 Taleb | K1.7 Kelly | `partial_agreement` | Ruin avoidance | Both prioritise survival; they differ on whether the distribution can be known well enough to optimise against |

### Monetary independence

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K1.3 Rey | K2.3 Obstfeld & Taylor | `unresolved_controversy` | Whether a floating rate buys monetary independence under open capital accounts | Trilemma vs dilemma. Live in the literature. **NeoOS presents both and concludes neither** |
| K1.4 Ilzetzki et al. | K2.2 Eichengreen | `different_scope` | Exchange-rate arrangements | Classification method vs historical episode |

### Behavioural reliability

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| K4.2 Kahneman | K4.2 (own replication caveat) | `unresolved_controversy` | Which effects in the book replicate | The book's priming chapter is the contested part; loss aversion and anchoring are on firmer ground ⚠ |
| K4.2 Kahneman | K1.2 French & Poterba | `agreement` | Home bias as a behavioural phenomenon | Compatible; one is experimental, the other observational |

### Governance

| A | B | Kind | Scope | Unresolved |
|---|---|---|---|---|
| Extended: Bebchuk et al. | K3.1 Buffett | `different_scope` | Governance provisions vs owner-operator judgement | Statistical association across a sample vs individual assessment |

---

## 3. What the disconfirmation requirement uses

When a briefing leans on a source, `counterpartsFor()` returns the relationships
of kind `methodological_tension`, `direct_contradiction` or
`unresolved_controversy` involving it. Those must be shown alongside.

Worked example, once verified: a briefing citing **K3.1** on concentrated
long-term holding must also present **K1.5** — the empirical case that long
horizons do not reliably rescue equity risk — because that pairing is a
`direct_contradiction` at the same scope.

A briefing citing **K3.1** need not present **K3.2**, because they only partially
disagree and about emphasis.

---

## 4. Ambiguities in the map itself

Recorded because a relationship map asserted with false confidence is the same
failure as a source description asserted from recall.

1. **K1.5's status is unverified.** If the paper is not as recalled, the
   `direct_contradiction` row collapses and the corpus loses its strongest
   internal challenge to long-horizon equity confidence.
2. **Taleb's position is frequently overstated by others**, including by an
   earlier version of this repository. The characterisation above should be
   checked against the text rather than against summaries.
3. **Kahneman's replication caveat** is recorded from recall of the author's own
   public acknowledgement ⚠. The specific chapter and the specific effects must
   be verified before the caveat is quoted.
4. **The trilemma/dilemma controversy** may have moved since the works were
   published. Whether it is still open is itself a research question.
