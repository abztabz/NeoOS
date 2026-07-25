# Outcome review

A decision journal that is never revisited repeats mistakes with excellent
documentation. This closes the loop.

---

## 1. The distinction that shapes everything here

**A good decision and a good outcome are different things.**

A well-reasoned position can lose money to an event nobody could have known
about. A reckless one can be rescued by luck. Grading process by result teaches
the wrong lesson in both directions: it punishes discipline after an unlucky
quarter and rewards carelessness after a lucky one.

So a review records **two independent judgements**, stored separately and never
combined into one score.

### What happened

| Result | |
|---|---|
| `worked_out` | |
| `worked_out_partially` | |
| `did_not_work_out` | |
| `too_early_to_tell` | Excluded from every rate |
| `not_acted_on` | |

### Whether the reasoning was sound

| Verdict | |
|---|---|
| `sound` | |
| `sound_but_lucky` | The result owed more to luck than to the analysis |
| `flawed_but_profitable` | The result was better than the process deserved |
| `flawed` | |
| `cannot_assess` | Excluded from every rate |

---

## 2. Attribution

Why the result differed from the expectation:

`thesis_correct`, `thesis_wrong`, `evidence_was_stale`, `evidence_was_wrong`,
`unknowable_at_the_time`, `execution_differed_from_plan`, `position_size_wrong`,
`held_too_long`, `sold_too_early`.

**`unknowable_at_the_time` is the important one.** Without it, every negative
outcome gets attributed to some fault, and the journal fills with fictitious
lessons that then distort future decisions. An honest review must be able to
conclude that nothing was done wrong.

---

## 3. The 90-day horizon

`MINIMUM_REVIEW_HORIZON_DAYS = 90`. A decision is not in the review queue before
then.

A capital-allocation thesis measured after a fortnight measures noise. A journal
full of premature verdicts trains exactly the short-termism the system exists to
counteract — which would make the feedback loop actively harmful rather than
merely useless.

---

## 4. Process quality

Reported **alongside** the hit rate, never instead of it and never merged with it:

| Metric | |
|---|---|
| `hitRate` | Share that worked out |
| `soundReasoningRate` | Share where the reasoning was sound |
| `luckyWins` | Flawed reasoning, good result — the dangerous ones |
| `unluckyLosses` | Sound reasoning, bad result — the ones worth defending |

Two numbers that disagree are informative. A high hit rate with poor process
quality is a warning, and it is completely invisible if you track only one.

`luckyWins` and `unluckyLosses` are counted rather than averaged away, because
they are the individual cases most worth reading.

Rates return `null` rather than zero when nothing has been reviewed. A zero hit
rate and no data are different statements.

---

## 5. Prices and the lesson field

`priceAtDecision` and `priceAtReview` are supplied by the reviewer. NeoOS does
not verify execution and does not pretend to — it has no connection to a broker,
and inventing an execution price would be the same fabrication the rest of the
system refuses.

A realised return is computed only when both are present. Never inferred from one.

`lesson` is **nullable on purpose**. Forcing a lesson out of every review
manufactures false patterns from ordinary variance, and a journal of manufactured
patterns is worse than one with honest gaps.

---

## 6. API

| Route | |
|---|---|
| `GET /api/outcomes` | Reviews, process quality, and the queue of decisions old enough to judge |
| `POST /api/outcomes` | Record one review. 404 if the decision was never recorded |
| `GET /api/decisions` | Decisions with their review due dates |
| `POST /api/decisions` | Record a decision |

Both require the operator token. Both are append-only: a review that can be
edited after the fact is a review that gets edited after the fact, usually to
agree with what happened next.
