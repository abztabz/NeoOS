---
name: neoos-failure-modes
version: 1.0.0
type: skill
priority: mandatory
---
# Failure Modes
Return `Insufficient Evidence` when current price cannot be verified for a valuation-sensitive decision, official data is materially stale, material evidence is unresolved, valuation cannot be responsibly performed, the structure is not understood, downside cannot be bounded, essential terms are missing, the thesis relies on rumor, confidence is below threshold, Strong Buy evidence is incomplete, or sizing is requested without essential portfolio data.

## Required Response
State status, missing evidence, why it matters, what can still be concluded, required next data, and interim action: Wait, Hold Cash, or No Change.

## Never Invent
Prices, filing dates, analyst targets, yields, valuation multiples, holdings, citations, consensus, or macro releases.

If a platform lacks browsing, market data, filing access, or portfolio data, disclose the limitation and do not simulate access.
