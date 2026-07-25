# Sprint 2 completion report — Evidence and Decision Engine

**Date:** 2026-07-25
**Deployment:** https://neoos-cio.vercel.app
**Branch:** `claude/adding-more-files-y6s0vh`
**Engine version:** 2.0.0 · **Report schemas:** v1.0, v1.1, v2.0
**Diff:** 60 files, +6,609 / −508 across 6 commits

The objective was to convert NeoOS from a convincing interface into an
auditable capital-allocation system. The interface was accepted as the visual
baseline and was not redesigned: the Capital Deployment Gauge remains the hero
component, capital posture still precedes asset recommendations, and no
decorative screens were added. What changed is what sits underneath every
number on screen.

---

## 1. Baseline recorded before work began

| Gate | Before | After |
|---|---|---|
| Lint | pass | pass |
| Typecheck | pass | pass |
| Unit tests | 32 | 156 |
| End-to-end tests | 85 | 151 |
| Production build | pass | pass |

The pre-existing deployment score of 35% was hand-typed. It is now 38%,
computed by the engine from evidence. That change is the point of the sprint.

---

## 2. Files and modules added

### Engine (`src/engine/`)

| Module | Responsibility |
|---|---|
| `constants.ts` | Every threshold with written rationale; the only place decision numbers are declared |
| `models.ts` | Canonical Zod models — Asset, EvidenceRecord, FactorScore, ValuationResult, AssetRecommendation, CapitalPosture, ConflictRecord, DecisionJournalEntry — plus the v2.0 report envelope |
| `evidence.ts` | Per-type freshness horizons, confidence decay, tier-ranked conflict detection, evidence integrity |
| `valuation.ts` | Five modular valuation methods, each exposing a complete trace |
| `scoring.ts` | Factor scoring, three penalty classes, confidence propagation, vetoes, the Strong Buy gate, the insufficient-evidence gate |
| `deployment.ts` | Capital posture and the hard constraint caps |
| `generate.ts` | The deterministic report pipeline and the view derivation |
| `hash.ts` | Stable stringify and FNV-1a for journal integrity markers |

### Domain (`src/domain/`)

`app-state.ts` (six data states, freshness), `provenance.ts` (the gate on
displaying price conclusions). `scoring.ts` gained `ratingFromScoreEnum` and a
corrected band lookup.

### Data (`src/data/`)

`demo-universe.ts` — 50 evidence records across six assets, deliberately
including one evidence-poor asset and one genuine source conflict.
`demo-report.ts` was rewritten to *generate* the demo rather than declare it.

### Components

`DataStateBadge.tsx` (state plus report metadata dialog), `ScoreTrace.tsx` (the
per-asset calculation trace). `Gauge.tsx` gained posture explainability;
`RatingPill.tsx` handles the unrated state.

### Documentation

`SCORING_METHODOLOGY.md`, `STRONG_BUY_POLICY.md`, `EVIDENCE_POLICY.md`,
`DOMAIN_MODEL.md`, `ENGINE_ARCHITECTURE.md`, `DECISION_JOURNAL.md`,
`IMPORT_EXPORT.md`, `TEST_STRATEGY.md`, and this report. Machine-readable
`schemas/neoos-engine-report-v2.0.schema.json`.

---

## 3. Architecture decisions

**Engine truth separate from presentation view.** One schema serving both would
have forced either an unauditable UI contract or a presentation layer carrying
the entire evidence graph. The v2.0 file contains both; the view is derived,
never hand-authored.

**Insufficient Evidence as `null`, not a sentinel.** A sentinel number would
eventually be averaged, sorted, or rendered by accident. `null` fails loudly in
all three paths, which is why `score` and `rating` were widened to nullable
across the schema and every consumer.

**Renormalizing the weighted total** over factors that have evidence, so a
missing minor factor cannot silently depress a score. The absence surfaces
through the coverage penalty and the trace instead.

**Thresholds centralized.** Tuning the model is a review of one file rather than
an archaeology exercise.

**Demo generated through the engine.** A hand-written demo can drift from engine
behaviour without any test noticing.

**Method-aware valuation grading.** Cash equivalents have no margin-of-safety
case; grading them as "not measurable" would have stripped cash of its 30%
valuation weight, contradicting the rule that cash is a first-class asset.

---

## 4. Test results

All five gates pass.

```
lint       pass
typecheck  pass
unit       156 passed (11 files)
e2e        151 passed (desktop, iPhone 390×844, iPhone 430×932)
build      pass — 10 routes statically prerendered
```

Engine unit tests: scoring 32, deployment 28, generation 18, evidence 17,
valuation 13 (108 total). Application tests: 48.

### Defects the tests found

1. **`buyThresholds` used the wrong numerator** (25/140 rather than 35/140), so
   Buy Below quoted the price at valuation grade 75 instead of the documented
   85 — a systematically laxer buy level than policy.
2. **`deploymentBand` returned Preserve Cash for fractional scores.** Bands were
   labeled 0–20, 21–40 and matched with `>= min && <= max`, so a continuous
   score of 20.5 fell into a gap and defaulted to the first band. Latent under
   Sprint 1's integer scores; live the moment the engine produced real numbers.
3. **Gold's custody record was typed as market data**, giving a 5-day horizon.
   It expired within a week and silently dropped the governance factor to zero
   coverage.

---

## 5. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Every displayed score generated by the engine | Met — asserted by test against every asset and the posture |
| 2 | Every score has a reproducible calculation trace | Met — the waterfall recomputes to the total within 1e-8 |
| 3 | Every conclusion has evidence references or is marked Insufficient Evidence | Met — asserted, including that cited ids exist |
| 4 | Strong Buy cannot be produced by score alone | Met — eleven-check gate, plus structural arithmetic |
| 5 | Failed loading never silently reveals demo data | Met — explicit error state, raw bytes preserved |
| 6 | Report freshness visible | Met — relative age in the badge, exact timestamp in details |
| 7 | Data mode visible | Met — six explicit states in the header |
| 8 | Imported reports validated atomically | Met — failure leaves current state untouched |
| 9 | Historical recommendations immutable | Met — append-only journal with integrity hashes |
| 10 | Posture constrained by reserves, evidence, concentration, liquidity | Met — every cap tested individually and in combination |
| 11 | All six workspaces work on desktop and mobile | Met — including 320px |
| 12 | Lint, typecheck, tests, accessibility, build pass | Met |
| 13 | Production deployment succeeds | Met |
| 14 | Written completion report | This document |

---

## 6. Known limitations

- **The demo universe is fixture data, not market data.** Prices, filings, and
  claims are illustrative and labeled demo throughout. They are internally
  consistent and engine-computed, but they are not real.
- **`live_verified` is unreachable.** The state exists and is modelled, but no
  live feed is configured. The app will not claim live data it did not retrieve.
- **Journal integrity is tamper-evident, not tamper-proof.** FNV-1a is not
  cryptographic; anyone who can edit an entry can recompute its hash. Real
  tamper resistance needs a signing key outside the editing party's reach,
  which is server-side scope.
- **No user-facing decision capture.** `userDecision`, `executionDetails`, and
  `outcome` are modelled and rendered but can only be populated by import.
- **Accessibility coverage is targeted, not exhaustive.** Touch targets, focus
  visibility, reduced motion, and non-color rating cues are asserted; there is
  no automated axe-core ruleset sweep.
- **Two valuation methods per asset class at most.** Ten method types are
  modelled; five are implemented. Discounted cash flow, owner earnings, dividend
  models, relative valuation, and replacement cost are declared but not built.
- **The journal lives inside the report**, so it is only as durable as the
  report file.
- **Macro evidence is global.** Records scoped to `null` apply identically to
  every asset; there is no regional or sector-specific macro attribution yet.

---

## 7. Deferred items

| Item | Why deferred |
|---|---|
| Remaining five valuation methods | No fixture asset needs them; adding untested model code would be speculative |
| Automated accessibility audit | Needs an axe-core harness; targeted assertions cover the acceptance criteria today |
| Decision capture UI | Requires product decisions about what a user records and when |
| Separate append-only journal store | Needs a persistence design beyond a single report file |
| Live data integration | Requires credentials and licensing — outside autonomous authority |
| Visual regression testing | Infrastructure choice, not a correctness gap |

---

## 8. Recommended Sprint 3 scope

**1. The report generator (highest value).** The engine can now *consume* a
universe of evidence, but a human still has to assemble one. A Morpheus pipeline
that emits a valid `UniverseInputs` from the investment constitution would close
the daily loop: analyse → generate → import → decide. Everything downstream is
already built and tested.

**2. Decision capture and outcome review.** The journal models user decisions and
outcomes but cannot record them. Adding capture turns the Timeline from a record
of what NeoOS said into a record of what was done and whether it worked — which
is what makes the system improve rather than merely repeat.

**3. Evidence ingestion and identity resolution.** Today evidence records are
hand-authored. Ingesting filings and market data means solving identity mapping
(is this filing about the instrument we think it is?), which the engine already
names as an insufficient-evidence trigger but cannot yet detect.

**4. Durable journal store with signed entries.** Moves integrity from
tamper-evident to tamper-resistant and survives loss of the report file.

Sequenced deliberately: item 1 makes the system usable daily, item 2 makes it
learn, item 3 makes it scale, item 4 makes it trustworthy over years.
