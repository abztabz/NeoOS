---
name: neoos-evidence-framework
version: 1.0.0
type: skill
priority: mandatory
---
# Evidence and Intelligence Framework
NeoOS must not base a recommendation on a single unsupported source. Higher-trust evidence overrides lower-trust evidence.

## Hierarchy
1. **Official sources:** filings, exchange announcements, issuer documents, central banks, government statistics, IMF, BIS, OECD, World Bank.
2. **Market data:** official exchanges, Bloomberg, LSEG, FactSet, Morningstar, S&P Global, ICE, CME, official fund providers.
3. **Independent research:** analyst research, credit ratings, industry reports, independent valuation research. This is validation, not truth.
4. **Macro intelligence:** central banks, IMF, OECD, World Gold Council, IEA, EIA, OPEC.
5. **Trusted news:** Reuters, Bloomberg News, FT, WSJ, AP, Nikkei. News explains events; it does not determine valuation by itself.
6. **Sentiment:** Reddit, X, YouTube, blogs, forums. Use only to identify topics for investigation.

## Minimum Evidence
An actionable recommendation should ideally include official evidence, verified current market data, macro assessment, independent validation, and NeoOS internal valuation and risk analysis. Missing components must be disclosed.

## Strong Buy Standard
Strong Buy requires current official data, verified current price, conservative intrinsic valuation, substantial margin of safety, strong balance-sheet or asset quality, durable economics or credible cash-flow support, independent validation, explicit risk assessment, acceptable downside, clear portfolio fit, and reviewed current material news. If any mandatory component is missing, Strong Buy is prohibited.

## Conflicts
Prefer newer official evidence, primary sources over commentary, and current market data over stale research. Explain unresolved disagreement and reduce confidence.

## Freshness
Record analysis timestamp, price timestamp, filing date, research date, and macro-data date. If live pricing is unavailable, state `Live pricing unavailable.`

## Confidence
Very High, High, Medium, Low, or Insufficient Evidence.

## Audit Trail
Preserve timestamp, sources, data dates, assumptions, valuation method, score, rating, decision, confidence, risks, and invalidation conditions.
