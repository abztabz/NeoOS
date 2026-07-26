# Knowledge corpus — founding proposal

**For approval. Nothing is ingested. No historical claim is active. No source
below has been verified against its artefact.**

Governed by KNOWLEDGE_POLICY.md. Country evidence lives in
COUNTRY_SOURCE_PACKS.md and is not part of this corpus.

Companion documents: SOURCE_COVERAGE_MATRIX.md · SOURCE_RELATIONSHIPS.md ·
EXTENDED_CORPUS_CANDIDATES.md · INGESTION_ORDER.md

---

## 0. Verification status — read before anything else

**Every field marked ⚠ is recorded from model recall and must be verified against
the artefact before the source is nominated, let alone ingested.** Recall is
precisely what KNOWLEDGE_POLICY.md §3 forbids asserting as evidence, and that
prohibition applies to this document's own claims about titles, editions, dates,
critique history, publication status and institutional authority.

What that means concretely:

- **Titles and authors** are recorded with moderate confidence. Verify anyway.
- **Editions and dates** are low confidence. Editions matter because page and
  chapter references do not survive between them.
- **Critique history** — replication failures, methodological disputes — is
  recorded because omitting a known critique would be worse than recording one
  imperfectly. Each is flagged and each must be checked.
- Where verification is materially incomplete, the source is marked
  **`research required before nomination`** rather than presented as ready.

No source may move to `ingested` until every ⚠ on its row is resolved.

---

## 1. Tiers

| Tier | What it is | How it may be used |
|---|---|---|
| **K1** | Peer-reviewed or institutional research | Empirical claims, with method and sample stated |
| **K2** | Historical reference works | Precedent and sequence |
| **K3** | Investor frameworks and letters | Attributed reasoning. Never evidence about an asset |
| **K4** | Interpretive books | Framing and challenge. Always attributed |
| **K5** | Method and curriculum references | How an analysis is performed. Not a source of facts |

K5 is new. Valuation textbooks and professional curricula are neither research
findings nor interpretation — they are method, and filing them as either
misrepresents what they can support.

The letter `A` means a country-pack source class (A1–A6), never a knowledge tier.

---

## 2. Scope wording

The corpus is **not organised around a preferred jurisdiction. Every source
retains its geographic, institutional, asset-class and market-structure limits.**

The earlier phrase "jurisdiction-independent by construction" was too strong. A
study of US listed equities is not independent of geography merely because it is
not organised around one: it assumes reliable accounting, liquid markets,
enforceable property rights and a disclosure regime much of the world lacks.

Every source below records what it assumes, using the ten dimensions in
`src/domain/knowledge/applicability.ts`. NeoOS may not generalise past them
without explicit reasoning.

---

## 3. Count and composition

**30 proposed permanent sources.** 16 retained, 14 added, 1 moved to extended.

| Tier | Count |
|---|---|
| K1 — research | 8 |
| K2 — history | 5 |
| K3 — frameworks | 5 |
| K4 — interpretive | 5 |
| K5 — method | 7 |

The additions close the disciplines the previous 17 did not reach:
financial-statement analysis, accounting and earnings quality, intrinsic
valuation, market-implied expectations, return on invested capital and
reinvestment economics, management capital allocation, portfolio construction,
position sizing, drawdown and ruin control, liability- and labour-income-aware
allocation, and currency convertibility.

**No source is here to reach a number.** §9 lists what is still missing rather
than filling it with something unverifiable.

---

## 4. K1 — Peer-reviewed or institutional research

### K1.1 The Rate of Return on Everything, 1870–2015 — *retained*
- **Author** Jordà, Knoll, Kuvshinov, Schularick & Taylor · *Quarterly Journal of Economics*
- **Edition / date** ⚠ QJE vol. 134 (2019) — verify volume, issue, pages
- **Authority / status** High · Secondary · peer-reviewed
- **Gap closed** Long-run returns across asset classes **including residential property** — the only proposed source with housing at a generational horizon
- **Intended use** Baseline for what asset classes have actually returned over very long periods
- **May support** Long-run real return ranges by asset class, with the sample stated
- **Must not support** Expected return for any specific holding; anything about jurisdictions outside the sample
- **Method** Constructed long-run series across 16 countries, 145 years
- **Geographic scope** 16 advanced economies
- **Asset-class scope** Equities, bonds, bills, residential housing
- **Assumes** developed markets · reliable accounting · stable legal enforcement
- **Critiques** ⚠ Housing returns depend on imputed-rent and maintenance assumptions that are genuinely contested
- **Survivorship** Real and material — advanced economies only; countries that failed are absent
- **Replication** ⚠ No known failure; data construction is the disputed part
- **Bias** Methodological, in the series construction rather than a thesis
- **Access** Journal; working-paper version publicly available ⚠
- **Citation** Stable, DOI ⚠
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K1.2 Investor Diversification and International Equity Markets — *retained*
- **Author** Kenneth French & James Poterba · *American Economic Review*
- **Edition / date** ⚠ AER 81(2), 1991 — verify
- **Authority / status** High · Secondary · peer-reviewed
- **Gap closed** Home bias — the measured tendency to over-weight domestic assets
- **Intended use** Naming a failure this household is doubly exposed to, having both a residence and a home country pulling at it
- **May support** That home bias is a measured, persistent phenomenon in the samples studied
- **Must not support** A target foreign allocation; a claim about current magnitudes
- **Method** Cross-country comparison of portfolio holdings against market weights
- **Geographic scope** ⚠ Major developed markets of the period
- **Asset-class scope** Listed equities
- **Assumes** developed markets · liquid markets · institutional-investor access
- **Critiques** ⚠ Magnitudes have moved substantially since publication; barriers of the era differ from today's
- **Survivorship** Limited concern
- **Bias** None material
- **Access** ⚠ Journal
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K1.3 Dilemma not Trilemma — *retained*
- **Author** Hélène Rey · ⚠ Jackson Hole Economic Policy Symposium / NBER working paper
- **Edition / date** ⚠ 2013, later revisions — verify NBER number and version
- **Authority / status** High, widely cited · Secondary · ⚠ verify peer-review status of the version cited
- **Gap closed** Monetary independence under capital mobility — why a pegged currency's conditions may be set elsewhere
- **Intended use** A household whose spending base and home base may both be pegged has this question twice over
- **May support** The argument and its evidence, attributed
- **Must not support** Any prediction about a specific peg; any claim that transmission is complete
- **Method** Empirical global financial cycle analysis
- **Geographic scope** Global, with emphasis on capital flows to emerging markets
- **Asset-class scope** Cross-border capital flows, credit
- **Assumes** unrestricted capital mobility — **which is exactly what may not hold** for one of this subject's jurisdictions, and that limit must be argued rather than assumed
- **Critiques** ⚠ A strong thesis against the classical trilemma; contested in the literature
- **Bias** Advances a specific position; the contest is useful and must be shown
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K1.4 Exchange Arrangements Entering the 21st Century — *added*
- **Author** ⚠ Ilzetzki, Reinhart & Rogoff
- **Edition / date** ⚠ *Quarterly Journal of Economics*, 2019 — verify; earlier working-paper versions exist
- **Authority / status** ⚠ High · Secondary
- **Gap closed** **Currency convertibility and de facto exchange-rate regimes** — how arrangements actually behave versus how they are described
- **Intended use** Assessing what a stated peg means in practice, for both AED and NPR
- **May support** The classification method and its historical findings, attributed
- **Must not support** The current classification of any specific country — that is evidence, and belongs to a country pack
- **Method** De facto classification from observed market rates rather than official declarations
- **Geographic scope** Global, long panel
- **Asset-class scope** Currencies
- **Assumes** no strong assumption of mobility — one reason it suits this household
- **Critiques** ⚠ Classification methodology is itself debated
- **Bias** ⚠ Shares authorship with K2.4, whose separate critique history must not be transferred to it
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K1.5 Stocks for the Long Run? Sometimes Yes, Sometimes No — *added*
- **Author** ⚠ Anarkulova, Cederburg & O'Doherty
- **Edition / date** ⚠ *Journal of Financial Economics*, c. 2022 — **research required before nomination**; verify title, journal, year
- **Authority / status** ⚠ High if confirmed · Secondary
- **Gap closed** **Long-horizon ruin and sequence risk** — the empirical case that a long horizon does not guarantee equity outperformance
- **Intended use** Direct counterweight to the assumption a generational horizon makes equity risk safe
- **May support** The reported distribution of long-horizon outcomes across the sample
- **Must not support** A recommendation for or against equities
- **Method** Bootstrap across a broad international sample including failed and interrupted markets
- **Geographic scope** Broad international, deliberately including poor outcomes
- **Asset-class scope** Equities, bonds
- **Assumes** fewer developed-market assumptions than most long-run studies — its point
- **Survivorship** **Addresses** survivorship rather than suffering from it
- **Priority** 1 · **Ingestion** not ingested · **Verification** — *research required before nomination*

### K1.6 Lifetime Financial Advice: Human Capital, Asset Allocation and Insurance — *added*
- **Author** ⚠ Ibbotson, Milevsky, Chen & Zhu · CFA Institute Research Foundation
- **Edition / date** ⚠ c. 2007 — verify
- **Authority / status** ⚠ High institutional · Secondary
- **Gap closed** **Labour-income-aware allocation** — treating human capital as an asset with bond-like or equity-like character
- **Intended use** A subject whose income is largely salary holds a large implicit position that no balance sheet shows
- **May support** The framework, attributed
- **Must not support** A specific allocation for this subject
- **Method** Analytical, lifecycle-theoretic
- **Geographic scope** ⚠ US-centric framing
- **Asset-class scope** Whole balance sheet including human capital and insurance
- **Assumes** specific tax regime · developed markets · reliable annuity and insurance markets
- **Critiques** ⚠ Lifecycle assumptions and utility specification are debated
- **Access** ⚠ CFA Institute Research Foundation publications are typically freely available — verify
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K1.7 The Kelly Capital Growth Investment Criterion — *added*
- **Author** ⚠ MacLean, Thorp & Ziemba (eds.)
- **Edition / date** ⚠ World Scientific, c. 2011 — verify
- **Authority / status** ⚠ High for the mathematics · Secondary · edited collection
- **Gap closed** **Position sizing, overbetting and ruin control** on a defensible mathematical basis
- **Intended use** Why a position can be right and still sized wrongly; why overbetting destroys compounding
- **May support** The mathematics and its stated conditions
- **Must not support** A position size for any actual holding; the criterion is highly sensitive to inputs NeoOS does not have
- **Method** Mathematical, with empirical illustrations
- **Geographic scope** Not geographic
- **Asset-class scope** General, assumes repeated favourable bets with known edge
- **Assumes** liquid markets · known probability distributions — **the binding limitation in practice**
- **Critiques** ⚠ Full Kelly is widely regarded as too aggressive under parameter uncertainty; fractional Kelly is the practical response
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K1.8 Understanding Earnings Quality — *added*
- **Author** ⚠ Dechow, Ge & Schrand · *Journal of Accounting and Economics*
- **Edition / date** ⚠ 2010 — verify
- **Authority / status** ⚠ High · Secondary · peer-reviewed review article
- **Gap closed** **Earnings quality** — what the proxies are, what determines them, what they predict
- **Intended use** Distinguishing reported earnings from earnings that persist
- **May support** The proxies and their documented properties, attributed
- **Must not support** An earnings-quality verdict on any company; that requires the filings
- **Method** Literature review and synthesis
- **Geographic scope** ⚠ Predominantly US
- **Asset-class scope** Listed equities
- **Assumes** reliable accounting · specific disclosure regime — **both are the point**, and neither transfers automatically
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

---

## 5. K2 — Historical reference works

### K2.1 Triumph of the Optimists: 101 Years of Global Investment Returns — *retained*
- **Author** Dimson, Marsh & Staunton · continued as the annual Global Investment Returns Yearbook
- **Edition / date** ⚠ Princeton University Press, 2002; yearbook annual — cite the yearbook year for current figures
- **Authority / status** High · Secondary
- **Gap closed** What long-run returns actually were, **including the countries that did badly**
- **May support** Long-run real returns by country and asset class; the size of the survivorship correction
- **Must not support** Any forward return estimate
- **Method** Constructed century-long series across markets
- **Geographic scope** ⚠ 16–20+ markets depending on edition
- **Asset-class scope** Equities, bonds, bills, currencies
- **Assumes** developed markets · continuous market existence
- **Survivorship** **Corrects for it explicitly** — the book's central contribution
- **Bias** Argues against naive equity optimism; that is a finding, not a slant
- **Access** ⚠ Book purchase; yearbook summaries circulated publicly
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K2.2 Golden Fetters: The Gold Standard and the Great Depression, 1919–1939 — *retained*
- **Author** Barry Eichengreen
- **Edition / date** ⚠ Oxford University Press, 1992
- **Authority / status** High · Secondary
- **Gap closed** What a fixed exchange rate does to a country that keeps it under pressure
- **May support** The documented historical mechanics of defending and abandoning a fixed rate
- **Must not support** Any prediction about a currently pegged currency
- **Method** Economic history, archival
- **Geographic scope** Interwar Europe and North America
- **Asset-class scope** Currencies, sovereign policy
- **Assumes** the institutional conditions of its period — **transfer to modern pegs must be argued, not assumed**
- **Critiques** ⚠ A strong thesis, well supported, and an argument rather than a neutral account
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K2.3 Global Capital Markets: Integration, Crisis, and Growth — *retained*
- **Author** Maurice Obstfeld & Alan Taylor
- **Edition / date** ⚠ Cambridge University Press, 2004
- **Authority / status** High · Secondary
- **Gap closed** The monetary trilemma across two centuries — what countries gave up to hold a fixed rate, open capital account or independent policy
- **May support** The historical record of the three-way trade-off
- **Must not support** A judgement about any current regime
- **Geographic scope** Global, long historical panel
- **Assumes** varying capital-mobility regimes — its subject rather than its assumption
- **Bias** Standard open-economy framing. **Pairs with K1.3, which disputes part of it** — see SOURCE_RELATIONSHIPS.md
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K2.4 This Time Is Different: Eight Centuries of Financial Folly — *retained*
- **Author** Reinhart & Rogoff
- **Edition / date** ⚠ Princeton University Press, 2009
- **Authority / status** High for the crisis chronology · Secondary
- **Gap closed** The shape and repetition of debt crises, defaults and inflations
- **May support** The historical record of crisis episodes and their sequence
- **Must not support** **Any debt-to-GDP threshold claim**
- **Critiques** ⚠ **Record prominently.** The authors' separate 2010 debt-and-growth paper was found in 2013 to contain a spreadsheet error and contested weighting choices. That critique concerns the threshold work, not this book's chronology — but the association is real, must be recorded, and must not be transferred to K1.4 which shares authorship
- **Geographic scope** Global, eight centuries, uneven data density
- **Assumes** comparable crisis definitions across very different regimes ⚠
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K2.5 Manias, Panics, and Crashes: A History of Financial Crises — *retained*
- **Author** Kindleberger & Aliber
- **Edition / date** ⚠ First 1978; substantially revised through later editions — **edition matters**, later ones add episodes and revise argument
- **Authority / status** High as a reference work · Secondary
- **Gap closed** The anatomy of a bubble, and how leverage turns a fall into a ruin
- **May support** The described phases and their historical instances
- **Must not support** Identifying a bubble in progress — the book does not claim to enable it
- **Method** Narrative history within a Minsky framework
- **Bias** Minsky's framework throughout: a school, not a consensus
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

---

## 6. K3 — Investor frameworks and letters

All K3 sources are **attributed reasoning frameworks**. They may shape questions
and analytical method. They may not establish current facts, intrinsic value,
present market conditions, company quality, expected returns, legal facts or
macro facts.

### K3.1 Berkshire Hathaway Shareholder Letters and Owner's Manual — *retained*
- **Author** Warren Buffett · Berkshire Hathaway
- **Edition / date** 1977 to present, annual ⚠ verify earliest year available
- **Authority / status** High as a body of reasoning; **not** authority on facts · Primary as to the author's own reasoning
- **Gap closed** How an owner reasons about allocating capital between opportunities
- **May support** The reasoning, attributed and quoted exactly
- **Must not support** That any approach is correct; that a holding is cheap; any current fact
- **Geographic scope** ⚠ Predominantly US
- **Asset-class scope** Operating businesses, listed equities, insurance float
- **Assumes** reliable accounting · strong property rights · deep liquid markets
- **Survivorship** **At its most acute.** The most successful outcome of a strategy is the least representative sample of it, and the author has said so himself ⚠
- **Access** Free, stable, by year
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K3.2 Oaktree Memos, and The Most Important Thing — *retained*
- **Author** Howard Marks · Oaktree Capital
- **Edition / date** ⚠ Memos 1990 to present; book 2011 — verify first memo year
- **Authority / status** High as reasoning · Primary as to the author's own reasoning
- **Gap closed** Second-level thinking; cycle position framed as a question rather than a call
- **May support** The reasoning, attributed
- **Must not support** Any market-timing conclusion; any current market assessment
- **Bias** A credit investor's temperament, more downside-weighted than an equity investor's — a difference of emphasis from K3.1, **not a contradiction of it**
- **Access** Memos free and dated
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K3.3 The Intelligent Investor — *retained*
- **Author** Benjamin Graham
- **Edition / date** ⚠ 1949; revised 4th edition 1973; later printings carry Zweig commentary — **specify edition and whether commentary is included**; Zweig is a different author and cited separately
- **Authority / status** Foundational for margin of safety · Secondary
- **Gap closed** Margin of safety; price against value; the defensive/enterprising distinction
- **Must not support** Graham's numeric screens as current criteria — they belong to a market with far worse disclosure and higher frictions
- **Geographic scope** Mid-century US
- **Assumes** specific disclosure regime of its era
- **Priority** 3 · **Ingestion** not ingested · **Verification** required

### K3.4 Principles for Navigating Big Debt Crises — *retained*
- **Author** Ray Dalio · Bridgewater Associates
- **Edition / date** ⚠ 2018
- **Authority / status** Moderate — practitioner framework with case studies, **not peer-reviewed** · Secondary
- **Gap closed** A debt-cycle template as one lens on macro conditions
- **May support** The described case studies, attributed
- **Must not support** The template as a law; any timing claim
- **Bias** A macro school; built by a firm with a commercial interest in it. **Addresses a different analytical level from K3.1 and K3.3 rather than contradicting them** — see SOURCE_RELATIONSHIPS.md
- **Access** ⚠ Free PDF
- **Priority** 3 · **Ingestion** not ingested · **Verification** required

### K3.5 The Outsiders — *added*
- **Author** ⚠ William N. Thorndike Jr.
- **Edition / date** ⚠ Harvard Business Review Press, 2012
- **Authority / status** Moderate · Secondary · case-study based
- **Gap closed** **Management capital allocation** — how chief executives deploy cash, and why it dominates operating skill over decades
- **May support** The described cases, attributed
- **Must not support** That the pattern generalises; that any current management is a good allocator
- **Method** Eight selected case studies
- **Survivorship** **Severe and structural.** The sample is chosen on outcome. This must be stated every time the book is used
- **Geographic scope** US listed companies
- **Priority** 3 · **Ingestion** not ingested · **Verification** required

---

## 7. K4 — Interpretive books

### K4.1 A Random Walk Down Wall Street — *retained, description corrected*
- **Author** Burton Malkiel
- **Edition / date** ⚠ First 1973; many editions — **edition matters**, figures update
- **Authority / status** Moderate — a well-argued position · Secondary
- **Gap closed** **The passive-investing and market-efficiency challenge to persistent active advantage after costs, taxes and behavioural errors**
- **May support** The argument, attributed
- **Must not support** That active management cannot work, as settled fact; that any specific decision was luck
- **Method** Synthesis of efficiency literature with practitioner argument
- **Geographic scope** ⚠ Predominantly US
- **Asset-class scope** Listed equities, funds
- **Assumes** developed markets · liquid markets · low-cost index access — **the last does not hold everywhere**, and where index access is absent the argument's practical conclusion does not follow
- **Bias** A committed efficient-markets position, which is why it is here
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

> **The previous description read "the case that all of K3 is largely luck."**
> That prejudged the source and misstated it. The argument concerns *persistent
> advantage after costs*, which is a claim about distributions, not a verdict on
> individual decisions. Corrected above and in SOURCE_RELATIONSHIPS.md.

### K4.2 Thinking, Fast and Slow — *retained*
- **Author** Daniel Kahneman
- **Edition / date** ⚠ 2011
- **Authority / status** High for the author's own experimental work · Secondary
- **Gap closed** How the subject's own reasoning fails, particularly under loss
- **May support** Loss aversion, anchoring, overconfidence — attributed, with the caveat below
- **Must not support** **The priming literature discussed in the book.** ⚠ Several studies failed to replicate and the author publicly acknowledged the chapter overstated the evidence. Cite the primary study, not the book, for any specific effect
- **Replication** **The material replication concern in this corpus.** Recorded prominently rather than footnoted
- **Geographic scope** Laboratory samples, ⚠ predominantly Western university populations
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K4.3 The Black Swan — *retained, description corrected*
- **Author** Nassim Nicholas Taleb
- **Edition / date** ⚠ 2007; second edition 2010
- **Authority / status** Moderate — a strong argument, not an empirical study · Secondary
- **Gap closed** Why tail events dominate long horizons and why models understate them
- **May support** The argument about fat tails and model risk, attributed
- **Must not support** That historical data has no value — **the argument is that it is misused and that absence of evidence in a short sample is not evidence of absence, which is different**; any specific portfolio construction as *the* answer
- **Bias** Polemical and dismissive of opposing views. Held at low standing, always attributed
- **Priority** 3 · **Ingestion** not ingested · **Verification** required

### K4.4 Family Wealth: Keeping It in the Family — *retained*
- **Author** ⚠ James E. Hughes Jr.
- **Edition / date** ⚠ Expanded edition c. 2004
- **Authority / status** Moderate — practitioner experience, not empirical · Secondary
- **Gap closed** Why capital fails to survive three generations — governance, preparation of heirs, human capital the balance sheet does not show
- **Must not support** **The "shirtsleeves to shirtsleeves in three generations" statistic as established fact.** ⚠ It is folklore with weak provenance and must never be quoted as data
- **Geographic scope** ⚠ Wealthy Western family-office practice
- **Assumes** strong property rights · stable legal enforcement · trust and foundation structures available — **none automatic in a cross-border household**, and this limit is larger here than for most sources
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K4.5 Competition Demystified — *added*
- **Author** ⚠ Bruce Greenwald & Judd Kahn
- **Edition / date** ⚠ c. 2005 — verify
- **Authority / status** Moderate · Secondary
- **Gap closed** **Business quality** — what a competitive advantage actually is, and why barriers to entry rather than differentiation decide it
- **May support** The framework, attributed
- **Must not support** That any specific company has a durable advantage
- **Method** Case-based strategic analysis
- **Geographic scope** ⚠ Predominantly US and European large caps
- **Assumes** developed markets · reliable accounting
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

---

## 8. K5 — Method and curriculum references

Method references describe **how an analysis is performed**. They may not
establish a fact, a value or a market condition — only the procedure by which
one would be derived from evidence.

### K5.1 Investment Valuation — *added*
- **Author** ⚠ Aswath Damodaran
- **Edition / date** ⚠ Wiley; multiple editions, recall suggests 3rd ed. c. 2012 — verify before citing any page
- **Authority / status** ⚠ High as a method reference · Secondary
- **Gap closed** **Intrinsic valuation** — discounted cash flow construction, discount rates, terminal value, relative valuation
- **May support** Valuation method and its stated conditions
- **Must not support** A value for any holding; the method produces a number only when applied to evidence NeoOS must obtain separately
- **Geographic scope** Global in intent, ⚠ US data and tax framing throughout
- **Asset-class scope** Equities, with extensions to other assets
- **Assumes** reliable accounting · liquid markets · specific tax regime · specific disclosure regime
- **Critiques** ⚠ DCF outputs are highly sensitive to terminal-value assumptions; the author says so
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K5.2 Valuation: Measuring and Managing the Value of Companies — *added*
- **Author** ⚠ Koller, Goedhart & Wessels · McKinsey & Company
- **Edition / date** ⚠ Wiley; multiple editions — verify
- **Authority / status** ⚠ High as a method reference · Secondary
- **Gap closed** **Return on invested capital and reinvestment economics** — why growth creates value only when returns exceed the cost of capital
- **May support** The ROIC/growth/reinvestment framework
- **Must not support** Any company's actual ROIC; that comes from filings
- **Geographic scope** ⚠ Global large-cap, developed-market framing
- **Assumes** reliable accounting · developed markets · institutional access
- **Bias** ⚠ Produced by a consultancy with a commercial interest in corporate advisory
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K5.3 Financial Statement Analysis and Security Valuation — *added*
- **Author** ⚠ Stephen Penman
- **Edition / date** ⚠ McGraw-Hill; multiple editions — verify
- **Authority / status** ⚠ High as a method reference · Secondary
- **Gap closed** **Financial-statement analysis** tied directly to valuation — accounting-based valuation rather than cash-flow-forecast-based
- **May support** The analytical method
- **Must not support** Any company's accounts or their quality
- **Assumes** reliable accounting · specific disclosure regime
- **Bias** Advocates accounting-based valuation over DCF — **a methodological tension with K5.1**, not a contradiction; see SOURCE_RELATIONSHIPS.md
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K5.4 CFA Program curriculum — Financial Statement Analysis, including Financial Reporting Quality — *added*
- **Author** CFA Institute
- **Edition / date** ⚠ Curriculum revised annually — **the year is part of the citation**
- **Authority / status** ⚠ High institutional · Secondary
- **Gap closed** **Financial-statement analysis and reporting quality as a professional standard**, independent of any single author's framing
- **May support** Standard analytical procedures and the reporting-quality spectrum
- **Must not support** Any company's reporting quality
- **Geographic scope** Global in intent, IFRS and US GAAP
- **Assumes** reliable accounting · specific disclosure regime
- **Access** ⚠ **Licensing must be checked before ingestion.** Curriculum material is typically licensed to candidates and members rather than freely redistributable. If licensing does not permit storage, this source is reference-only and cited without reproduction
- **Priority** 1 · **Ingestion** not ingested · **Verification** — *licensing check required*

### K5.5 Financial Shenanigans — *added*
- **Author** ⚠ Howard Schilit (later editions with Perler and others)
- **Edition / date** ⚠ McGraw-Hill; multiple editions — verify
- **Authority / status** Moderate to high for the technique catalogue · Secondary
- **Gap closed** **Forensic accounting** — the specific manipulations and the marks they leave
- **May support** The catalogue of techniques and detection signals
- **Must not support** An allegation about any company
- **Method** Case-based, drawn from documented accounting failures
- **Survivorship** ⚠ Sample is drawn from cases that were discovered
- **Geographic scope** ⚠ Predominantly US
- **Priority** 2 · **Ingestion** not ingested · **Verification** required

### K5.6 Expectations Investing — *added*
- **Author** ⚠ Michael Mauboussin & Alfred Rappaport
- **Edition / date** ⚠ Revised edition c. 2021 — verify
- **Authority / status** Moderate to high · Secondary
- **Gap closed** **Market-implied expectations** — reading what a price already assumes rather than forecasting independently
- **Intended use** Inverts the usual question, which suits a system that must avoid producing forecasts
- **May support** The method
- **Must not support** What any current price implies; that requires the price and the accounts
- **Assumes** liquid markets · reliable accounting · specific disclosure regime
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

### K5.7 Expected Returns — *added*
- **Author** ⚠ Antti Ilmanen
- **Edition / date** ⚠ Wiley, c. 2011; ⚠ a later related volume may exist — verify which is cited
- **Authority / status** ⚠ High · Secondary
- **Gap closed** **Expected-return estimation and portfolio construction** across asset classes and risk factors
- **May support** The evidence on historical risk premia and their drivers, attributed
- **Must not support** A forward expected return for this portfolio
- **Geographic scope** ⚠ Predominantly developed markets
- **Asset-class scope** Broad multi-asset
- **Assumes** developed markets · liquid markets · institutional-investor access
- **Bias** ⚠ Written from an institutional and factor-investing perspective
- **Priority** 1 · **Ingestion** not ingested · **Verification** required

---

## 9. What is still missing

Named rather than filled. A list that does not state its gaps reads as complete.

- **Cross-border and multi-jurisdiction family wealth.** The largest remaining
  gap and the one closest to this subject's actual position. K4.4 covers family
  governance from single-jurisdiction Western practice. Nothing here addresses a
  household earning in one country, with family and property in another,
  investing in a third. **No candidate proposed** — see
  EXTENDED_CORPUS_CANDIDATES.md; this needs a deliberate search rather than a
  guess, and proposing an unverifiable title would be worse than the gap.
- **Liability matching and liquidity-matched allocation** are only partly
  covered by K1.6. A dedicated source is a candidate, not a nomination.
- **Frontier and small-market evidence** remains thin. K1.5 addresses the
  survivorship problem; most frontier markets are in no long-run dataset at all,
  which is itself a finding.
- **Drawdown control as a distinct discipline** is covered mathematically by
  K1.7 and empirically by K1.5, but no source addresses it as practice.
- **Corporate governance** moves to extended status — see §10.
- **Nothing here is about tax or succession law in any jurisdiction.** Correct:
  those are `domain_rule` evidence, jurisdictional and expiring, and they live in
  country packs.

---

## 10. Moved to extended status

**Bebchuk, Cohen & Ferrell — "What Matters in Corporate Governance?"**
(previously K1.4)

Moved to EXTENDED_CORPUS_CANDIDATES.md. **Not rejected as invalid.** Recorded as:

- credible and peer-reviewed;
- potentially useful for future governance scoring;
- currently narrow relative to the more urgent valuation, accounting and
  allocation disciplines;
- geographically and institutionally limited — ⚠ a US sample of its period;
- not required for the first complete permanent corpus.

It returns to the permanent corpus if and when governance scoring becomes a
NeoOS function.

---

## 11. What is being asked

**Approval is six decisions, not one.** Staged in
`src/domain/knowledge/approval.ts`:

| Stage | What it decides |
|---|---|
| 1. Proposed source list | Nominated only |
| 2. **List approved** | The operator accepts these titles. **This approves the titles, not the claims inside them** |
| 3. Identity and metadata verified | Every ⚠ resolved against the artefact |
| 4. Licensing and access approved | Some sources may be reference-only |
| 5. Ingestion order approved | Placed in the plan |
| 6. Ingestion approved | Records created with resolvable citations |
| 7. **Claim activation approved** | Morpheus may cite it. A separate decision |

**No source becomes active merely because it appears in this approved proposal.**
Stages advance one at a time and a prohibited claim — a replication failure, a
disputed threshold, a folklore statistic — stays prohibited at every stage,
including after activation.

**What is being asked now is stage 2 only.**

1. **Approve, amend or reject** the 30 titles, individually or as a set.
2. **Confirm the K5 tier** as a distinct category for method references.
3. **Confirm the two `research required before nomination` entries** may stay as
   proposals: K1.5 and, in the extended list, the cross-border family-wealth gap.
4. **Confirm the licensing approach for K5.4** — reference-only citation if the
   curriculum licence does not permit storage.

On approval, ingestion follows INGESTION_ORDER.md, verifying every ⚠ against the
artefact. **Nothing is ingested and no historical claim is activated before
that.**
