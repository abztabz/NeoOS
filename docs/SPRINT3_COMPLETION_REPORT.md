# Sprint 3 completion report — Morpheus intelligence layer

**Date:** 2026-07-25
**Deployment:** https://neoos-cio.vercel.app
**Branch:** `claude/adding-more-files-y6s0vh`
**Engine version:** 2.0.0 (unchanged) · **Pipeline schemas:** v3.0
**Diff:** 75 files, +9,868 / −13 across 5 commits

The objective was to make NeoOS capable of producing a daily investment report
from structured evidence without a human assembling the report JSON. The
application was not redesigned, the engine was not replaced, and no evidence,
freshness, confidence, or Strong Buy control was weakened. What changed is that
there is now a pipeline in front of the engine.

---

## 1. Baseline recorded before work began

| Gate | Before | After |
|---|---|---|
| Lint | pass | pass |
| Typecheck | pass | pass |
| Unit tests | 156 | 242 |
| End-to-end tests | 151 | 232 |
| Accessibility scanning | none | 9 axe-core scans inside the E2E suite |
| Production build | pass | pass |

---

## 2. Files and modules added

### Intelligence layer (`src/intelligence/`)

| Module | Responsibility |
|---|---|
| `types/` | Provider contract, raw evidence, identity, validation, cycle, diff, briefing, decision |
| `adapters/fixture-provider.ts` | Serves bundled records, stamps every one `fixture` |
| `adapters/manual-import.ts` | Parses the v3.0 evidence file into raw records |
| `adapters/http-provider.ts` | Example vendor integration; ships unconfigured and fails safe |
| `ingestion/ingest.ts` | Immutable content-addressed records, duplicates, corrections |
| `identity/registry.ts` | The six-asset proof universe and every identifier for each |
| `identity/resolver.ts` | Resolution with explicit ambiguity, never a silent guess |
| `normalization/units.ts` | Units, scale, currency conversion, date parsing |
| `normalization/normalize.ts` | Raw record + resolved identity → `EvidenceRecord` |
| `validation/validate.ts` | Six stages emitting typed, severity-graded issues |
| `conflicts/pipeline-conflicts.ts` | Revisions and measurement mismatch atop the engine's detection |
| `universe/build-universe.ts` | The sole composer of `UniverseInputs` |
| `comparison/compare.ts` | Deterministic report diff with proven causal attribution |
| `briefing/briefing.ts` | Twelve-section briefing, epistemically typed, markdown export |
| `journal/journal-store.ts` | Append-only journal, decisions, run history, storage port |
| `orchestration/cycle.ts` | `runDailyMorpheusCycle` |
| `fixtures/` | The complete two-day six-asset proof run |

### Application

`data/intelligence-store.tsx` (client orchestration state), and four components:
`IntelligencePanel`, `BriefingCard`, `DecisionCapture`, `JournalList`.

### Documentation and schemas

Eleven new documents (`INTELLIGENCE_ARCHITECTURE`, `PROVIDER_ADAPTERS`,
`EVIDENCE_INGESTION`, `IDENTITY_RESOLUTION`, `NORMALIZATION_POLICY`,
`VALIDATION_POLICY`, `CONFLICT_RESOLUTION`, `UNIVERSE_INPUTS_GENERATION`,
`DAILY_MORPHEUS_CYCLE`, `REPORT_COMPARISON`, `MORPHEUS_BRIEFING`,
`DECISION_CAPTURE`, `JOURNAL_APPEND_FLOW`, `MANUAL_EVIDENCE_IMPORT`) and six
machine-readable schemas (raw evidence import, provider metadata, cycle result,
report diff, briefing, decision capture).

---

## 3. Architecture decisions

**The pipeline never writes a score.** It produces evidence and inputs; the
engine produces every number. `buildUniverseInputs` is the only composer of
`UniverseInputs`, and no component touches it.

**The engine never learns about providers.** It has no concept of fixture or
live. The single exception is a provenance label the orchestrator *stamps onto*
the finished report — the engine neither reads nor acts on it. That keeps the
honesty control where the knowledge is, without polluting the scoring contract.

**Ambiguous identity drops the record, it does not block the asset.** An earlier
implementation blocked every candidate asset on any ambiguous record, which
punished well-evidenced assets for one sloppy feed. Now the record is dropped
with a warning naming the candidates, and the engine's own insufficient-evidence
gate decides whether the shortfall matters. That gate already exists and is
already tested; reusing it beat inventing a second, parallel judgement.

**Failure is data, not an exception.** Every stage returns issues rather than
throwing, so a run reports everything wrong with it rather than stopping at the
first problem. This is what makes the diagnostics panel and audit trace useful.

**One canonical checksum function.** Records built outside ingestion originally
computed their checksum differently, so verifying a fixture record raised a
false alarm. `computeRawChecksum` is now exported and used at every construction
site.

**Run history persists as a compact summary.** Full cycle results are large and
session-scoped; a capped 50-entry summary gives durable history without storing
megabytes in browser storage.

---

## 4. Provider modes

| Mode | Label | Shipped adapter | Behaviour |
|---|---|---|---|
| `live` | Live verified | none | Unreachable — no live feed is configured |
| `fixture` | Fixture intelligence | FixtureProviderAdapter | Bundled illustrative records |
| `manual_import` | Manual evidence | ManualEvidenceImportAdapter | Operator-supplied records |
| `disabled` | Disabled | HttpProviderAdapter (unconfigured) | No request attempted |
| `error` | Provider error | any adapter on failure | Retrieval failed |

A run's label derives from the modes that actually contributed; any non-live
contribution downgrades it. The honesty control is enforced by
`validateRawRecord`, which blocks any record claiming a mode its provider is not
in.

---

## 5. Test results

```
lint       pass
typecheck  pass
unit       242 passed (15 files) — 108 engine, 48 app, 86 intelligence
e2e        232 passed — desktop, iPhone 390×844, iPhone 430×932
axe-core   9 scans, 0 serious or critical violations
build      pass — 10 routes statically prerendered
```

### Defects the tests found

1. **Checksum divergence.** Records built outside ingestion hashed all fields
   while ingestion hashes only the identity-defining subset, so integrity
   verification on any fixture or manual record failed spuriously.
2. **`text-faint` at 3.58:1** against the panel background, below the WCAG AA
   4.5:1 minimum — on the provenance and metadata labels added in Sprint 2.
   Retuned to 4.61:1; two hardcoded near-token colours replaced with the token.
3. **A focusable element inside `aria-hidden` content.** Recharts marks its own
   SVG tabbable; inside our deliberately hidden chart wrapper that left
   something reachable by keyboard but never announced.
4. **The journal never rehydrated on mount.** Entries persisted correctly but
   the Timeline showed nothing after any page load.

---

## 6. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | No manual construction of the final report JSON | Met |
| 2 | Raw evidence enters via fixture or manual import | Met |
| 3 | Every ingested record preserves provenance | Met |
| 4 | Asset identity resolved explicitly | Met |
| 5 | Ambiguous identity never silently maps | Met — dropped with candidates listed |
| 6 | Normalization deterministic and tested | Met |
| 7 | Invalid evidence preserved with rejection reasons | Met |
| 8 | UniverseInputs generated automatically | Met |
| 9 | The engine generates every score and rating | Met — asserted by trace recomputation |
| 10 | Deterministic report comparison | Met |
| 11 | Structured daily briefing | Met — twelve sections |
| 12 | No unsupported free-form claims in the briefing | Met — every statement typed and referenced |
| 13 | Decisions captured separately from recommendations | Met |
| 14 | Decisions append without rewriting history | Met |
| 15 | Failed runs preserve the last valid report | Met |
| 16 | Fixture, manual, and live states visually distinct | Met |
| 17 | No fixture data described as live | Met — enforced, not just documented |
| 18 | Six-asset fixture cycle works end to end | Met |
| 19 | All six workspaces functional | Met |
| 20 | Automated accessibility scanning passes | Met |
| 21 | Lint, typecheck, tests, build pass | Met |
| 22 | Deployment succeeds | **Unverified from this session — see below** |

### On criterion 22

All five gates pass locally and the branch is pushed to the branch Vercel
deploys from. Git-based auto-deploy on this project is confirmed working from
earlier sprints.

It is recorded as unverified because this session cannot observe it: the sandbox
egress proxy returns 403 for `*.vercel.app`, and the Vercel API tool is blocked
behind an approval prompt that does not reach the operator. **Per the Sprint 3
directive, Sprint 3 is therefore not marked complete.** Confirming the
deployment requires opening the project's Deployments tab; once it reads Ready,
criterion 22 is met and the sprint closes.

---

## 7. Known limitations

- **The fixture universe is illustrative, not market data.** Prices, filings,
  and claims are invented and labelled fixture throughout. They are internally
  consistent and engine-computed; they are not real.
- **`live_verified` is unreachable.** The state and the adapter shape exist, but
  no live feed is configured, and NeoOS will not claim live data it did not
  retrieve.
- **The HTTP adapter's payload mapping is a stub.** The transport, credential
  handling, and failure behaviour are real; mapping a specific vendor's response
  into `RawEvidenceRecord`s is left for whoever licenses that vendor.
- **Journal integrity is tamper-evident, not tamper-proof**, and storage is
  browser-local. Both limits are stated in the UI.
- **Valuation configuration is code, not data.** Each asset's valuation builder
  lives in the fixture module; a configuration-driven form is not built.
- **The universe is deliberately six assets.** Expanding it means adding to the
  identity registry — intentionally the only path in.
- **No execution integration.** Execution dates and prices are whatever the user
  types; NeoOS does not verify them.
- **Macro evidence is global.** Records scoped to `null` apply identically to
  every asset; there is no regional or sector-specific macro attribution.
- **Accessibility scanning covers automatable rules only.** It does not replace
  testing with a real screen reader.

---

## 8. Deferred items

| Item | Why deferred |
|---|---|
| A real licensed market-data provider | Requires credentials and a licensing agreement — outside autonomous authority |
| Server-side durable journal | Needs a backend; the storage port is the seam it slots into |
| Signed journal entries | Requires a key the editing party cannot reach, i.e. a server |
| Configuration-driven valuation setup | No fixture asset needs it yet |
| Universe expansion beyond six assets | The directive said prove the loop first |
| Visual regression testing | Infrastructure choice, not a correctness gap |
| Scheduled unattended runs | Needs a runtime that is not the browser |

---

## 9. Recommended Sprint 4 scope

**1. One real provider, end to end.** The adapter contract, failure handling,
and honesty controls are built and tested against fixtures. Licensing and
wiring a single genuine source — most likely official filings, the tier the
engine trusts most — is what finally makes `live_verified` reachable. Doing one
provider properly beats three shallowly.

**2. A durable journal with signed entries.** Moves integrity from
tamper-evident to tamper-resistant and survives loss of the browser profile. The
storage port means this is a backend task, not a rewrite.

**3. Outcome review.** Decisions can be recorded but never revisited. Closing
the loop — what was decided, what happened, was the reasoning sound — is what
turns a decision journal into a system that improves rather than merely repeats.

**4. Universe expansion with identity discipline.** Only once a real provider
exists, because expanding the universe on fixture data proves nothing about the
identity resolution that expansion stresses.

Sequenced deliberately: item 1 makes the system real, item 2 makes it durable,
item 3 makes it learn, item 4 makes it scale.
