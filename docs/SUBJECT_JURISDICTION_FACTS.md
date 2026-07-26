# Subject jurisdiction facts — stated, and what may be inferred

Recorded 2026-07-26. Revised 2026-07-26 to separate what was said from what was
inferred from it.

---

## 0. Why this document was revised

The first version recorded the subject's four answers correctly and then drew
conclusions from them that were written as findings. Sentences like *"remitting
to Nepal is close to irreversible"* and *"the immobile pool's purchasing power is
governed by monetary policy set in Delhi"* are reasonable inferences. They are
not established facts, nobody verified them, and written in the declarative they
are indistinguishable from verified ones.

The reasoning was sound. The labelling was not, and the labelling is what a
reader relies on.

**Nothing here is deleted. The two-pool model is retained** — as a provisional
planning model whose legal and operational assumptions are unverified.

---

## 1. The five levels

Every statement below carries one. Implemented in
`src/domain/knowledge/epistemic-status.ts`.

| Level | Meaning | May carry material guidance |
|---|---|---|
| **Verified external fact** | Confirmed against a named official source with a resolvable citation and retrieval date | Yes |
| **Governing domain rule** | A law or regulation, with jurisdiction and as-of date, stated subject to verification | Yes |
| **Subject-stated fact** | What you told us. Recorded faithfully, not independently checked | Yes |
| **Calculated consequence** | Arithmetic on the above. No stronger than its weakest input | Yes |
| **Provisional inference** | A reasonable implication drawn from something unverified | **No** |

**An inference from a subject statement is a provisional inference, never a
subject-stated fact.** You reporting your own position is one thing; a conclusion
about what the law permits, drawn from that report, is another.

---

## 2. What was stated

All four are **subject-stated facts**. None has been verified. All are
time-sensitive: rules change, and a rule that has changed is worse than no rule
because it may be acted on.

| # | Question | Answer |
|---|---|---|
| 1 | May you hold assets abroad? | Yes |
| 2 | Can money be sent out of Nepal? | "I cannot legally send much money outside Nepal" |
| 3 | NPR exchange-rate regime | Pegged to INR |
| 4 | Succession intent | Property goes to wife and son |

**Review by 2027-07-26**, or sooner on any sign of change.

---

## 3. What may provisionally be inferred

Each entry gives: what you stated · the provisional implication · what would
confirm it · when it lapses. None may carry material allocation guidance until
its evidence is obtained.

### 3.1 Two pools — retained as a provisional planning model

**Stated:** you may hold assets abroad, and cannot legally send much money out of
Nepal.

**Provisional implication:** based on your current unverified understanding,
capital already held outside Nepal and capital held inside it may not be freely
interchangeable, and may be better planned as two pools with different
deployability. This remains provisional until verified against current Nepal
Rastra Bank foreign-exchange rules and any other relevant official authority.

**Evidence required:** Nepal Rastra Bank foreign-exchange regulations; any
outward-remittance allowance, approval route or threshold; whether limits differ
by residence, citizenship or purpose.

**Lapses:** 2027-07-26, or on any regulatory change.

**Cannot yet support:** any allocation instruction that depends on Nepal-held
capital being unavailable, and any figure presented as the amount that cannot be
deployed.

> **What was previously written as a finding:** "Nepal-held capital cannot
> materially leave the country." Not established. It is one reading of your
> answer, and "not much" may mean an annual allowance, an approval route, or a
> near-total bar. Those are materially different situations.

### 3.2 Remittance reversibility

**Stated:** as above.

**Provisional implication:** transferring capital into Nepal may reduce future
international deployability. Worth surfacing before such a transfer so the
question is asked rather than assumed either way.

**Evidence required:** whether funds remitted in may later be remitted out, under
what conditions, and whether the treatment differs by source of funds.

**Lapses:** 2027-07-26.

> **Previously written as a finding:** "Remitting to Nepal is close to
> irreversible" and "every transfer home is a permanent allocation". Neither was
> established. "Close to irreversible" is a strong claim that requires knowing
> the outward rules, which is precisely what is unverified.

### 3.3 NPR monetary conditions

**Stated:** NPR is pegged to INR.

**Provisional implication:** if the peg holds as described, NPR monetary
conditions may be substantially influenced by conditions in the anchor economy.
The strength of that transmission depends on the peg's mechanism, the degree of
capital-account openness, and how the arrangement has actually behaved — none of
which is established here.

**Evidence required:** Nepal Rastra Bank publications on the exchange-rate
arrangement — rate, mechanism, start date, and how it has held.

**Lapses:** 2027-07-26.

> **Previously written as a finding:** "the immobile pool is governed by monetary
> policy set in Delhi." Overstated in two ways: it asserted the peg as fact, and
> it asserted complete transmission. Peg arrangements vary, and transmission
> under capital controls is a live question in the literature rather than a
> given — which is why K1.3 and K2.3 are proposed for the corpus, and why they
> disagree with each other.

### 3.4 Succession

**Stated:** property goes to wife and son.

**Provisional implication:** this is an **intention**. Whether it is also the
outcome depends on a valid instrument under the law that would administer the
estate. NeoOS does not give legal advice and states this as a question for a
professional.

**Evidence required:** whether a written will exists, valid where the property
sits; how Nepali succession law would treat the estate absent one.

**Lapses:** on any change in family circumstances, or 2027-07-26.

**A calculated consequence, not an inference:** a wife and a son exist and are
not in the household data. Dependents change the reserve, the horizon, tolerable
drawdown and what preservation means. This one is arithmetic on what you told us,
and it holds regardless of the legal position.

---

## 4. What the system does with this

1. **Plans around two pools, provisionally**, and says so wherever it changes an
   answer. `outboundCapitalMobility` is recorded per jurisdiction with
   `verifiedWithProfessional: false`, and that flag is the difference between a
   planning assumption and a fact.
2. **Never quotes any of it as law.**
3. **Surfaces the question before an outbound transfer** to a jurisdiction the
   subject has flagged, rather than asserting the consequence.
4. **Withholds material allocation guidance** that would depend on an unverified
   premise.
5. **Does not present a deployable figure** that silently assumes the restriction
   is real; immobile value is reported separately and labelled provisional.

---

## 5. Verification queue, in priority order

1. **The actual outward position from Nepal** — allowance, approval route, or
   bar. This single answer determines whether §3.1 and §3.2 become facts,
   dissolve, or land somewhere in between. *Accountant or lawyer in Kathmandu.*
2. **Whether a valid will exists** for the Nepal property under Nepali law.
3. **The NPR arrangement** from Nepal Rastra Bank — rate, mechanism, history.
4. **Tax treatment of foreign income** for this residence and citizenship
   combination.

Until 1 is answered, the two-pool model is how NeoOS plans, and it is labelled
provisional in every place it appears.
