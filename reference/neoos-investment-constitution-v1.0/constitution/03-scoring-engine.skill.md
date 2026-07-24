---
name: neoos-scoring-engine
version: 1.0.0
type: skill
priority: mandatory
---
# Scoring Engine
Every asset receives a score from 0 to 100.

| Factor | Weight |
|---|---:|
| Valuation | 30% |
| Financial Strength | 20% |
| Business Quality | 15% |
| Growth Outlook | 10% |
| Macro Environment | 10% |
| Technical Environment | 5% |
| Portfolio Fit | 5% |
| Governance / Execution Risk | 5% |

Technical factors are minor timing inputs and must never override value and fundamentals.

## Ratings
| Score | Rating | Default action |
|---:|---|---|
| 95–100 | Strong Buy | Deploy aggressively subject to limits |
| 85–94 | Buy | Add meaningfully |
| 70–84 | Accumulate | Deploy gradually |
| 55–69 | Hold | Maintain or wait |
| 40–54 | Reduce | Pause buying; trim where appropriate |
| 0–39 | Sell / Avoid | Reallocate capital |

## Strong Buy Meaning
Strong Buy means demonstrable undervaluation relative to conservative intrinsic value with a substantial margin of safety. A price decline, popularity, or analyst upside target is insufficient.

## Score Caps
- No verified current price: maximum 69.
- No current official filing or equivalent: maximum 69.
- No independent validation: maximum 84.
- Unresolved material governance issue: maximum 69.
- Unquantifiable downside: maximum 69.
- Missing portfolio context: no deployment amount.

## Cash Score
| Score | Decision |
|---:|---|
| 90–100 | Hold Cash |
| 70–89 | Deploy Gradually |
| 50–69 | Increase Deployment |
| 30–49 | Deploy Aggressively |
| 0–29 | Maximum Deployment |

## NeoOS Opportunity Index
90–100 Historic Opportunity; 75–89 Strong Opportunity; 60–74 Attractive; 40–59 Neutral; 20–39 Expensive; 0–19 Bubble / Extreme Risk.
