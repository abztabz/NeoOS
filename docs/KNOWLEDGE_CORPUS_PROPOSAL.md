# Knowledge corpus — founding proposal

**For approval. Nothing here is ingested. No historical claim may be made from
any of it until it is approved and ingested.**

Governed by KNOWLEDGE_POLICY.md.

---

## 0. Read this before the list

**Every date and edition below must be verified against the artefact at
ingestion.** They are recorded here from recall, and recall is exactly what
KNOWLEDGE_POLICY.md §3 forbids asserting as evidence. This document is a
shopping list, not a corpus: the citation becomes real when the artefact is in
hand and the reference resolves. Where a work has many editions, the edition is
part of the citation, because page and chapter references do not survive between
them.

**Twenty is a ceiling, not a target.** Forty scraped articles are a worse library
than fifteen chosen ones, and far more likely to contain something false.

**Nothing here is doctrine.** The list is built so that its strongest voices
disagree with each other on purpose — §3 names the disagreements. A corpus where
every source agrees is not a library, it is a position with citations attached.

---

## 1. Tiers

| Tier | What it is | How it may be used |
|---|---|---|
| **A** | Primary factual sources | Facts and figures. Highest standing for what they measure, none outside it. |
| **B** | Peer-reviewed or institutional research | Empirical claims, with method and sample stated. |
| **C** | Historical reference works | Precedent and sequence. What happened, and in what order. |
| **D** | Investor frameworks and letters | Ways of reasoning. Never evidence about an asset. |
| **E** | Interpretive books | Framing and challenge. Lowest standing; always attributed to the author. |

---

## 2. The proposed twenty

### Tier A — Primary factual sources

**A1. Monetary and Banking Statistics / Annual Report**
- Author or institution: Central Bank of the UAE
- Publication date: Continuous; annual report yearly
- Category: UAE and Gulf economic context; inflation and currency regimes
- Authority level: Highest for UAE monetary facts
- Primary or secondary: Primary
- Intended use: The dirham peg, the base rate, domestic monetary conditions
- May support: The peg's existence, rate and start date; domestic policy rates
- Must not support: Anything about UAE consumer prices, or about what the peg *should* be
- Citation availability: Stable, publicly published
- Edition or stable reference: Cite issue and publication date
- Known bias: A central bank reporting on its own policy. Descriptive facts are reliable; assessments of that policy are not disinterested
- Licensing: Public
- Priority: **1 — highest.** The peg is the single largest standing fact in a dirham-denominated generational position

**A2. Consumer Price Index releases**
- Author or institution: UAE Federal Competitiveness and Statistics Centre
- Publication date: Monthly and quarterly, ongoing
- Category: Inflation and currency regimes; UAE and Gulf economic context
- Authority level: Highest for UAE price level
- Primary or secondary: Primary
- Intended use: Whether this position grows in real terms
- May support: UAE price level and its change; basket composition
- Must not support: US or global inflation; forward inflation
- Citation availability: Stable, with revisions
- Edition or stable reference: Cite reference period **and** publication vintage
- Known bias: Basket weights are a methodological choice; housing weight matters greatly here and may not match this household's spending
- Licensing: Public
- Priority: **1 — highest.** Without it, real return is unknowable

**A3. Consumer Price Index (CPI-U)**
- Author or institution: US Bureau of Labor Statistics
- Publication date: Monthly, ongoing
- Category: Inflation and currency regimes
- Authority level: Highest for US price level
- Primary or secondary: Primary
- Intended use: Purchasing power of dollar-denominated holdings
- May support: US price level and its change
- Must not support: **UAE purchasing power.** The peg transmits monetary policy, not prices
- Citation availability: Stable, with published revisions
- Edition or stable reference: Series ID plus reference period
- Known bias: Hedonic and substitution adjustments are contested methodological choices
- Licensing: Public; free key raises rate limits
- Priority: 2

**A4. Policy rates and Treasury yields (FRED / H.15)**
- Author or institution: Federal Reserve; Federal Reserve Bank of St. Louis
- Publication date: Continuous
- Category: Monetary history; inflation and currency regimes
- Authority level: Highest for US rates
- Primary or secondary: Primary
- Intended use: Imported monetary conditions reaching the dirham through the peg
- May support: US policy rate and yield levels; the transmission channel
- Must not support: UAE domestic rates (use A1); any rate forecast
- Citation availability: Stable series identifiers
- Edition or stable reference: FRED series ID plus observation date
- Known bias: None material for levels
- Licensing: Public; free API key
- Priority: 2

### Tier B — Peer-reviewed or institutional research

**B1. Article IV Consultation — United Arab Emirates**
- Author or institution: International Monetary Fund
- Publication date: Annual
- Category: UAE and Gulf economic context
- Authority level: High; independent of the state being assessed
- Primary or secondary: Secondary (analysis of primary data)
- Intended use: External read on UAE fiscal, monetary and property conditions
- May support: Documented structural observations about the UAE economy
- Must not support: Investment recommendations; property price forecasts
- Citation availability: Stable, by country report number
- Edition or stable reference: Country Report No. and year
- Known bias: Institutional IMF framing; historically favours orthodox fiscal positions. Country authorities respond formally, and the response is part of the document
- Licensing: Public
- Priority: **1 — highest.** The only independent Gulf-specific analysis in this founding set

**B2. Annual Economic Report**
- Author or institution: Bank for International Settlements
- Publication date: Annual
- Category: Monetary history; risk and uncertainty
- Authority level: High
- Primary or secondary: Secondary
- Intended use: Credit cycles, global liquidity, financial-stability conditions
- May support: Documented credit-cycle and liquidity observations
- Must not support: Any timing claim
- Citation availability: Stable by year and chapter
- Edition or stable reference: Year plus chapter
- Known bias: A recognisable BIS view — sceptical of prolonged monetary accommodation. Consistent, and worth naming, because it will lean one way
- Licensing: Public
- Priority: 3

**B3. "The Rate of Return on Everything, 1870–2015"**
- Author or institution: Jordà, Knoll, Kuvshinov, Schularick, Taylor — *Quarterly Journal of Economics*
- Publication date: 2019
- Category: Economic history; portfolio construction; intergenerational wealth
- Authority level: High; peer-reviewed, 16 countries, 145 years
- Primary or secondary: Secondary
- Intended use: Long-run returns across equities, bonds, bills **and housing** — the only category with residential property at this horizon
- May support: Long-run real return ranges by asset class, with the stated sample
- Must not support: Expected return for any specific holding; anything about the UAE, which is not in the sample
- Citation availability: Stable; DOI
- Edition or stable reference: QJE vol. 134, 2019 — verify at ingestion
- Known bias: Advanced economies only, so survivorship at the country level is real. Housing returns depend on imputed-rent assumptions that are genuinely contested
- Licensing: Journal; working-paper version publicly available
- Priority: **1 — highest.** Directly addresses a generational horizon, and includes property, which this household holds

**B4. "What Matters in Corporate Governance?"**
- Author or institution: Bebchuk, Cohen & Ferrell — *Review of Financial Studies*
- Publication date: 2009
- Category: Corporate governance
- Authority level: High; peer-reviewed
- Primary or secondary: Secondary
- Intended use: Which governance provisions have been shown to matter, and which have not
- May support: Empirical governance-to-value associations, with the sample named
- Must not support: A governance judgement about any specific company today; the sample is US and dated
- Citation availability: Stable; DOI
- Edition or stable reference: RFS 22(2), 2009 — verify at ingestion
- Known bias: Shareholder-primacy framing; a live debate rather than settled ground
- Priority: 4 — the weakest fit for this household's actual position, and the first candidate to drop

### Tier C — Historical reference works

**C1. *Triumph of the Optimists: 101 Years of Global Investment Returns***
- Author or institution: Dimson, Marsh & Staunton
- Publication date: 2002; continued as the annual Global Investment Returns Yearbook
- Category: Economic history; portfolio construction
- Authority level: High
- Primary or secondary: Secondary
- Intended use: What long-run returns actually were, across countries, including the ones that did badly
- May support: Long-run real returns by country and asset class; the size of the survivorship correction
- Must not support: Any forward return estimate
- Citation availability: Book plus annually updated yearbook
- Edition or stable reference: Cite the yearbook year for updated figures
- Known bias: The authors' own correction to equity optimism is the point of the book; it is evidence against the naive version of buy-and-hold
- Licensing: Book purchase; yearbook summaries circulated publicly
- Priority: **1 — highest.** The best available answer to "what should I expect over decades", and it is more sobering than folklore

**C2. *This Time Is Different: Eight Centuries of Financial Folly***
- Author or institution: Reinhart & Rogoff
- Publication date: 2009
- Category: Financial crises; monetary history
- Authority level: High for the crisis chronology
- Primary or secondary: Secondary
- Intended use: The shape and repetition of debt crises, defaults and inflations
- May support: The historical record of crisis episodes and their sequence
- Must not support: Any debt-to-GDP threshold claim
- Citation availability: Widely held; stable pagination by edition
- Edition or stable reference: Princeton University Press, 2009
- Known bias: **Record this prominently.** The authors' related 2010 paper on debt and growth was found in 2013 to contain a spreadsheet error and contested weighting choices. That critique concerns the growth-threshold work rather than this book's chronology, but the association is real and the threshold claim must never be cited from here
- Licensing: Book purchase
- Priority: 2

**C3. *Manias, Panics, and Crashes: A History of Financial Crises***
- Author or institution: Kindleberger & Aliber
- Publication date: 1978; substantially revised through later editions
- Category: Financial crises; behavioral finance
- Authority level: High as a reference work
- Primary or secondary: Secondary
- Intended use: The anatomy of a bubble, and how leverage turns a fall into a ruin
- May support: The described phases and their historical instances
- Must not support: Identifying a bubble in progress, which the book does not claim to enable
- Citation availability: Widely held
- Edition or stable reference: **Edition matters** — later editions add episodes and revise argument
- Known bias: Minsky's framework throughout, which is a school rather than a consensus
- Licensing: Book purchase
- Priority: 2

**C4. *Golden Fetters: The Gold Standard and the Great Depression, 1919–1939***
- Author or institution: Barry Eichengreen
- Publication date: 1992
- Category: Inflation and currency regimes; monetary history
- Authority level: High
- Primary or secondary: Secondary
- Intended use: **What a fixed exchange rate does to a country that keeps it under pressure.** Directly relevant to a household whose entire position is denominated in a pegged currency
- May support: The documented historical mechanics of defending, and abandoning, a fixed rate
- Must not support: Any prediction about the dirham peg
- Citation availability: Widely held
- Edition or stable reference: Oxford University Press, 1992
- Known bias: A strong thesis — that the gold standard transmitted and deepened the Depression — which is well supported but is an argument, not a neutral account
- Licensing: Book purchase
- Priority: **1 — highest.** The most under-appreciated item on this list for this specific household

### Tier D — Investor frameworks and letters

**D1. Shareholder Letters and Owner's Manual**
- Author or institution: Warren Buffett / Berkshire Hathaway
- Publication date: 1977–present, annual
- Category: Capital allocation; value investing
- Authority level: High as a body of reasoning; **not** authority on facts
- Primary or secondary: Primary as to the author's own reasoning
- Intended use: How an owner thinks about allocating capital between opportunities
- May support: The reasoning, attributed and quoted exactly
- Must not support: That any approach is correct; that a holding is cheap. **A principle can never make a holding cheap** — KNOWLEDGE_POLICY.md §1
- Citation availability: Stable, free, by year
- Edition or stable reference: Letter year plus page
- Known bias: Survivorship at its most acute — the most successful outcome of a strategy is the least representative sample of it. Buffett has repeatedly said his approach does not transfer wholesale
- Licensing: Free
- Priority: 2

**D2. Memos, and *The Most Important Thing***
- Author or institution: Howard Marks / Oaktree
- Publication date: Memos 1990–present; book 2011
- Category: Risk and uncertainty; capital allocation
- Authority level: High as reasoning
- Primary or secondary: Primary as to the author's own reasoning
- Intended use: Second-level thinking; where we are in a cycle as a question rather than a call
- May support: The reasoning, attributed
- Must not support: Any market-timing conclusion
- Citation availability: Memos free and dated
- Edition or stable reference: Memo title and date
- Known bias: A credit investor's temperament, which is more downside-weighted than an equity investor's. **Deliberately included as a counterweight to D1**
- Licensing: Memos free; book purchase
- Priority: 2

**D3. *The Intelligent Investor***
- Author or institution: Benjamin Graham
- Publication date: 1949; revised 4th edition 1973
- Category: Value investing
- Authority level: Foundational for the concept of margin of safety
- Primary or secondary: Secondary
- Intended use: Margin of safety; the defensive-versus-enterprising distinction; price against value
- May support: The principles, attributed
- Must not support: Graham's specific numeric screens as current criteria. They are of their market and its disclosure regime
- Citation availability: Widely held
- Edition or stable reference: **Specify the edition and whether commentary is included** — the Zweig commentary is a different author and must be cited as such
- Known bias: Written for a US market with far worse disclosure and far higher frictions than today's
- Licensing: Book purchase
- Priority: 3

**D4. *Principles for Navigating Big Debt Crises***
- Author or institution: Ray Dalio / Bridgewater
- Publication date: 2018
- Category: Financial crises; monetary history
- Authority level: Moderate. A practitioner framework with case studies, not peer-reviewed
- Primary or secondary: Secondary
- Intended use: The debt-cycle template as **one** lens on where conditions sit
- May support: The described case studies, attributed
- Must not support: The template as a law; any timing claim
- Citation availability: Free PDF, stable
- Edition or stable reference: 2018 edition
- Known bias: A macro school explicitly opposed to bottom-up selection, and a framework built by a firm with a commercial interest in it. **Included because it disagrees with D1 and D3 about what even matters**
- Licensing: Free
- Priority: 3

### Tier E — Interpretive books

**E1. *A Random Walk Down Wall Street***
- Author or institution: Burton Malkiel
- Publication date: 1973; many editions
- Category: Portfolio construction
- Authority level: Moderate; a well-argued position
- Primary or secondary: Secondary
- Intended use: **The case that all of Tier D is largely luck.** The efficient-markets and indexing counterweight
- May support: The argument, attributed
- Must not support: That active management cannot work, as a settled fact
- Citation availability: Widely held
- Edition or stable reference: Edition matters; figures update
- Known bias: A committed efficient-markets position. That is precisely why it is here
- Licensing: Book purchase
- Priority: **1 — highest.** Without it, this corpus is four value investors agreeing with each other

**E2. *Thinking, Fast and Slow***
- Author or institution: Daniel Kahneman
- Publication date: 2011
- Category: Behavioral finance
- Authority level: High for the author's own experimental work
- Primary or secondary: Secondary
- Intended use: How the subject's own reasoning fails, particularly under loss
- May support: Loss aversion, anchoring, overconfidence — attributed, with the caveat below
- Must not support: The priming literature discussed in the book. **Several of those studies failed to replicate, and Kahneman himself publicly acknowledged the chapter overstated the evidence.** Cite the primary study, not the book, for any specific effect
- Citation availability: Widely held
- Edition or stable reference: 2011
- Known bias: Written before the replication crisis was fully understood
- Licensing: Book purchase
- Priority: 2

**E3. *The Black Swan***
- Author or institution: Nassim Nicholas Taleb
- Publication date: 2007; second edition 2010
- Category: Risk and uncertainty
- Authority level: Moderate; a strong argument, not an empirical study
- Primary or secondary: Secondary
- Intended use: Why tail events dominate a long horizon and why models understate them
- May support: The argument about fat tails and model risk, attributed
- Must not support: Any specific portfolio construction as *the* answer
- Citation availability: Widely held
- Edition or stable reference: Second edition, 2010
- Known bias: A polemical voice, dismissive of opposing views. Held at low standing and always attributed
- Licensing: Book purchase
- Priority: 3

**E4. *Family Wealth: Keeping It in the Family***
- Author or institution: James E. Hughes Jr.
- Publication date: 2004 (expanded edition)
- Category: Intergenerational wealth; corporate governance (family governance)
- Authority level: Moderate; practitioner experience, not empirical
- Primary or secondary: Secondary
- Intended use: **Why capital fails to survive three generations** — governance, preparation of heirs, and the human capital the balance sheet does not show
- May support: The framework, attributed
- Must not support: The "shirtsleeves to shirtsleeves in three generations" statistic as established fact. It is folklore with weak provenance, and must never be quoted as data
- Citation availability: Widely held
- Edition or stable reference: Expanded edition, 2004
- Known bias: Drawn from wealthy Western family-office practice; structures and law differ materially in the UAE
- Priority: 2 — closest to the stated objective of anything on this list

---

## 3. The disagreements, on purpose

If these sources agreed, the corpus would be a position rather than a library.

| Question | One side | The other |
|---|---|---|
| Can selection beat the market? | D1, D3 | E1 |
| Does the cycle matter, or only the business? | D2, D4 | D1, D3 |
| Bottom-up or macro? | D1, D3 | D4 |
| Are historical returns a guide? | B3, C1 | E3 |
| Are behavioural findings solid? | E2 | E2's own replication caveat |

**No author on this list is treated as settled.** Where a briefing leans on one,
the disconfirmation requirement (KNOWLEDGE_POLICY.md §4) obliges a search for
the opposing entry, and the table above is where that search starts.

---

## 4. The shape of a historical analogy

No analogy may be published without all five, in this order:

1. **What is similar** — the specific mechanism, not the mood.
2. **What is materially different** — always populated. If nothing differs, the comparison has not been examined.
3. **Why the precedent is relevant** — to *this* decision, or it does not appear.
4. **The limits of the comparison** — where it stops holding.
5. **The exact supporting citations** — source, edition, page or section.

Any analogy missing any of the five is not published. There is no shortened form.

---

## 5. What this founding twenty does not cover

Stated because a list that does not name its gaps reads as complete.

- **Gulf-specific interpretive scholarship is thin.** A1, A2 and B1 carry the
  category and are all data or institutional analysis. There is no regional
  economic or financial history here, and I have not proposed one rather than
  name a title I cannot verify. Worth two or three additions in a second round.
- **Shariah-compliant investment is absent entirely.** If it is in scope, the
  primary source is AAOIFI's standards, and that is a Tier A addition rather
  than an interpretive one. **This is a question, not an assumption** — it was
  raised earlier and has not been answered.
- **Property is thinly covered** for a household holding a majority of its net
  worth in one flat. B3 is the only source with residential returns at this
  horizon, and its sample excludes the UAE.
- **Nothing here is about tax or succession law in this jurisdiction.** That is
  correct — `domain_rule` knowledge expires and is jurisdictional, and NeoOS
  identifies what to ask a professional rather than concluding.
- **No source is younger than 2019** except the continuing series. Deliberate:
  current commentary is the least useful knowledge for a generational objective.

---

## 6. What is being asked

1. **Approve, amend or reject** the twenty, individually or as a set.
2. **Answer the Shariah question**, since it changes Tier A.
3. **Confirm the drop candidate.** B4 (corporate governance) is the weakest fit
   for this household and is the first to go if the set should be smaller.

On approval, ingestion builds the knowledge record shape from KNOWLEDGE_POLICY.md
§3 for the approved subset only, verifying every date, edition and reference
against the artefact. **Nothing is ingested, and no historical claim is made,
before that.**
