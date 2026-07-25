# Domain model

All models are defined as Zod schemas in `src/engine/models.ts` and are the
single source of truth for their TypeScript types.

## Asset

Identity is separated so a generic category is never presented as a specific
instrument.

| Field | Notes |
|---|---|
| `assetId` | Stable key used across evidence, recommendations, and the portfolio |
| `kind` | `instrument` (a specific security) or `category` (a generic bucket) |
| `ticker`, `exchange` | Null for categories. A category carrying a ticker is a validation error |
| `currency`, `assetClass`, `category` | Always present |
| `sector`, `industry`, `country`, `benchmark` | Nullable |
| `region`, `status` | `status` is `active`, `watch`, or `excluded` |
| `sourceIdentifiers` | Free-form map for external identifier systems |

## Evidence record

The atom of the system. Every factor score cites these.

| Field | Notes |
|---|---|
| `evidenceId` | Referenced by factor scores and valuations |
| `assetId` | Null for macro-scoped evidence, which applies to every asset |
| `evidenceType`, `sourceTier` | Tier 1 (filings) to 6 (sentiment) |
| `sourceName`, `sourceRef` | Citation: URL or canonical reference |
| `publicationDate`, `retrievedAt`, `effectiveDate`, `expiresAt` | Freshness inputs |
| `factor` | Which of the eight factors this informs, or null |
| `claimKey` | Two records with the same key assert the same fact — the basis of conflict detection |
| `factualClaim`, `normalizedValue`, `unit` | The claim and its 0–100 normalization |
| `confidence` | Source-assigned, before freshness decay |
| `verificationStatus` | `verified`, `unverified`, or `disputed` |
| `conflictGroupId`, `notes` | Set when the record participates in a conflict |

## Factor score

One per factor per asset, always eight, including factors with no evidence.

`rawScore` and `adjustedScore` are nullable — a factor with no usable evidence
is excluded from the total rather than defaulted. Carries `weight`,
`weightedContribution`, `confidence`, the three penalties separately
(`freshnessPenalty`, `coveragePenalty`, `conflictPenalty`), `evidenceCoverage`,
the `evidenceIds` behind it, a written `rationale`, and any `missingInputs` and
`limitations`.

## Valuation result

Method, model version, calculation date, inputs, assumptions, evidence
references, the three cases (conservative, base, optimistic), market price,
currency, margin of safety, sensitivity, confidence, invalidation conditions,
and limitations. No price conclusion is displayed without one of these.

## Asset recommendation

| Field | Notes |
|---|---|
| `status` | `rated` or `insufficient_evidence` |
| `totalScore`, `provisionalRating`, `finalRating` | All null when insufficient |
| `confidence`, `evidenceIntegrity` | Aggregates over the asset's evidence |
| `engineVersion`, `modelVersion`, `valuationDate` | Reproducibility stamps |
| `eligibilityChecks` | The Strong Buy gate, each with actual vs required |
| `vetoes` | Every rating reduction, with its reason |
| `factorScores` | The full waterfall |
| `valuation`, `marginOfSafety` | The valuation trace |
| `downsideCase`, `baseCase`, `upsideCase`, `portfolioFit` | Narrative cases |
| `recommendationRationale` | One-line derivation |
| `insufficientReasons` | Populated only when the engine refused to rate |
| `invalidationConditions` | What would break this conclusion |
| `conflictIds` | Conflicts touching this asset |

## Capital posture

Deployment score and band, recommendation, accelerator posture, maximum initial
tranche, reserve requirement, confidence, evidence integrity, the market and
cash scores, opportunity index, Strong Buy count, concentration and liquidity
risk, the `rationale` list, every applied `constraint`, `wouldIncrease` and
`wouldDecrease`, and the generation stamps.

## Conflict record

Both conflicting evidence ids, the prevailing one, severity (`low`/`high`),
resolution (`unresolved`, `resolved_by_tier`, `resolved_manually`), the effect
on confidence, and a human-readable note. **Both records are always preserved.**

## Decision journal entry

Append-only. Carries the report hash, summary, deployment score and
recommendation, engine and model versions, optional `userDecision`,
`executionDetails`, `outcome`, and `reviewNotes`, a `supersedes` pointer for
corrections, and an `integrityHash`.

## Engine report envelope (v2.0)

Metadata (generated at, evidence updated at, engine version, mode, previous
report hash), assets, evidence, conflicts, recommendations, posture, evidence
summary, change log, warnings, insufficient-evidence items, and the journal
entry.
