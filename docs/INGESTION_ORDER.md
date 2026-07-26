# Ingestion order

The sequence in which approved sources would enter the corpus, and what must be
true before each stage begins.

**Nothing has been ingested. No stage below has started.**

---

## 0. The gate before any stage

Ingestion does not begin until:

1. The corpus is approved (KNOWLEDGE_CORPUS_PROPOSAL.md §11).
2. The ingestion pipeline exists — it does not today. There is no knowledge
   record store, no citation resolver, and no retrieval path.
3. Each source's ⚠ fields are verified against the artefact.

Stage order below assumes those hold. It is a plan, not a schedule.

---

## 1. Ordering principle

**By what unblocks a NeoOS function, not by importance.** A source that improves
reasoning about a capability NeoOS does not have yet is weight without lift.

Three tests, applied in order:

1. **Does a live function need it?** Valuation reasoning is used the moment a
   holding is assessed. Governance scoring is not used at all.
2. **Does it guard against a failure the system can currently commit?** Home
   bias and long-horizon overconfidence are live risks the moment the intake
   form is populated.
3. **Is it cheap to verify?** Freely available sources with stable citations
   before ones needing licence review.

---

## 2. Stages

### Stage 1 — Disconfirmation first
**K1.2 · K1.5 · K4.1 · K2.1**

Deliberately first, and the ordering is the point. These four are what stop the
corpus becoming a machine that agrees with itself: home bias, the empirical case
against long-horizon equity confidence, the market-efficiency challenge, and the
survivorship correction.

Ingesting the frameworks before their counterweights would create a window in
which NeoOS could reason confidently with nothing to check it. **A library that
learns its optimists before its sceptics is briefly dangerous**, and there is no
reason to accept that window.

Blocked on: K1.5's identity, which is `research required before nomination`. If
it fails verification, Stage 1 proceeds without it and the gap is recorded.

### Stage 2 — Method for what NeoOS already does
**K5.1 · K5.3 · K5.2 · K1.8**

Valuation and financial-statement analysis are functions the engine already
performs against SEC filings. These make the reasoning explicit and checkable.
K5.3 pairs with K5.1 deliberately, so the methodological tension between
cash-flow and accounting-based valuation is present from the start rather than
introduced later as a correction.

### Stage 3 — Currency, mobility and purchasing power
**K1.3 · K1.4 · K2.2 · K2.3**

Directly serves the two-pool question and the purchasing-power layer. K1.3 and
K2.3 enter together because they disagree, and ingesting either alone would give
one side of an open controversy a head start.

### Stage 4 — Portfolio construction and survival
**K5.7 · K1.6 · K1.7 · K5.6**

Expected returns, labour-income-aware allocation, position sizing, market-implied
expectations. These bear on allocation once a position is actually declared.

### Stage 5 — Frameworks and interpretation
**K3.1 · K3.2 · K3.3 · K3.4 · K3.5 · K4.5 · K5.5**

Attributed reasoning, entering only after their counterweights are in place. K3.5
carries severe survivorship and is ingested with that limit attached.

### Stage 6 — Continuity, behaviour and history
**K4.4 · K4.2 · K4.3 · K2.4 · K2.5**

Family continuity, behavioural safeguards, crisis history. K4.2 enters with its
replication caveat attached to the record, not to a footnote.

### Stage 7 — Licence-gated
**K5.4**

CFA Program curriculum, last because it needs a licensing decision rather than a
verification one. If storage is not permitted, it becomes reference-only: cited,
never reproduced.

---

## 3. What each stage must produce

For every source, before it is marked ingested:

- Every ⚠ field resolved against the artefact
- A resolvable citation that a reader could follow
- Permitted and prohibited claims recorded
- Applicability assumptions recorded against the ten dimensions
- Relationships to already-ingested sources recorded **with citations** —
  `isPublishable()` returns false without them
- Known critiques and replication issues verified, not recalled

A source failing any of these stays a proposal. It does not enter partially.

---

## 4. What does not follow ingestion

Ingesting a source does **not** activate historical claim generation. That is a
separate decision requiring:

- the five-part analogy structure (KNOWLEDGE_CORPUS_PROPOSAL.md §4 of the
  previous revision, retained in KNOWLEDGE_POLICY.md);
- the disconfirmation search wired to `counterpartsFor()`;
- a citation resolver that fails closed.

**Ingestion makes claims possible. It does not make them permitted.**

---

## 5. Rollback

A source found to be misrecorded after ingestion is superseded, not edited —
append-only applies to the corpus as it does to everything else. Every briefing
that cited it is identifiable through its citation, and the correction says what
changed rather than quietly replacing it.
