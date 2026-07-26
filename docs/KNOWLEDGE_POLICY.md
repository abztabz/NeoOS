# Knowledge policy

How Morpheus holds and uses what the world already knows.

Governed by MORPHEUS_CHARACTER.md §5b. This document makes it buildable.

---

## 1. The distinction that everything rests on

**Evidence** is a fact about an asset or a position: a filing, a price, a
holding. It answers *what is true of this thing*.

**Knowledge** is understanding that exists independently of any asset: a
principle, a precedent, a rule, a study. It answers *what usually matters, and
what has gone wrong before*.

The two must never merge.

| | Evidence | Knowledge |
|---|---|---|
| Answers | What is true of this asset | What usually matters |
| Enters | Valuation, factor scores, ratings | Reasoning, framing, risk identification |
| Example | Apple's filed revenue | Why revenue concentration is fragile |

### Country evidence is evidence, not knowledge

A central bank's statistics release is a fact about a country in exactly the way
a filing is a fact about a company. It is **evidence**, and it belongs to a
dynamic country pack rather than to this corpus.

The founding corpus got this wrong and put national institutions in its top
tier. Two failures followed from the one category error: a statistics agency
acquired standing it cannot have, and the country the subject happens to live in
acquired permanent priority over everywhere else.

**The corpus is not organised around a preferred jurisdiction. Every source
retains its geographic, institutional, asset-class and market-structure limits.**

That wording replaces "jurisdiction-independent by construction", which was too
strong. A study of US listed equities is not independent of geography merely
because it is not organised around one: it assumes reliable accounting, liquid
markets, enforceable property rights and a disclosure regime much of the world
lacks. Every source records what it assumes across the ten dimensions in
`src/domain/knowledge/applicability.ts`, and NeoOS may not generalise past them
without explicit reasoning.

A `domain_rule` remains the boundary case and resolves the same way: rules
expire, are jurisdictional, and live in packs.

| | Knowledge | Country evidence |
|---|---|---|
| Holds | Principles, precedent, research | Statistics, rules, registry records |
| Scope | Everywhere | One jurisdiction |
| Lifetime | Permanent corpus | Activates on a hook, ages, expires |
| Governed by | This document | EVIDENCE_POLICY.md §7 |

See COUNTRY_SOURCE_PACKS.md.

**Knowledge never enters a valuation or a factor score.** A principle cannot
make a holding cheap. It can explain why cheapness matters, what usually
follows, and what has historically gone wrong. If a principle could move a
score, every recommendation would become arguable from a well-chosen quotation.

---

## 2. Kinds of knowledge

Different kinds age differently, and treating them alike is the same error as
applying a quarterly freshness horizon to annual accounts.

| Kind | Ages | Example |
|---|---|---|
| `durable_principle` | No | Margin of safety; why leverage kills in drawdowns |
| `historical_precedent` | No | 1970s inflation; Japan after 1990; GCC property 2008–09 |
| `empirical_research` | Superseded, not expired | A study on concentration and long-run returns |
| `domain_rule` | **Yes, and jurisdictionally** | UAE succession law; a tax treatment |
| `current_commentary` | Fast | What a strategist thinks about this week |

Two consequences.

**`domain_rule` is the dangerous one.** A tax or succession rule that has
changed is worse than no rule, because the subject may act on it. Every
`domain_rule` carries a jurisdiction and an as-of date, expires, and is stated
as "as of, subject to verification" rather than as settled fact. Morpheus does
not give legal or tax advice; it identifies what to ask a professional about.

**`current_commentary` is the least useful.** It is the most abundant thing on
the internet and the least likely to change a generational decision. It is
carried at the lowest standing and never supports a recommendation on its own.

---

## 3. Citation is absolute

> **Morpheus may reason with general knowledge. It may only assert as evidence
> what it can cite.**

A knowledge record without a resolvable source is not a weak record — it is not
a record. It is rejected at ingestion, exactly as an evidence record with no
`sourceRef` is.

Every knowledge record carries:

| Field | Why |
|---|---|
| `claim` | The idea, stated plainly |
| `attribution` | Who said or established it |
| `sourceRef` | Where it can be read |
| `sourceKind` | Book, paper, filing, regulation, article, transcript |
| `publishedAt` | When |
| `retrievedAt` | When NeoOS obtained it |
| `jurisdiction` | For rules; null otherwise |
| `standing` | How much weight it carries, and why |
| `contradicts` / `contradictedBy` | Links to opposing knowledge |

### Why this rule is not negotiable

A wrong number can be checked. A fabricated authority cannot — it borrows
credibility from a real person who never said it, and the subject has no way to
detect it without doing the research themselves, which is the work they came
here to avoid.

**A misattributed quotation is a worse failure than a miscalculated ratio.**

Model-recalled knowledge with no citation may shape how Morpheus *frames* a
question. It may never appear as a claim, a quotation, or a justification.

---

## 4. Filtering is the trap

The subject's phrase was "filtered and collated to serve our collective
objective." Filtering for **relevance** is what makes a library useful.
Filtering for **agreement** builds a machine that returns whatever supports the
current recommendation, dressed as research.

That failure feels exactly like success. The briefing gets more confident, more
citation-rich, and more wrong.

### Relationships are not binary

Before the disconfirmation rule can work, the relationships it searches must be
modelled honestly. The first version of the map had two columns — "one side" and
"the other" — which produced debates that do not exist and hid the ones that do.

Six kinds, in `src/domain/knowledge/relationships.ts`:

| Kind | Both sides must be shown |
|---|---|
| `agreement` | No |
| `partial_agreement` — same substance, different emphasis | No |
| `different_scope` — they do not actually meet | No |
| `methodological_tension` — same question, incompatible methods | **Yes** |
| `direct_contradiction` — incompatible claims, same scope | **Yes** |
| `unresolved_controversy` — genuinely open | **Yes** |

Every relationship records its topic, kind, scope, citations and any unresolved
ambiguity. **A relationship without a citation is not publishable** — a claim
about what two authors think is still a claim, and recall is not a source for it.

### The disconfirmation requirement

> When knowledge is used to support a conclusion, Morpheus must also search for
> knowledge that argues against it, and report what it found.

- Contrary knowledge found → it is shown, next to the supporting knowledge, not
  buried below it.
- None found → **"no contrary view found"** is stated. That is a finding about
  the search, not about the world.
- **"No contrary view exists"** is never said. It is almost never true.
- The search is scoped by relationship kind: only `methodological_tension`,
  `direct_contradiction` and `unresolved_controversy` oblige both sides to be
  shown. Presenting `different_scope` sources as opposed manufactures a conflict
  and is its own kind of dishonesty.

A knowledge layer that cannot contradict the recommendation it accompanies is a
well-read sycophant, and worse than no knowledge layer, because it makes a
weakly-supported conclusion feel researched.

### The same requirement for country context

When country context supports a conclusion, the contrary case is searched for
and reported the same way. **"It is my home country" is not evidence about an
investment**, and the corpus carries K1.2 on home bias precisely so the counter
is always available.

The trap here is specific: filtering for relevance produces a library, filtering
for familiarity produces a portfolio concentrated in the two countries the
subject happens to know, dressed as local expertise.

---

## 5. Standing, not tiers

Evidence uses a six-tier hierarchy because sources of fact are rankable.
Knowledge is not: a single observation by a great investor can outweigh a
literature review, and often does.

Standing is therefore recorded as a judgement with reasons, not a number:

- **Who** established it, and what their standing rests on.
- **How** it was established: reasoning, observation, data, or assertion.
- **How widely** it is held, and by whom it is disputed.
- **How well it has survived** — a principle that held through several regimes
  is different from one that has only seen this one.

That last point matters most for a generational objective. Anything that has
only been true since 2009 has not been tested.

---

## 6. Sources

Same discipline as the evidence layer, for the same reasons.

**Permitted**

- Primary documents: filings, regulations, central bank publications, official
  statistics.
- Books and papers the operator has added deliberately.
- Publications with a named author and a stable address.

**Refused**

- Content behind a paywall the operator has no licence to.
- Aggregators restating others without attribution.
- Anonymous commentary and forum opinion.
- Anything that cannot be cited to a resolvable location.

**Curated first.** The highest-value corpus is small and deliberate: the books,
essays and papers the operator actually wants Morpheus to reason from. A
thousand scraped articles is a worse library than forty chosen ones, and it is
also far more likely to contain something false.

---

## 7. How knowledge reaches the briefing

Knowledge appears when it changes what the subject should do or understand —
never as decoration.

Legitimate uses:

| Use | Example |
|---|---|
| Framing a risk | "Concentration at this level has historically preceded forced selling in a drawdown." |
| Naming a precedent | "This resembles X. What mattered then was Y." |
| Challenging the recommendation | "The contrary case is Z, argued by W." |
| Identifying a professional question | "This turns on succession law in this jurisdiction. Verify with counsel." |
| Explaining a principle behind a rule | Why the Strong Buy gate demands what it demands. |

Never:

- To pad a briefing that has nothing to say.
- To lend borrowed authority to a weakly-evidenced conclusion.
- To substitute for a missing filing or price.
- As a quotation whose only function is to sound wise.

**If a briefing would be equally good without the knowledge, the knowledge does
not belong in it.**

---

## 8. What this is not

- **Not legal, tax or regulatory advice.** `domain_rule` knowledge identifies
  what to ask a professional, with a citation and an as-of date. It never
  concludes.
- **Not a news feed.** Current commentary is the least useful knowledge for a
  generational objective and is treated accordingly.
- **Not a search engine with a personality.** Retrieval without judgement about
  standing, contradiction and relevance is not knowledge bearing.
- **Not a substitute for evidence.** Ever.

---

## 9. How to know whether it is working

1. Does knowledge appear only when it changes what to do or understand?
2. Can every claim be followed to a source and checked?
3. Does contrary knowledge appear next to supporting knowledge?
4. Do domain rules carry a jurisdiction, a date, and a caveat?
5. Would removing the knowledge layer make the briefings visibly worse — or only
   visibly shorter?

Question 5 is the real test.

---

## 10. Epistemic status: how a statement is known

Distinct from provenance, and the two must not be merged. Provenance answers
*where a number came from*. Epistemic status answers *what standing a statement
has*. Implemented in `src/domain/knowledge/epistemic-status.ts`.

| Status | Meaning | May carry material guidance |
|---|---|---|
| `verified_external_fact` | Confirmed against a named official source | Yes |
| `governing_domain_rule` | A rule, with jurisdiction and as-of date | Yes |
| `subject_stated_fact` | What the subject told us. Not checked | Yes |
| `calculated_consequence` | Arithmetic on the above | Yes |
| `provisional_inference` | Drawn from something unverified | **No** |

### The rule that makes it work

**An inference from a subject statement is a provisional inference, never a
subject-stated fact.** The subject reporting their own position is one thing; a
conclusion about what the law permits, drawn from that report, is another.

The failure this prevents is easy to miss because the reasoning is usually
sound. A subject says "I cannot send much money out of my home country". A
correct inference follows about deployability. Written down without its status,
that inference reads as a fact about the law — which nobody established, and
which may be wrong or out of date. The reasoning was fine; the labelling was
not, and the labelling is what a reader relies on.

### What every weak statement must carry

`provisional_inference` and `subject_stated_fact` records carry:

- what the subject actually stated;
- the provisional planning implication, phrased so it cannot read as settled;
- the evidence that would confirm it;
- an expiry or review condition;
- the fact that material allocation guidance may not depend on it until verified.

A provisional inference with no stated route to confirmation becomes
indistinguishable from a fact within weeks. That is precisely how an unverified
premise turns load-bearing.

See SUBJECT_JURISDICTION_FACTS.md for the worked application.
