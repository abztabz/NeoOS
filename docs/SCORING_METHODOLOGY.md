# Scoring methodology

Engine version **2.0.0**. Every threshold named here lives in
`src/engine/constants.ts`; there are no magic numbers in calculation code.
Changing any value is a methodology change and must bump `ENGINE_VERSION`,
because scores are not comparable across engine versions.

## 1. Factor weights

Permanent weights, summing to exactly 1 (enforced by test):

| Factor | Weight | Why it carries this much |
|---|---|---|
| Valuation | 30% | Price paid is the primary controllable edge |
| Financial strength | 20% | Determines survivability when the thesis is wrong |
| Business quality | 15% | Durability of the economics being bought |
| Growth | 10% | Real but the most frequently over-extrapolated input |
| Macro | 10% | Context, not a timing signal |
| Technical | 5% | Entry discipline only |
| Portfolio fit | 5% | A good asset in the wrong slot is a bad decision |
| Governance | 5% | Small weight, but carries a hard veto (below) |

**Critical factors** are valuation and financial strength. Missing evidence for
either produces Insufficient Evidence rather than a lower score — a number
would imply knowledge the engine does not have.

## 2. Raw factor scores

A factor's raw score is the tier- and confidence-weighted mean of its evidence
records' normalized values:

```
weight(record) = (1 + (6 − sourceTier) × 0.4) × effectiveConfidence / 100
raw            = Σ(weight × normalizedValue) ⁄ Σ(weight)
```

A tier-1 official filing therefore counts roughly three times a tier-6
sentiment record on the same claim.

Valuation is the exception: its raw score is derived from the valuation model,
never asserted directly. See §5.

## 3. Adjustments

Each factor's adjusted score is `raw − freshness − coverage − conflict`,
floored at 0.

| Adjustment | Maximum | Rule |
|---|---|---|
| Freshness | 12 | `staleShare × 12`, where staleShare is the fraction of inputs past their horizon |
| Coverage | 10 | `(1 − min(1, records ⁄ 3)) × 10` — one record is thin, three is solid |
| Conflict | 12 | 6 per unresolved conflict touching the factor, capped |

Sizing rationale: a fully stale factor loses about one rating band (12 points);
an unresolved conflict costs about half a band.

**Intermediate values are never rounded.** Rounding happens once, at display.

## 4. Total score and confidence

```
total = Σ(adjustedScore × weight) ⁄ Σ(weight of factors that have evidence)
```

Renormalizing over factors that actually have evidence stops a missing
non-critical factor from silently dragging the score toward zero; its absence
appears in the coverage penalty and the trace instead.

Confidence propagates as the weight-weighted mean of factor confidences, so a
weak critical factor drags harder than a weak minor one.

## 5. Valuation and margin of safety

Margin of safety is measured against the **conservative** value, not the base
case: paying below the low case is the discipline.

```
marginOfSafety   = (conservativeValue − marketPrice) ⁄ conservativeValue
valuationRawScore = clamp(50 + marginOfSafety × 140, 0, 100)
```

A fair price scores 50. Buy-grade valuation (85) needs a 25% discount;
Strong-Buy-grade (95) needs ≈32.1%.

Cash equivalents have no intrinsic-value case, so their valuation grade is the
real yield on offer: `50 + realYield × 12`. Scoring them as "no margin of safety
measurable" would strip cash of its 30% weight, and cash is a first-class asset.

### Derived price thresholds

```
Buy Below        = conservativeValue × (1 − 35/140) = conservativeValue × 0.750
Strong Buy Below = conservativeValue × (1 − 45/140) = conservativeValue × 0.679
```

These are the prices at which the valuation factor reaches grades 85 and 95.
They are displayed **only** when the full valuation trace exists — see
`docs/EVIDENCE_POLICY.md`.

## 6. Rating bands

| Score | Rating |
|---|---|
| 95–100 | Strong Buy (subject to the gate) |
| 85–94 | Buy |
| 70–84 | Accumulate |
| 55–69 | Hold |
| 40–54 | Reduce |
| 0–39 | Sell / Avoid |

The engine emits `Avoid` for the bottom band. `Sell` is reserved for an explicit
exit instruction on a held position, which a score alone cannot imply.

## 7. Vetoes

Applied after the band mapping, before the Strong Buy gate:

- **Governance veto** — raw governance below 30 caps the rating at Reduce.
- **Conflict veto** — any unresolved high-severity evidence conflict caps the
  rating at Hold.

## 8. Capital deployment

```
raw = 0.40 × opportunityIndex
    + 0.35 × (100 − cashScore)
    + 0.25 × marketScore
    − macroRisk/100 × 15
    + min(8, strongBuyCount × 4)
```

`opportunityIndex = breadth × 60 + meanScoreOfAttractive × 0.4`, where breadth
is the share of rated assets at 70 or better.

Cash score is documented in §9. Hard constraint caps are then applied; each cap
that fires is recorded on the posture and shown in the UI:

| Trigger | Cap | Reason |
|---|---|---|
| Reserve health < 40 | 40 | Reserves before ambition |
| Evidence integrity < 60 | 40 | No aggressive deployment on weak evidence |
| Concentration risk > 70 | 60 | Position-size discipline |
| Liquidity risk > 70 | 60 | Do not deploy capital that may be needed |
| Score > 95 without reserve health ≥ 80 and integrity ≥ 90 | 95 | Maximum Deployment must be exceptionally rare |

Caps are evaluated together and the tightest wins, so a high opportunity score
can never override any of them.

## 9. Cash score

```
realYield = cashYieldPct − inflationPct
cashScore = clamp(30 + realYield × 15 + (100 − opportunityIndex) × 0.3, 0, 100)
```

**A high cash score means cash is attractive to hold relative to the
opportunity set — waiting is being paid for.** It is a statement about markets,
never about the health of the user's cash position. The Cash workspace says
this in plain language.

## 10. Deployment bands

| Score | Band | Max initial tranche |
|---|---|---|
| 0–20 | Preserve Cash | 0% |
| 21–40 | Deploy Gradually | 25% |
| 41–60 | Selective Deployment | 35% |
| 61–80 | Increase Deployment | 50% |
| 81–95 | Aggressive Deployment | 60% |
| 96–100 | Maximum Deployment | 60% |

Band lookup is by upper bound, so a continuous score such as 20.5 lands in
Deploy Gradually rather than falling into a gap between integer-labeled bands.
