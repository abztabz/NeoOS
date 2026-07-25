# Decision capture

**A recommendation and a user action are separate records.** NeoOS never infers
that a recommendation was executed. If the user did something, they said so.

## What is captured

Decision kind (`no_action`, `accepted`, `partially_accepted`, `rejected`,
`deferred`, `custom_action`), or a capital-posture decision (`preserve_cash`,
`deploy_10`, `deploy_25`, `rebalance`, `hold_existing`, `reduce_exposure`,
`no_decision`).

Alongside: amount and unit, intended and actual execution dates, execution
price, notes, reason, the user's own confidence, constraints, attachment
reference placeholders, and a review date.

Each record also pins **what the engine said** — `recommendationSnapshot` — and
the `reportHash` of the report that was on screen, so the record stands alone
and cannot be re-interpreted against a later report.

## Scope

Decisions are asset-level or posture-level. Posture decisions are first-class:
"how hard should I press the accelerator" is the primary question, so the answer
is recordable.

## Separation from the journal

Recording a decision does not modify any journal entry. The two are stored
separately (`neoos.decisions.v3` and `neoos.journal.v3`), and a test asserts
that recording a decision leaves the journal untouched.

## Limitation

There is no execution integration. Actual execution dates and prices are
whatever the user types; NeoOS does not verify them and does not claim to.
