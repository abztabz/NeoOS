# Strong Buy policy

**A numeric score is never sufficient for Strong Buy.** A score of 95 or above
makes an asset *eligible* to be considered; it must then pass every check
below. Any single failure downgrades it to the highest permitted rating and
records the reason.

Thresholds live in `STRONG_BUY_GATE` (`src/engine/constants.ts`).

## The gate

| Check | Requirement | Why |
|---|---|---|
| Total score | ≥ 95 | Entry condition, not the decision |
| Evidence integrity | ≥ 85 | Conviction requires verified, current sources |
| Confidence | ≥ 85 | Low confidence and high conviction cannot coexist |
| Margin of safety | ≥ 25% vs the **conservative** value | Substantial discount, not a fair price |
| Financial strength | ≥ 75 | Survivability if the thesis is wrong |
| Governance | ≥ 70 | Unresolved governance concerns disqualify |
| Portfolio fit | ≥ 60 | A good asset in the wrong slot is a bad decision |
| Primary valuation evidence | source tier ≤ 2 | Filings or authoritative market data, not commentary |
| Evidence conflicts | no unresolved high-severity conflict | Contradicted facts cannot support conviction |
| Freshness | no stale critical input | Current evidence, not last quarter's |
| Completeness | no critical factor missing | Cannot conclude from a partial picture |

## Structural rarity

The gate is not the only thing keeping Strong Buy rare. Because valuation
carries 30% of the weight and a fair price scores 50, an asset trading at or
above its conservative value **cannot arithmetically reach 95** even with
perfect scores everywhere else (0.3 × 50 + 0.7 × 100 = 85). Reaching Strong Buy
requires a genuine discount as a matter of arithmetic, before the gate is even
consulted.

## When the gate fails

The rating is lowered to the highest permitted value (Buy, or lower if a veto
also applies), and every failed condition is recorded on the recommendation's
`vetoes` and `eligibilityChecks`. The UI shows each check with its actual value
against the requirement, so a downgrade is always explainable.

## Demo behaviour

The demo report produces **zero** Strong Buys. That is the expected outcome for
an ordinary market and is asserted by test — if a fixture change ever produced a
Strong Buy, that test failing is the intended alarm.
