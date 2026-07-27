# NeoOS — status report

26 July 2026 · branch `claude/adding-more-files-y6s0vh` · commit `4cd2ef7`

---

## 1. Where this stands, plainly

NeoOS is a carefully built instrument that has not yet measured anything.

The architecture is sound and tested. The evidence discipline is real rather
than aspirational. The engine retrieves live SEC filings and derives accounting
and operating factors from them, verified in production — one input to a
valuation rather than a valuation. The intake form, the
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
risk.

**Allocation is considered before instrument selection** because the division of
capital across liquidity, productive assets, property, defensive assets and
liabilities usually has a larger and more persistent effect on long-term
outcomes than choosing between similar instruments within one category.

This is not absolute. Security quality, valuation, leverage, fees, fraud,
illiquidity and permanent-loss risk may dominate in individual cases. Allocation
before selection is the product's **sequence**, not a claimed empirical law.

Preservation is a first-class output, not a lower score. A return-focused system
may treat equal-sized upside and downside movements as comparable observations.
A family-wealth system must account for their asymmetric consequences,
especially when a loss impairs liquidity, forces selling, increases ruin risk or
breaks the long-term plan.

---

## 3. What is built and verified

"Working" is not one thing. The evidence state says what kind of verification
stands behind each row.

| Evidence state | Meaning |
|---|---|
| **Production verified** | Exercised against real infrastructure in the deployed environment |
| **Integration verified** | Exercised against real infrastructure locally — a real database, a real server, a real token |
| **Unit verified** | Tested in isolation. Correct by its own contract |
| **Architecture only** | Built and tested; never exercised against real inputs |
| **Inactive — no data** | Complete and correct, with nothing to operate on |

| Capability | Evidence state | Basis |
|---|---|---|
| Evidence and decision engine | Unit verified | 108 tests; deterministic, explainable |
| SEC EDGAR retrieval | **Production verified** | Live run: 81 records ingested, 0 rejected, `partial_live` |
| Filing-derived fundamental factor analysis | **Production verified** | Derived factors from real filed accounts. See the scope note below |
| Append-only persistence | **Integration verified** | Real PostgreSQL 16, superuser and non-superuser roles |
| Ed25519 signing | Unit verified | Round trip, tamper detection, forged-signature distinction |
| Intake form and schema v6.2 | **Integration verified** | End to end against real Postgres and a real token |
| Calculated profile, 11 outputs | Unit verified · **inactive — no data** | 43 tests |
| Provenance propagation | Unit verified | Weakest-link rule enforced |
| Personalisation gating | Unit verified · **inactive — no data** | Three states |
| Drift and structural risk | Unit verified · **inactive — no data** | 34 tests |
| Jurisdiction packs and firewall | Unit verified | 17 tests; firewall enforced as exported constants |
| Purchasing-power domain | Unit verified · **inactive — no data** | 26 tests |
| Epistemic status and approval staging | Unit verified | 21 tests |

### Scope of the filing-derived analysis

It currently:

- derives deterministic accounting and operating factors from available SEC
  filings;
- uses real filed accounts where available.

It does **not** by itself establish complete intrinsic value, management
quality, competitive durability or portfolio suitability. Those need the
valuation methods, the business-quality reasoning and the position context that
the corpus and the profile are meant to supply, and none of that is active.

Neither understated nor overstated: the factor derivation genuinely works
against real filings, and it is one input to a valuation rather than a
valuation.

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

**The jurisdiction firewall.** No country receives an automatic investment
preference because it is the subject's residence, home country or emotional
anchor.

Verified jurisdictional conditions may affect ownership rights, cash flows,
taxation, currency convertibility, transferability, discount rates and risk.
They may therefore affect value. What they must not create is an unsupported
country premium, an automatic country penalty, or an override of asset-specific
evidence.

An earlier version said country context may *never* affect what something is
worth. That was an over-correction and economically wrong: a verified capital
control genuinely reduces realisable value. The invariant is now narrower and
enforced in `mayAffectValuation()` — a verified condition on a valuation-bearing
channel may enter as a cited input; an unverified belief about a country may
not move a number at all.

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

**A subject-data consistency gap.** A wife and son were stated elsewhere in
conversation but are absent from the household intake. This is a disagreement
between two subject-provided channels — **not an independently verified
household fact**, and not something NeoOS may promote into the profile on its
own.

The earlier version called this "arithmetic on what was stated", which
overstated it. Comparing two records is arithmetic; concluding that the profile
should contain dependents is an inference about the subject's household, and it
carries `provisional_inference` status under KNOWLEDGE_POLICY.md §10. No new
status was minted for it: the observation is a consistency finding, and anything
derived from it is provisional until the intake itself says so.

Once confirmed **in intake**, dependants affect reserve requirements, time
horizon, tolerable drawdown, obligations and preservation needs.

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

**3. Approve the corpus — stage one only.** 30 sources. What you would be
approving is the **title list**, which is the first of six stages and does not
approve the claims inside those titles. See §7a.

**4. Provide or import an official CPI release, as a temporary bridge.** The
environment this was built in blocks outbound requests, so nothing could be
retrieved from here — a restriction of the sandbox, not of the data, which
national statistics agencies publish free. Manual import is a stopgap, not the
production target: that remains a verified official-statistics adapter carrying
source provenance,
release dates, observation periods, vintages, revisions and freshness handling.
The existing rules hold either way — correct jurisdiction only, no substituting
another country's CPI, a nominal rise stays neutral without appropriate
inflation evidence, and `delayed` remains distinct from `unavailable`.

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

0. **Make the intake reachable.** A sequencing error in the previous version of
   this list: step 1 cannot happen until the branch is deployed or another
   route exists. Two routes do exist — see §10a — and one of them needs no
   deployment at all.
1. **Enter the financial position.**
2. **Run and inspect the first calculated profile.**
3. **Resolve critical intake gaps and contradictions** — starting with the
   household consistency gap in §6.
4. **Build the two-answer Morpheus briefing from actual profile data**, not from
   fixtures.
5. **Deploy the current branch to a controlled environment.**
6. **Add official statistics ingestion**, replacing the manual bridge.
7. **Verify Nepal capital-mobility and succession assumptions.**
8. **Verify, approve and ingest the corpus in controlled stages** — the order in
   `INGESTION_ORDER.md` puts disconfirmation sources first, deliberately,
   because a library that learns its optimists before its sceptics is briefly
   dangerous.

**Steps 2 and 3 are a gate, not a formality.** The first calculated profile must
be reviewed before more architecture is added. Submitting the form is not the
signal to begin the next sprint — reading what the system says about a real
position is, and it is the first opportunity to find out whether any of this is
useful.

---

## 11. One-line summary

The instrument is built, tested and honest. It is waiting for a position to
measure and four facts to verify.

---

## 7a. Corpus approval is six decisions, not one

Approving a title list does not approve the claims inside those titles. Staged
in `src/domain/knowledge/approval.ts`.

| Stage | What it decides |
|---|---|
| 1. Proposed | Nothing. Nominated only |
| 2. **List approved** | The operator accepts the title. **Not the claims inside it** |
| 3. Identity verified | Title, author, edition, date, critique history confirmed against the artefact rather than recalled |
| 4. Licensing approved | Access permits the intended use. Some sources may be reference-only |
| 5. Ingestion order approved | Placed in a stage of the plan |
| 6. Ingested | Records exist with resolvable citations |
| 7. **Claims activated** | Morpheus may cite it. A separate decision |

Two rules hold across every stage:

**No source becomes active merely because it appears in an approved proposal.**
Stages advance one at a time; `canAdvance()` refuses jumps, because every
intermediate stage exists because something is checked there.

**A prohibited claim stays prohibited at every stage, including activated.** A
source can be correctly identified, properly licensed, fully ingested, and still
have a claim NeoOS must never repeat — a replication failure, a disputed
threshold, a folklore statistic. Approval of a source never licenses those.

---

## 10a. Two routes into the intake

The previous list put "enter the position" first and "deploy" fifth. That was
wrong: the form is on an undeployed branch, so step 1 depended on step 5.

Either route works, and the first needs nothing deployed.

### Route A — offline, then POST

1. `npx tsx scripts/intake-template.ts` writes `intake-template.json` (blank,
   schema-valid) and `intake-row-examples.json` (fictional rows to copy).
2. Fill it in. **Leave anything unknown blank.** A blank is honest; an invented
   figure cannot be told from a fact later.
3. `npx tsx scripts/intake-check.ts intake-template.json` — runs the same schema
   and the same calculations the server runs. Nothing is sent, nothing stored.
   It prints what would be known, what would still be missing, and what to add
   next.
4. POST the file to `/api/intake` with the operator token, using the same
   Shortcut pattern already used for `/api/cycle/run`.

Step 3 is the useful one. It answers "is this enough to be worth submitting"
before anything is written, and the answer arrives in seconds.

### Route B — the form

Deploy the branch to a controlled environment, open `/intake`, unlock with the
operator token, and fill it in with outputs recalculating as you type.

### Which

Route A if you want to see the shape of the answer before committing anything,
or if deployment is not immediate. Route B if the branch is already building —
the form is better for a first pass because it explains each field as you go.

**Both write through the same validated path**, and both produce an append-only
profile version. Neither can be filled in by anyone but you: this is the one
input in NeoOS that cannot be derived, retrieved or estimated.
