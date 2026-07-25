# Report comparison

`compareReports(previous, current)` produces a deterministic `ReportDiff`.

## Detected changes

Score, rating, confidence, evidence integrity, valuation, margin of safety,
threshold, new evidence, expired evidence, resolved and new conflicts,
deployment posture, reserve constraints, concentration, newly insufficient
assets, assets restored from insufficient evidence, engine version, and schema
version.

## Each change carries

Type, severity, asset id or global scope, label, previous and current values,
absolute change, percentage change where meaningful, cause, cause detail,
supporting evidence ids, and a user-facing explanation.

## Severity

| Severity | Trigger |
|---|---|
| `critical` | Rating change, band change, new constraint, newly insufficient, engine version change, score move ≥ 10 |
| `material` | Score move ≥ 3, confidence or integrity move ≥ 5, margin of safety move ≥ 5pp, valuation change |
| `minor` | Smaller movements |
| `informational` | Evidence counts |

Thresholds live in `CHANGE_THRESHOLDS`.

## Causal attribution

A cause is asserted **only when the trace or an evidence change proves it**:

| Cause | Proof required |
|---|---|
| `valuation_input_changed` | The margin of safety actually moved |
| `evidence_added` | New evidence ids appear in the asset's factor scores |
| `evidence_expired` | Evidence ids left the asset's factor scores |
| `conflict_state_changed` | The asset's conflict set changed |
| `constraint_applied` / `constraint_released` | Posture constraints changed |
| `engine_version_changed` | Engine versions differ |
| `unknown` | None of the above |

**`unknown` is used freely and without embarrassment.** A plausible-sounding
cause reads as authoritative and is worse than an admission; the briefing
surfaces unproven movements as warnings rather than explaining them away.

## First report

With no prior report the diff is empty and `isFirstReport` is true, rather than
every value being reported as a change from nothing.

## Engine version changes

Recorded as critical, with the explanation that scores from two different engine
versions are not directly comparable.
