# Country source packs

Jurisdictional evidence: which countries matter to this position, why, and how
deeply.

Companion to KNOWLEDGE_CORPUS_PROPOSAL.md. Governed by EVIDENCE_POLICY.md.

---

## 1. The correction this implements

The founding corpus put the Central Bank of the UAE and the UAE statistics
agency in **Tier A of the permanent knowledge corpus**, at highest priority.
That was two errors stacked.

**A category error.** A central bank's statistics release is a fact about a
country in exactly the way a filing is a fact about a company. It is *evidence*.
The knowledge corpus holds understanding that exists independently of any asset
or place — principles, precedents, research. A statistics agency belongs in
neither the same list nor the same system, and putting it there is what made
"permanent priority" feel wrong: it was in the wrong system entirely.

**A geographic error, following from the first.** Once national institutions
were treated as permanent knowledge, the country the subject happens to live in
acquired permanent standing. Nothing justifies that. Residence is a fact about
where someone sleeps, not a statement about where capital belongs.

So: national institutions move out of the corpus and into **packs** — dynamic
evidence modules that activate on a hook in the declared position and carry no
standing at all without one.

---

## 2. Three concepts, never conflated

| | What it is | What it determines |
|---|---|---|
| **Residence** | Where the subject lives and spends | The spending base and the local price level the plan is measured against |
| **Home country** | Where family, property, inheritance and obligation sit | Planning depth |
| **Opportunity universe** | Everywhere capital could go | Nothing about the first two |

A single "country" field collapses all three, and the collapse is not cosmetic.
It hides the question a cross-border household most needs answered: **which body
of law actually reaches this capital.** Citizenship frequently governs what may
be owned abroad regardless of residence; tax residence may be neither and may be
plural.

Implemented as `jurisdictionContext` in intake schema v6.1 — residence, home
country, citizenships, tax residences, and whether the subject expects to return
home to live. That last one decides which price level a decades-long plan should
be measured against, and getting it wrong can be wrong by a wide margin.

---

## 3. Source classes

The class is permanent. The institution filling it is not.

| Class | What it covers |
|---|---|
| **A1** | Relevant national central bank |
| **A2** | Relevant national statistics agency |
| **A3** | Relevant securities regulator and exchange |
| **A4** | Relevant tax, legal and property authorities |
| **A5** | Global institutional — IMF, BIS, World Bank, OECD |
| **A6** | US Federal Reserve, FRED, BLS, where USD or global benchmark conditions are relevant |

A5 and A6 load with every pack. Global institutional data and dollar conditions
bear on every jurisdiction, and on a **pegged** one they bear on it most — the
peg is the transmission mechanism, so ignoring the anchor currency's conditions
is ignoring the thing actually setting local monetary policy.

---

## 4. Activation and depth

A pack activates on a hook. No hook, no pack.

| Trigger | Depths it justifies |
|---|---|
| Residence | constraint, planning |
| **Home country** | **planning only** |
| Citizenship | constraint |
| Tax residence | constraint |
| Asset held there | constraint, opportunity |
| Business owned there | constraint, planning, opportunity |
| Liability owed / income sourced / custodian domiciled | constraint |
| Dependent supported / obligation payable / succession administered | planning |

**Depths are a set, not a scale.** They are not nested and a jurisdiction can
need one without the others.

| Depth | What gets loaded |
|---|---|
| **Constraint** | Can capital enter and leave, who may own what, what is taxed, what is reportable. Whether a plan is possible at all |
| **Planning** | Inheritance, succession, property registration, family obligation flows. How a plan should be shaped over decades |
| **Opportunity** | Market data, listed instruments, regulator disclosure. **Only where capital is actually held or being considered** |

The load-bearing line: **home country earns planning depth and explicitly not
opportunity depth.** Being from somewhere is not a reason to invest there. That
single rule is what stops this architecture becoming home bias with citations
attached.

Executable in `src/domain/jurisdiction/packs.ts`; pinned by 13 tests.

---

## 5. Nepal source pack

Activated by: home country, citizenship, supported family, and any Nepali asset,
business or obligation.

**Not yet built. Every institution below is a name to verify, not a citation.**

| Class | Source |
|---|---|
| A1 | Nepal Rastra Bank — monetary policy, FX regime, balance of payments, remittance inflows, banking statistics |
| A2 | National Statistics Office — CPI, national accounts, household survey |
| A3 | Securities Board of Nepal (SEBON); Nepal Stock Exchange (NEPSE) |
| A4 | Ministry of Finance; Inland Revenue Department; Ministry of Land Management and land-registration records; foreign-investment and foreign-exchange rules |

### What this pack must establish, as questions

Framed as questions because I do not have verified answers and will not assert
one. Several are potentially decisive.

1. **May a Nepali citizen or resident legally hold assets abroad, and under what
   approval?** If outward capital movement is restricted, this is the largest
   single constraint on the entire strategy — larger than any allocation
   question, and it would reshape the plan rather than adjust it.
2. **What is the NPR exchange-rate regime?** If NPR is pegged, to what, at what
   rate, since when, and by what mechanism. Note this would make **two** pegged
   currencies in the picture, neither floating: a spending base and a home base
   whose monetary conditions are both set elsewhere.
3. **Is capital sent home repatriable?** Money remitted may be a one-way door.
   For a generational objective, an asset that cannot be moved out is a
   different asset from one that can.
4. **Succession and inheritance law** for citizens and for property held there.
5. **Foreign and non-resident ownership rights**, particularly land.
6. **Tax residence rules and treatment of foreign income.**

Until answered, NeoOS states them as unknown. It does not assume the permissive
reading, and it does not assume the restrictive one.

---

## 6. UAE source pack

Activated by: residence, tax residence, and any UAE asset, income or obligation.

**Not yet built.** Same standard as above.

| Class | Source |
|---|---|
| A1 | Central Bank of the UAE — peg, base rate, monetary and banking statistics |
| A2 | Federal Competitiveness and Statistics Centre — CPI, national accounts |
| A3 | Securities and Commodities Authority (SCA); Abu Dhabi Securities Exchange (ADX); Dubai Financial Market (DFM) |
| A4 | Federal Tax Authority; Dubai Land Department and the emirate-level land registries; ownership and freehold-zone rules |

### What this pack must establish

1. The peg — rate, mechanism, start date — and what it implies for imported
   monetary conditions.
2. Domestic price level, with the **housing weight** in the basket, since rents
   dominate the cost of living here and may not match this household's spending.
3. Personal and corporate tax position, including recent changes.
4. Property ownership rules by emirate and freehold zone.
5. Succession treatment for non-citizens, and whether it defaults to local law
   absent an instrument.

Note the pack loads at **constraint and planning** depth from residence. It does
not get opportunity depth unless something is actually held here. Living
somewhere is not a reason to buy its market.

---

## 7. Global core

Always on, at every depth. These are not a country pack — they are the baseline
against which country packs are read.

| Class | Source | Provides |
|---|---|---|
| A5 | IMF | Article IV consultations, World Economic Outlook, International Financial Statistics |
| A5 | BIS | Annual Economic Report, credit and liquidity statistics |
| A5 | World Bank | World Development Indicators; migration and remittance data |
| A5 | OECD | Where a relevant jurisdiction is a member |
| A6 | US Federal Reserve / FRED | Policy rate, yields, dollar liquidity conditions |
| A6 | US BLS | CPI-U, as the USD purchasing-power reference |

A6 is included as the **global benchmark**, not because any subject is
dollar-pegged. Dollar conditions price risk everywhere. Where a subject *is*
pegged to the dollar, A6 stops being background and becomes the mechanism —
and even then it evidences monetary conditions, never the local price level.

---

## 8. Other packs

Loaded when an asset, liability, residence, business, obligation, custodian or
opportunity creates the hook. Nothing is pre-loaded on a guess about where
someone might invest.

A pack that activates at **opportunity** depth requires A3 before any holding
there can be priced. If the exchange or regulator cannot be reached, the holding
is `unsupported` for market valuation and carries the subject's own figure —
the existing behaviour for unpriceable assets, and it applies to a whole
jurisdiction the same way.

---

## 9. Priority logic

> **Personal context determines constraints.
> Home-country context determines planning depth.
> Global evidence determines opportunity.**

**No jurisdiction carries an investment prior.** Not home, not residence, not
anywhere. No country is preferred and none is penalised.

### The firewall

Country relevance **may** affect: currency risk · inflation exposure · taxation
· regulation · capital controls · ownership rights · custody · liquidity ·
political risk · inheritance · family obligations · access · transaction costs.

Country relevance **must not** override: valuation · margin of safety · business
quality · downside risk · portfolio fit · evidence quality.

Stated as the rule it actually is:

> **Country context is to allocation what knowledge is to valuation: it may
> shape what is permitted and what is risky, never what something is worth.**

The same shape as KNOWLEDGE_POLICY.md §1, for the same reason. Without it,
"home market" becomes a reason to buy and "foreign" becomes a reason not to,
and both are home bias wearing a citation.

Enforced in code: `COUNTRY_RELEVANCE_CHANNELS` and `COUNTRY_MUST_NOT_OVERRIDE`
are exported constants, and a test asserts the two sets never intersect.

### Ordering within a pack

By what the hook demands, not by country importance:

1. Anything that determines whether capital can move at all.
2. Anything that determines ownership rights and inheritance.
3. Taxation.
4. Price level and monetary conditions.
5. Market data — opportunity depth only.

A pack at constraint depth stops after 3.

---

## 10. What is not built

Honest inventory. None of the packs exist as adapters; this document specifies
them.

- **No pack is implemented.** Activation, depth and the firewall are built and
  tested; the adapters that fetch from these institutions are not.
- **Nepal's sources are the least verified.** Institution names need checking,
  and machine-readable access may not exist — the honest starting point is
  manual import at `manual_verified`, which is a real state rather than a
  degraded one.
- **No jurisdiction risk scoring exists**, deliberately. A single "country risk
  score" would collapse the thirteen channels into one number and immediately
  become the country preference this document forbids.
