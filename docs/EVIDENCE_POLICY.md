# Evidence, freshness, conflicts, and insufficient evidence

One document for the four policies that decide what NeoOS is willing to claim.

## 1. Evidence hierarchy

| Tier | Type | Examples |
|---|---|---|
| 1 | Official filings and issuer disclosures | annual and quarterly reports, prospectuses, proxy statements |
| 2 | Authoritative market data | exchange tapes, auction results, yield curves |
| 3 | Independent institutional research | research houses, index methodology reviews |
| 4 | Macro and economic intelligence | central bank statements, statistics releases |
| 5 | Trusted financial news | established financial press |
| 6 | Sentiment and secondary commentary | sentiment aggregators, retail commentary |

Tier weighting inside a factor is `1 + (6 − tier) × 0.4`, so a filing counts
about three times a sentiment record on the same claim.

**Lower-tier evidence never overrides higher-tier evidence silently.** When
they disagree, a conflict record is created (§3) and the higher tier prevails
on the record, with the disagreement preserved and surfaced.

## 2. Freshness policy

Each evidence type decays at its own rate, because different classes of fact
have different shelf lives:

| Type | Horizon | Stale after | Expired after |
|---|---|---|---|
| Official filing | 120 days | 120 days | 240 days |
| Market data | 5 days | 5 days | 10 days |
| Institutional research | 90 days | 90 days | 180 days |
| Macro intelligence | 45 days | 45 days | 90 days |
| Financial news | 21 days | 21 days | 42 days |
| Sentiment | 7 days | 7 days | 14 days |

Confidence multipliers: fresh 1.0, aging (past two-thirds of horizon) 0.92,
stale 0.75, **expired 0.0**. Expired evidence is excluded entirely rather than
decayed to something small — it does not get to influence a decision at all.

An explicit `expiresAt` always wins over the horizon. An unparseable date is
treated as expired, never as fresh.

**Report-level freshness** is separate: a non-demo report older than 36 hours
puts the application into the `stale` data state. 36 rather than 24 so a report
generated yesterday morning is still current tonight, while a skipped day is
visibly stale.

## 3. Conflict resolution policy

Two records conflict when they share a `claimKey` (same asset, same normalized
claim) and either disagree by more than 5% on the normalized value, or one is
marked `disputed`.

When that happens:

1. **Both records are preserved.** Nothing is overwritten, ever.
2. The stronger source tier is recorded as prevailing.
3. Severity is assigned:
   - **low** when the tier gap is 2 or more — the hierarchy resolves it
     (`resolved_by_tier`), and the affected factors take a confidence penalty.
   - **high** when sources of comparable authority disagree (tier gap ≤ 1), or
     any record is formally disputed. These stay `unresolved`.
4. An unresolved high-severity conflict **caps the asset's rating at Hold** and
   fails the Strong Buy gate.

A filing disagreeing with a blog is resolvable. Two filings disagreeing is a
real problem, and the engine treats it as one.

## 4. Insufficient evidence policy

Insufficient Evidence is a **valid, first-class outcome**, not an error. The
engine returns it instead of a rating when:

- a critical factor (valuation, financial strength) has evidence coverage below
  25%;
- overall confidence falls below 35;
- evidence integrity falls below 30;
- the valuation inputs are missing, so no margin of safety can be computed;
- report versions are incompatible, or the calculation cannot be reproduced.

When it fires, the recommendation carries `status: "insufficient_evidence"`,
`totalScore: null`, and `finalRating: null` — **no fabricated number is emitted
anywhere**. Every reason is listed.

The UI shows this state rather than hiding it: the asset keeps its place in the
ranking with a dedicated pill, the action board gives it its own group, and its
trace explains exactly which inputs were missing.

## 5. Provenance policy for price conclusions

Buy Below, Strong Buy Below, and intrinsic-value ranges are investment
conclusions, not decorations. They are displayed **only** when the report
carries the complete valuation trace that produced them: method, model version,
calculation date, evidence references, currency, assumptions, and invalidation
conditions.

A v1.0 or v1.1 file can assert any number it likes in `buyBelow` with nothing
behind it. Those numbers are **withheld** and the UI says so. This is an
engineering control, not a disclaimer.

## 6. What NeoOS will not do

- Claim data is live unless it was actually retrieved, timestamped, and
  verified. The `live_verified` state exists but is unreachable until a real
  feed exists.
- Fall back from imported or live data to demo data silently. A load failure
  produces an explicit error state, and the unreadable bytes are preserved for
  recovery rather than discarded.
- Fabricate citations, prices, thresholds, or fundamentals.
- Substitute a disclaimer for an engineering control.
