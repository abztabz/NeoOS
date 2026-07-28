# Conversational architecture

Morpheus leads. Workspaces support. Evidence remains inspectable.

---

## 1. The gap this closes

The repository specification never defined a conversational interface. The six
workspaces, the gauge, the score cards and the action board were all built to
spec, and the spec described a dashboard.

That is a missing product requirement rather than an implementation regression,
and it is now controlling: the primary NeoOS experience is Morpheus-led and
conversational. The six workspaces remain, intact, as supporting analytical
routes. Nothing was removed.

---

## 2. Deterministic, not generative

**There is no language model behind any of this.** Every answer is a
deterministic function of `ProfileCalculations` — the same object the workspaces
render — and of the current report. Ask the same question twice against the same
position and you get the same words, offline.

That constraint is what makes conversation safe here. Nothing in this layer
generates a number, softens a refusal, or infers a fact. When the domain cannot
compute something, Morpheus says what he cannot tell you and what would change
that, in a sentence.

Where a generation path is not connected, the interface and response contract are
built honestly and preview content carries a visible marker. A preview that does
not announce itself is a fabrication.

---

## 3. The answer contract

`src/domain/morpheus/answer.ts`. Two halves, always:

**Visible prose**, in this order: conclusion, why it matters, action,
uncertainty, evidence. Only the first two are mandatory — forcing every answer
into a fixed template is what makes a system sound like a form rather than an
adviser.

**`StructuredDecision`**, unchanged by how the prose is worded: recommendation,
confidence, evidence with provenance, weakest provenance, risks,
disconfirmation, next action. This is what gets stored, audited and compared
over time.

`disconfirmation` defaults to a stated fallback rather than an empty array. An
answer that cannot say what would make it wrong has not been thought through,
and the absence should be visible.

---

## 4. Voice

`src/domain/morpheus/voice.ts`. Four rules, each because its opposite is a
specific failure:

- **Lead with the conclusion.** Burying it under caveats makes the reader do the
  judging, which is the work they came to delegate.
- **Name the consequence, not the field.** "I can't tell you how much is safe to
  invest" beats "blocking fields: dependants".
- **Never sound certain about something provisional**, and never sound mechanical
  about being uncertain.
- **No internal vocabulary in a visible sentence.** No status codes, no
  provenance enum names, no "personalisation unavailable".

`qualify()` returns `null` for a clean declared fact. Qualifying everything is
how a system starts sounding mechanical, and it trains the reader to skip the
qualifications that count.

A test asserts the forbidden vocabulary stays out of every visible sentence.
That looks fussy and is the point.

---

## 5. Understanding the question

`src/domain/morpheus/intents.ts`. Deterministic keyword and phrase matching,
ordered so specific intents match before broad ones.

Nine answerable intents: `marginal_allocation`, `largest_risk`, `what_changed`,
`concentration`, `gold_posture`, `deployable_cash`, `plan_on_track`, `reserve`,
plus `explain` and `evidence` which reach back into the previous answer — which
is what makes the thread a conversation rather than a series of lookups.

`unrecognised` is a real outcome, answered honestly. A classifier that recognised
a hundred intents NeoOS cannot answer would be worse than one that recognises
nine and says so about the rest.

---

## 6. Suggested questions

Computed from the position, capped at four. Offering "should I add to gold?" to
somebody who holds none is noise dressed as helpfulness, and offering "how much
is deployable?" when obligations are unknown invites an answer NeoOS must refuse.

Each workspace carries its own question:

| Workspace | Question |
|---|---|
| Capital | What is the safest use of my next 1,000? |
| Markets | What changed today that matters to my plan? |
| Portfolio | What is my largest concentration risk? |
| Gold | Should I add, hold or reduce gold? |
| Cash | How much of this is truly deployable? |
| Timeline | Is my plan still on track? |

---

## 7. One question at a time

`src/domain/morpheus/gaps.ts`. The screen holds a single question, always.

Ordering is by **consequence, not schema structure**. Monthly obligations come
before drawdown tolerance because the first unblocks the reserve, the reserve
unblocks deployable capital, and deployable capital is the question people
arrive with.

Every question carries `why` (what it unlocks) and `ifSkipped` (what it costs).
Skipping is a first-class action, stated plainly and without pressure — a flow
that guilts somebody into an answer gets a careless answer, which is worse than
no answer because it looks like a fact. A declined question is not re-asked in
the same session.

The home screen names the *count* of remaining gaps, never the list.

---

## 8. Conversation state

`src/data/conversation-store.tsx`. A module singleton read through
`useSyncExternalStore`, matching the report store, living above the router in
the root layout.

Continuity across navigation is therefore true by construction: moving from
Morpheus to Gold does not touch the module, so there is nothing to preserve and
nothing to lose. Session storage adds survival across a hard reload.

The position is fetched only when the operator token is already in session
storage, and a payload failing schema validation is treated as no profile — half
a position produces confidently wrong answers.

---

## 9. Evidence disclosure

`src/components/morpheus/Answer.tsx`. Evidence sits behind a disclosure control,
with provenance and source note on each item, plus "what would change my mind".

This is a presentation choice, not a reduction in rigour: everything is already
computed and attributed, and it is one tap away. Typography carries the
hierarchy — the conclusion is the largest thing on the card because it is what
the reader came for.

---

## 10. Two intake doors, one schema

`src/domain/intake/guided.ts` and `src/components/intake/GuidedIntake.tsx`.

Eleven questions, one at a time, each explaining itself, "I don't know" always
available, partial completion allowed. **Nothing is written until the summary is
confirmed** — a person reading back eleven plain sentences catches their own
mistakes; a person confirming a JSON payload does not.

Three constraints enforced in the domain rather than the UI:

1. **Nothing is inferred.** An unanswered question leaves its field null.
2. **Conversation does not upgrade provenance.** An amount typed into a chat is
   `subject_estimate` unless stated otherwise. Saying it aloud does not make it
   a statement balance.
3. **Structural data defers to the form.** Assets, liabilities and dependants
   are entered row by row. Parsing "some gold, maybe 90k, a bit in Nepal" into
   typed holdings would mean inventing a split the user never stated.

The structured form stays available for speed and correction, and is the default
for anyone with a position already recorded — correcting one figure through
eleven questions would be absurd.

---

## 11. Layout

**Mobile.** Morpheus home is a single column capped at 760px. The composer docks
above the bottom navigation rather than replacing it, so the workspaces stay
reachable. Suggested questions scroll horizontally inside their own row —
`min-w-0` at every level, because a flex child defaults to the width of its
content and would otherwise push the page wider than the viewport at 320px.

**Desktop.** Same column, centred, with the workspace navigation across the top.
The conversation is the page rather than a sidebar: a sidebar would make it an
accessory to the dashboard, which is the hierarchy this work inverts.

**Both.** The workspace conversation strip is rendered once from the layout, not
per page. Placing it inside each workspace made it a grid item in that page's own
layout grid, which put it in a column it was never meant to share.

---

## 12. States

| State | Behaviour |
|---|---|
| No position | Morpheus says he cannot answer and why, and offers both intake doors |
| Locked | Says the position is behind the operator token; labels what is shown as the worked example |
| Loading | "Reading your position…" |
| Partial | Answers what it can, names what it cannot, asks one question |
| Unrecognised question | Says so, lists what it can answer |
| No evidence | Says the answer was a refusal, so there is nothing underneath |

---

## 13. What did not change

Not one evidence, provenance or safety control was weakened.

Strong Buy still requires demonstrable undervaluation, margin of safety, durable
economics, acceptable downside, portfolio fit and current evidence. Stale
evidence still cannot support an upgrade. Manual entry is still never promoted to
retrieved. Append-only persistence is untouched. The intake schema is unchanged —
the guided flow writes to it, it does not replace it.
