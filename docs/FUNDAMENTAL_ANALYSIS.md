# Fundamental analysis from filed accounts

How public filings become a valuation. Implemented in
`src/server/valuation/from-filings.ts`.

This module computes no score and makes no recommendation. It produces one
`earningsMultiple` valuation input; the engine does everything after that.

---

## 1. Measures computed

All from figures the company filed, none assumed:

| Measure | From |
|---|---|
| Diluted EPS | Latest annual `EarningsPerShareDiluted` |
| Revenue CAGR | Across every annual period filed |
| Current ratio | Current assets ÷ current liabilities |
| Net debt to equity | (Long-term debt − cash) ÷ stockholders' equity |
| Free cash flow per share | (Operating cash flow − capex) ÷ diluted shares |
| Book value per share | Stockholders' equity ÷ shares outstanding |

Free cash flow and book value are carried as cross-checks on reported earnings
rather than as separate valuation methods. They appear in the assumptions list so
a reader can see whether earnings and cash agree.

---

## 2. The multiple problem, and how it is handled

Any multiple-based valuation rests on an assumption, and an assumption chosen to
justify a conclusion is worthless. Two controls:

### Anchored to a required yield, not to comparables

| Case | Required earnings yield | Multiple |
|---|---|---|
| Conservative | 9.0% | 11.1× |
| Base | 7.0% | 14.3× |
| Optimistic | 5.5% | 18.2× |

A comparables-based multiple imports the market's current mood into a valuation
that is supposed to be independent of it. Its predictable failure is that
everything looks fairly priced at every point in the cycle — including the top,
because the comparables are at the top too.

Anchoring to a return requirement instead means the valuation answers "what would
I pay to earn 9% on this company's actual earnings", which is a question the
market's enthusiasm cannot change.

### Bounded, deterministic adjustments

| Adjustment | Range | Driven by |
|---|---|---|
| Growth | ±25% of the multiple | Revenue CAGR, clamped to −10%…+15% |
| Balance sheet | ±10% of the multiple | Current ratio and net debt to equity |

Growth is clamped **before** it is applied, so an extraordinary year cannot
project itself indefinitely. A missing measure contributes **zero** — the neutral
answer, not a guess in either direction.

The same accounts always produce the same valuation. Nothing is discretionary.

---

## 3. When it refuses

| Situation | Response |
|---|---|
| No diluted EPS filed | `null`, with the reason. Assuming an earnings figure would be fabrication |
| Negative earnings | `null`. An earnings multiple against a loss is meaningless, and NeoOS does not switch method to reach a number |
| Fewer than two revenue periods | Valuation proceeds; growth adjustment is zero and the assumption list says so |
| Revenue base of zero or less | No growth rate. A change from a non-positive base is not a rate |
| No share count | Book value and free cash flow per share are omitted rather than divided by zero |

A `null` routes the asset into the engine's existing insufficient-evidence gate —
a gate that already exists, is already tested, and already produces the right
user-facing outcome. Inventing a parallel judgement here would be a second thing
to keep correct.

---

## 4. Confidence

Confidence answers exactly one question: **how much of this analysis is measured
rather than defaulted?**

It is not a judgement about the company. A well-run business with a sparse filing
history scores low confidence; a mediocre one that files completely scores high.
That is the intended meaning, and conflating it with quality would double-count
the fundamentals in the engine's scoring.

| Component | Points |
|---|---|
| Base | 40 |
| Diluted EPS present | +15 |
| Share count present | +10 |
| Growth series measurable | +10 |
| Current ratio measurable | +8 |
| Leverage measurable | +8 |
| Free cash flow measurable | +5 |
| Book value measurable | +4 |

---

## 5. Assumptions and invalidation

Every valuation carries a full assumptions list, including the assumptions it
**declined** to make ("Revenue growth not measurable from 1 filed period; no
growth adjustment applied"). A reader can see what the analysis rests on and
where it is thin.

Invalidation conditions are stated up front:

- A restatement of the latest annual accounts.
- A quarter of negative earnings, which invalidates the method entirely.
- Net debt to equity rising above the heavy-leverage threshold.
- A filing gap beyond the official-filing freshness horizon.

Naming what would change the conclusion, before the conclusion is acted on, is
what separates analysis from advocacy.

---

## 6. What this does not do

- **No DCF.** A discounted cash flow needs a terminal growth rate and a discount
  rate, both of which are opinions with enough leverage to produce any answer.
  Where it is used here at all, it would be an elaborate way to dress an
  assumption as arithmetic.
- **No segment analysis.** Segment tagging is inconsistent across filers.
- **No forward estimates.** Filings are backward-looking by nature. NeoOS values
  what a company has earned, not what someone expects it to earn.
- **No ETF or commodity valuation.** Those need methods filings cannot supply.
  The engine's other valuation methods handle them where evidence exists.


---

## 7. Derived factor scores

Filings give magnitudes — dollars, share counts. The engine's factors want a
0–100 score. Something has to turn one into the other, and until it does,
audited accounts can produce a **valuation** but cannot produce a **rating**:
the critical-factor gate requires `financialStrength` coverage, and no currency
figure supplies it.

`src/server/valuation/derived-factors.ts` closes that gap.

| Factor | Derived from | Scaled between |
|---|---|---|
| `financialStrength` | Current ratio; net debt to equity | ratio 0.5–2.0; leverage 1.5–0 (net cash) |
| `businessQuality` | Net margin; return on equity | 0–25%; 0–30% |
| `growth` | Revenue CAGR | −10% to +15% |

Each component is measured, each is clamped at both ends, and a factor with
several components is their mean. **A missing input produces no record at all**,
never a neutral 50 — a fabricated midpoint is indistinguishable from a measured
one once it is in the system.

### These are derived, and they say so

Every derived record:

- states its arithmetic in its own title (`financialStrength score 71.4 derived
  from current ratio 0.86 and net debt to equity 0.93`),
- cites the filing it was computed from,
- carries the ids of the filed records behind it in `computedFrom`,
- carries `derived: true` so nothing can mistake it for a filed figure,
- expires when the accounts it came from expire.

**Confidence is 80, below the tier-1 default of 92.** The arithmetic is on
audited numbers, which is stronger than an opinion; the thresholds that turn a
ratio into a score are ours, not the filer's, and the confidence should say so.

### Where the judgement lives

The thresholds are the only judgement in the module. They are named constants
with their reasoning attached, applied identically to every asset, and bounded
so no input can produce a score outside 0–100. Changing one changes every
asset's score in the same direction, which is what makes them auditable.

Derived records enter the pipeline as ordinary provider evidence and travel the
same road — identity resolution, normalization, validation, conflict detection.
A score injected downstream would bypass all of it.
