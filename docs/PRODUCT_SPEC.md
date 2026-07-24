# NeoOS CIO Product Specification v1

## Product promise
NeoOS turns global market information, portfolio state, cash position, and evidence quality into a disciplined capital-allocation posture.

## Primary decision
The first screen answers: **How hard should I press the accelerator today?**

### Deployment bands
- 0–20: Preserve Cash
- 21–40: Deploy Gradually
- 41–60: Selective Deployment
- 61–80: Increase Deployment
- 81–95: Aggressive Deployment
- 96–100: Maximum Deployment

The UI must distinguish posture from conviction. A high deployment score does not automatically imply any asset is a Strong Buy.

## Core scoring model
- Valuation: 30%
- Financial Strength: 20%
- Business Quality: 15%
- Growth: 10%
- Macro: 10%
- Technical: 5%
- Portfolio Fit: 5%
- Governance: 5%

## Ratings
- 95–100: Strong Buy
- 85–94: Buy
- 70–84: Accumulate
- 55–69: Hold
- 40–54: Reduce
- 0–39: Sell / Avoid

## Home / Capital workspace
Required order:
1. Header and demo/live status
2. Capital Deployment Gauge
3. Recommendation and accelerator posture
4. Why this score explanation
5. Key scores: Cash, Market, Opportunity, Confidence, Evidence Integrity, Reserve Health
6. Capital Radar
7. Action board: Strong Buy, Buy, Accumulate, Hold, Reduce, Avoid
8. Watchlist thresholds
9. Deployment strategy
10. Morpheus commentary

## Markets workspace
- Market regime
- Region opportunity heat map
- US, Europe, Japan, China, Middle East cards
- Macro context
- Opportunity ranking

## Portfolio workspace
For each holding:
- Name / ticker
- NeoOS score
- Rating
- Current allocation
- Target range
- Intrinsic value range
- Confidence
- Thesis status
- Key risks
- Next review trigger

## Gold workspace
- Demand
- Central bank buying
- ETF flows
- Mine supply
- Real yields
- USD strength
- Fair value range
- Rating
- Portfolio role

## Cash workspace
- Available cash
- Emergency reserve
- Deployable cash
- Monthly surplus
- Cash yield
- Opportunity cost
- Cash score
- Recommendation

## Timeline workspace
Chronological record of:
- Deployment changes
- Cash score changes
- Rating changes
- Major decisions
- Evidence revisions
- User action notes (future)

## Capital Radar
Only surface changes that are decision-relevant. Examples:
- Apple moved Hold → Accumulate
- Gold moved closer to Buy
- UAE utilities improved
- Cash score fell materially
- No change in deployment posture

Do not repeat the entire dashboard.

## Design language
- Near-black foundation
- High-contrast white text
- Cyan for information/opportunity
- Green for strength/positive confirmation
- Amber for caution/cash optionality
- Red only for genuine risk or destructive action
- Rounded, layered cards without excessive glass blur
- Monospaced micro-labels combined with clean humanist display typography
- Motion is restrained, fast, and purposeful

## Mobile behavior
- Primary viewport: 390×844
- Secondary: 430×932
- Bottom workspace navigation
- Minimum 44px touch targets
- No horizontal overflow
- Hero gauge visible quickly without excessive scrolling
- Safe-area support
