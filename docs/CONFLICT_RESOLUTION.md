# Conflict resolution

The engine already detects value disagreement on a shared claim key
(`EVIDENCE_POLICY.md` §3). The pipeline adds the conflicts only visible at
ingestion time.

## Conflict kinds

| Kind | Detection | Severity |
|---|---|---|
| Value disagreement | Same claim key, values differ beyond 5% | High when tiers are within 1, else low |
| Disputed record | Any record marked `disputed` | High |
| Revised filing | Two tier-1/2 records on one claim, differing, at different effective dates | Low — the later one prevails |
| Unit mismatch | Same claim expressed in different units | High |
| Currency mismatch | Same claim in different currencies | High |

## Rules

1. **Every record is preserved.** Nothing is ever overwritten.
2. **The stronger source tier prevails**, and is named on the conflict record.
3. **A wide tier gap is resolvable**; comparable authority is not. A filing
   disagreeing with a blog is settled by hierarchy (`resolved_by_tier`). Two
   filings disagreeing is a real problem and stays `unresolved`.
4. **A revision supersedes rather than ties.** The most recent official record
   on a claim prevails, and it replaces the generic value conflict on that claim
   rather than stacking with it.
5. **Unit and currency mismatches are not value disagreements.** The
   measurements are incomparable, so the values are never combined.
6. **Every resolution carries a written explanation** — `note` and
   `confidenceEffect` are both required and both displayed.

## Consequences

- Affected factors take a confidence penalty (6 points per conflict, capped at
  12).
- An unresolved high-severity conflict **caps the asset's rating at Hold** and
  fails the Strong Buy gate.
- Unresolved conflicts appear in the panel, in the briefing's evidence-health
  section, and in the report diff when they appear or clear.
