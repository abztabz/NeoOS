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


## Reporting cadence and explicit expiry

The per-tier freshness horizons assume a **quarterly** reporting rhythm.
`officialFiling` is 120 days, expiring at 240.

That is wrong for annual accounts, and wrong in a way that only real data
exposes. A 10-K is filed once a year, so for most of any given year a company's
most recent annual figures are older than 240 days. Under the age heuristic
alone they would be discarded as expired — meaning no company could be valued
from its own audited accounts for roughly two-thirds of the year, while the
figures being discarded were the most current ones in existence.

**A provider that knows a fact's reporting cadence may state its own expiry.**
When `expiresAt` is present it overrides the age heuristic:

| | Behaviour |
|---|---|
| Past the stated expiry | `expired` — contributes nothing |
| Before it | `fresh`, `aging`, or `stale` by the usual age thresholds |

So the record still ages. A ten-month-old 10-K is reported **stale**, its
confidence decays by the usual multiplier, and the interface says it is old. It
is simply not thrown away while it remains the most current fact available.
Keeping it and marking it stale is more honest than discarding it and reporting
nothing.

Nothing invents an expiry. Only a provider that knows the cadence sets one, and
the SEC EDGAR adapter is currently the only one that does:
`ANNUAL_FACT_AUTHORITATIVE_DAYS = 455` from the period end, on the reasoning
that annual accounts are superseded roughly fifteen months later. Past that with
nothing newer filed, the issuer is delinquent or no longer reporting and the
figures should expire.

Prior fiscal years expire on schedule and drop out. That is intended: they have
been superseded. When the growth series expires, the valuation reports that it
could not measure growth rather than assuming a rate.

## 7. Jurisdictional evidence and source classes

National institutions are evidence sources, not knowledge. They are organised as
**country packs** — dynamic modules that activate on a hook in the declared
position and carry no standing without one. Full architecture in
COUNTRY_SOURCE_PACKS.md; this section is the evidence-policy half.

### Source classes, mapped onto the tier hierarchy

| Class | Source | Tier | Notes |
|---|---|---|---|
| A1 | National central bank | 4 (macro) | Except a stated FX regime or policy rate, which is an official issuer disclosure and reads as tier 1 for that fact |
| A2 | National statistics agency | 4 (macro) | |
| A3 | Securities regulator and exchange | 2 for exchange prices | Regulator *rules* are `domain_rule` knowledge, not evidence |
| A4 | Tax, legal, property authorities | 1 for registry records | A land-registry entry about the subject's own property is an official record. The *rules* are `domain_rule` |
| A5 | IMF, BIS, World Bank, OECD | 3 (institutional research) | |
| A6 | US Fed, FRED, BLS | 4 for statistics, 2 for market rates | Included as the global benchmark, not because any subject is dollar-pegged |

The split inside A3 and A4 matters. A price and a rule are different kinds of
thing: a price is a fact that ages on a market clock, a rule is jurisdictional
knowledge that expires and must be stated as "as of, subject to verification".
Filing them together would let a tax rule inherit a market datum's freshness.

### Freshness

National statistics do not age on the existing per-type clocks. They are
published on a cadence with a lag, and revised afterwards, so they carry a
provider-stated expiry the way annual filings do. Horizons, states
(`current` / `delayed` / `stale` / `superseded` / `unavailable`) and the
four-times record shape are specified in PURCHASING_POWER_PROVIDER.md §§1, 5.

**`delayed` is not an error.** A statistic past its expected publication date but
not yet released is a normal condition, distinct from a source being
unreachable, and the two must not collapse into one state.

### The firewall

> **Country context is to allocation what knowledge is to valuation: it may
> shape what is permitted and what is risky, never what something is worth.**

Country evidence may write to the constraint layer and the risk layer. It may
not write to the valuation layer or the quality layer.

**May affect:** currency risk · inflation exposure · taxation · regulation ·
capital controls · ownership rights · custody · liquidity · political risk ·
inheritance · family obligations · access · transaction costs.

**Must not override:** valuation · margin of safety · business quality ·
downside risk · portfolio fit · evidence quality.

**No jurisdiction carries a prior.** Residence confers no preference; home
country confers no preference; neither confers a penalty. Without this rule
"home market" becomes a reason to buy and "foreign" a reason not to, which is
home bias with a citation attached.

Enforced rather than asserted: `COUNTRY_RELEVANCE_CHANNELS` and
`COUNTRY_MUST_NOT_OVERRIDE` are exported constants in
`src/domain/jurisdiction/packs.ts`, and a test asserts the sets never intersect.

### No composite country score

Deliberately absent. A single "country risk" number would collapse the thirteen
channels into one figure, and a figure that ranks countries is a country
preference however it is labelled. Each channel is reported separately or not at
all.
