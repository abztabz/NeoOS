# NeoOS — status report

26 July 2026 · branch `claude/adding-more-files-y6s0vh` · commit `4cd2ef7`

---

## 1. Where this stands, plainly

NeoOS is a carefully built instrument that has not yet measured anything.

The architecture is sound and tested. The evidence discipline is real rather
than aspirational. The engine retrieves live SEC filings and produces
fundamental analysis from them, verified in production. The intake form, the
calculated profile, the drift layer, the jurisdiction packs and the
purchasing-power layer are all built and green.

**No financial position has ever been entered.** Everything personal — net
worth, reserve coverage, deployment status, drift, structural risk — currently
reports "not known", correctly. That single gap is worth more than everything
else on the open list combined.

---

## 2. The question

> Where is the best place to allocate my money to advance generational wealth
> creation and preservation?

Two answers daily: the best marginal allocation, and the largest unaddressed
risk. Allocation dominates selection — over decades the split between asset
categories swamps the choice of instrument inside any one of them.

Preservation is a first-class output, not a lower score. A system optimising
for return treats a 5% gain and a 5% loss as symmetric. A system serving a
family does not: the loss that ends the plan matters more than the gain that
improves it.

---

## 3. What is built and verified

| Capability | State | How verified |
|---|---|---|
| Evidence and decision engine | Working | 108 unit tests; deterministic, explainable |
| SEC EDGAR retrieval | Working in production | Live run: 81 records ingested, 0 rejected, `partial_live` |
| Fundamental analysis from filings | Working | Derived factors from real filed accounts |
| Append-only persistence | Working | Verified against real PostgreSQL 16, superuser and non-superuser |
| Ed25519 signing | Working | Round trip, tamper detection, forged-signature distinction |
| Intake form and schema v6.2 | Working | Verified end to end against real Postgres + real token |
| Calculated profile, 11 outputs | Working | 43 tests |
| Provenance propagation | Working | Weakest-link rule enforced and tested |
| Personalisation gating | Working | Three states; `available` requires three conditions at once |
| Drift and structural risk | Working | 34 tests |
| Jurisdiction packs and firewall | Working | 15 tests; firewall enforced as exported constants |
| Purchasing-power domain | Working | 26 tests |
| Epistemic status | Working | 15 tests |

**Gates:** lint · typecheck · 615 unit tests · 249 Playwright · production build.
All passing.

---

## 4. What is built but not yet doing anything

Honest inventory. These exist, are tested, and have no data.

- **The intake form** has no profile in it.
- **The purchasing-power layer** has no observations. Nothing fetches statistics
  — the build environment has no outbound network, proven with a control.
- **Country packs** are specified for Nepal and UAE; no adapter exists.
- **The knowledge corpus** has 30 proposed sources and **none is ingested**. No
  historical claim is active.
- **Production** runs an earlier state. `main` contains none of this work.

---

## 5. What is settled

Architecture decisions that later work must not quietly undo.

**Evidence versus knowledge.** Two registries, never merged. A valuation
textbook cannot supply a value; a central bank's rate today cannot become a
universal principle.

**Provenance travels with every number.** Five kinds — user fact, calculated,
user assumption, model assumption, missing. A result is never stronger than its
weakest input, because uncertainty propagates through arithmetic even though
decimal places do not show it.

**Missing is missing.** No figure is defaulted, inferred, or filled with a
plausible midpoint. A gap is never treated as a zero.

**Append-only everywhere.** Reports, journal, decisions, outcomes, intake
profiles. Corrections supersede; nothing is edited in place. Enforced by
database trigger.

**The jurisdiction firewall.** Country context may shape what is permitted and
what is risky, never what something is worth. No country carries an investment
prior — not residence, not home.

**Nominal is not real.** A nominal fall may support a real-erosion warning
because unless prices fell it is a real fall of at least the same size. A
nominal rise stays neutral without a price index for the right jurisdiction.

**Epistemic status is separate from provenance.** An inference from a subject
statement is a provisional inference, never a fact, and may not carry material
allocation guidance alone.

---

## 6. What is provisional

Four subject answers, recorded and unverified. All are used for planning; none
may be quoted as law.

| Stated | Provisional implication | Confirms it |
|---|---|---|
| May hold assets abroad | — | — |
| Cannot legally send much money out of Nepal | Capital inside and outside may not be freely interchangeable; better planned as two pools | Nepal Rastra Bank foreign-exchange rules |
| NPR pegged to INR | If the peg holds as described, NPR conditions may be substantially influenced by the anchor economy | Nepal Rastra Bank publications |
| Property goes to wife and son | An intention. Whether it is the outcome depends on a valid instrument | Whether a valid will exists under Nepali law |

**The two-pool model is retained in full** as a provisional planning model. It
is labelled provisional everywhere it appears, and the system will not present a
combined deployable figure that silently assumes the restriction is real.

One consequence is *not* provisional: **a wife and a son exist and are not in the
household data.** That is arithmetic on what was stated, and it holds regardless
of the legal position. Dependents change the reserve, the horizon, tolerable
drawdown and what preservation means.

---

## 7. What is blocked on you

Ordered by value.

**1. Enter your position.** ~30 minutes. Assets and income alone move guidance
from *unavailable* to something real. Blanks are fine — the panel says what each
one costs. This unlocks everything.

**2. Verify the Nepal outward position.** An allowance, an approval route, or a
bar. That single answer decides whether the two-pool model becomes fact,
dissolves, or lands between. An accountant or lawyer in Kathmandu; slow, so
start it.

**3. Approve the corpus.** 30 sources. Nothing ingests until you do, and the
historical-precedent layer stays dark.

**4. Paste a CPI release.** I cannot fetch. With real UAE figures the
purchasing-power layer runs against data instead of fixtures.

**5. Confirm the deploy branch.** `main` has none of this.

---

## 8. Honest limitations

Stated because a status report that omits them is marketing.

- **No authentication beyond a shared operator token.** Right-sized for one
  person's own tool. Not what a client-facing deployment needs.
- **Append-only is a guardrail, not a wall.** Anyone who can `ALTER TABLE` can
  disable the trigger.
- **Signing proves origin and integrity, not honesty.** A key holder can sign a
  false report.
- **No source has been verified against its artefact.** Every uncertain field in
  the corpus carries a marker. Two entries are `research required before
  nomination`.
- **The build environment has no outbound network.** All provider work is done
  against fixtures; live verification happens in production.
- **Nothing here is financial, legal or tax advice**, and the system is built to
  identify what to ask a professional rather than to conclude.

---

## 9. Defects found and fixed

Recorded because they are the evidence that the discipline is real.

| Defect | How it surfaced |
|---|---|
| Three unit vocabularies; 70 of 78 records rejected | First live SEC run |
| Magnitudes losing their values in normalization | Pipeline seam test |
| Annual accounts expiring at 240 days | First live run — no company valuable from its own audited accounts for most of the year |
| No factor scores derivable from filings | Critical-gate failure on live data |
| `REVOKE UPDATE, DELETE` breaking every foreign-key insert | Running the suite as a non-superuser for the first time |
| Intake route missing `migrate()` | First real request against a fresh database |
| Nominal rise reported as an opportunity | Design review against the purchasing-power gap |
| "Largest share" concentration understating drift by two thirds | A test written against the intended behaviour |
| Trapped capital counted as deployable | Your answers 1 and 2 |
| Inferences written as findings | Your revision instruction |

Six of these were invisible to the unit suite and surfaced only against real
data, a real database, or a real answer from you.

---

## 10. What comes next

In order, once you have entered a position:

1. **The two-answer Morpheus briefing** — best marginal allocation, largest
   unaddressed risk. The product's actual output.
2. **Morpheus-first home screen.** The briefing leads; scores go behind
   progressive disclosure.
3. **Statistics manual import**, so a nominal figure becomes a real one.
4. **Country pack adapters**, starting at constraint depth.
5. **Corpus ingestion**, on approval, in the order in `INGESTION_ORDER.md` —
   disconfirmation sources first, deliberately, because a library that learns
   its optimists before its sceptics is briefly dangerous.

---

## 11. One-line summary

The instrument is built, tested and honest. It is waiting for a position to
measure and four facts to verify.
