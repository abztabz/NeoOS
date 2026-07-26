# Purchasing-power provider — design

Gap 2. Design only. Nothing here is built.

Preserves the correction already shipped (§7).

---

## 1. Why this is not a price feed

A price is one number at one instant. A statistic is a claim about a *past
period*, published *later*, and *revised afterwards*. Four distinct times, and
collapsing them is the defect that makes most inflation-aware systems wrong:

| Time | Example |
|---|---|
| **Reference period** | What the figure describes — June 2026 |
| **Publication date** | When it was released — 15 July 2026 |
| **Revision vintage** | Which version this is — first estimate, or third revision |
| **Retrieval timestamp** | When NeoOS fetched it |

A system that stores only "June CPI = 2.1%" cannot answer *what did we believe
in July* — and every backtest, every "was that decision reasonable at the time"
review, needs exactly that. Storage is append-only for the same reason the
journal is: **a revision is a new observation, never an overwrite.**

---

## 2. Four kinds of evidence, deliberately not merged

The directive is explicit and correct: do not infer UAE purchasing-power
conditions from US inflation or from the peg. These are related and distinct.

| Evidence | What it is | Source |
|---|---|---|
| `currency_regime` | The peg itself: a standing policy fact with a rate and a start date | Central Bank of the UAE |
| `domestic_price_level` | What things cost here — driven heavily by local rents and housing | UAE Federal Competitiveness and Statistics Centre |
| `domestic_policy_rate` | The rate actually applying to dirham deposits and borrowing | CBUAE base rate, EIBOR |
| `imported_monetary_conditions` | US policy, which reaches here through the peg | Federal Reserve |

### The mistake this prevents

Because the dirham is pegged to the dollar, the UAE imports US **monetary
policy**. It does not import US **inflation**. Domestic price level is driven by
housing and rents, by goods imported from many countries rather than only the
US, and by local demand. A year where US CPI is 3% and Dubai rents rise 20% is
an ordinary year, not an anomaly.

So a UAE subject can face:

- **imported monetary tightening** (rates up because the Fed raised), and
- **domestic price inflation moving the other way**,

at the same time. Substituting one for the other produces a real-return figure
that is confidently wrong, and wrong in a direction that flatters the position.

Each kind is stored, aged and cited separately. Where the subject's base
currency has no domestic series available, the honest output is `missing` — not
the US figure with a footnote.

---

## 3. Sources

All primary, all free, all with stable citations — the source policy already
prefers exactly this over any aggregator.

| Source | Provides | Frequency |
|---|---|---|
| Central Bank of the UAE | Peg, base rate, monetary statistics | Monthly / on change |
| UAE Federal Competitiveness and Statistics Centre | UAE CPI | Monthly / quarterly |
| US Bureau of Labor Statistics | US CPI-U | Monthly |
| Federal Reserve (FRED, H.15) | Policy rate, Treasury yields | Daily / on change |
| IMF Article IV — UAE | Context and cross-checks | Annual |

Credentials: FRED needs a free API key. BLS is open, with a free key raising the
rate limit. The UAE sources publish files rather than an API, so that adapter
starts as manual import with the operator dropping in a release — which is
`manual_verified`, an honest state the system already has, not a degraded one.

**Nothing here is a paid service.** No approval needed on cost. The one thing
worth confirming is registering for the free keys.

---

## 4. The record shape

Sketch, following the existing `EvidenceRecord` discipline.

```ts
interface StatisticalObservation {
  seriesId: string;              // "uae.cpi.all-items"
  evidenceKind: "currency_regime" | "domestic_price_level"
              | "domestic_policy_rate" | "imported_monetary_conditions";
  jurisdiction: string;          // "AE" | "US"

  referencePeriodStart: string;  // what it describes
  referencePeriodEnd: string;
  publishedAt: string;           // when the agency released it
  retrievedAt: string;           // when NeoOS fetched it
  vintage: number;               // 0 = first estimate

  value: number;
  unit: "index_level" | "percent" | "basis_points" | "ratio";
  seasonalAdjustment: "adjusted" | "unadjusted" | "not_applicable";

  sourceRef: string;             // resolvable URL
  sourceKind: "official_statistics" | "central_bank" | "regulation";
  supersedes: string | null;     // the vintage this revises
}
```

Two fields carry most of the weight. `vintage` makes revisions visible instead
of silent. `seasonalAdjustment` stops an adjusted and an unadjusted series being
compared as though they were the same thing, which is a mistake that looks like
a signal.

---

## 5. Freshness, delay and absence

A statistic is late far more often than it is missing, and the two mean
different things.

| State | Meaning | Behaviour |
|---|---|---|
| `current` | Published, inside its horizon | Usable |
| `delayed` | Past its expected publication date, not yet released | Usable with the gap named; **not** an error |
| `stale` | Published but older than its horizon | Usable, confidence decayed, said out loud |
| `superseded` | A later vintage exists | Historical only |
| `unavailable` | Source unreachable | `missing`, never substituted |

Horizons follow publication cadence rather than a single global number — the
same lesson as annual filings ageing on a quarterly clock:

| Series | Cadence | Stale after |
|---|---|---|
| Monthly CPI | Monthly, ~2-week lag | 75 days past reference-period end |
| Quarterly CPI | Quarterly, ~6-week lag | 165 days |
| Policy rate | On change | Next scheduled meeting + 14 days |
| Peg | On change | Never ages; re-verified annually |

The peg is the interesting one: it is a standing fact, not an observation, so it
does not decay. It is re-verified annually because the day it *does* change is
the single largest event a dirham-denominated generational position can face,
and a system that had stopped checking would learn about it from the news.

---

## 6. What it unlocks

- **Real net position**, so growth can be told apart from erosion.
- **Reserve adequacy in real terms** — six months of obligations at today's
  prices is not six months at the prices that will apply when it is needed.
- **Real return on cash**, which is where a large dirham cash position quietly
  loses a generation's worth of purchasing power while looking safe.
- **A trend line for purchasing power**, closing the largest named gap in
  HISTORICAL_TRENDS.md §5.

---

## 7. The correction this must preserve

Already shipped and not to be undone by having a price index available:

1. **A nominal decline may support a real-erosion warning when inflation is
   non-negative.** Sound on the evidence available: if prices did not fall, a
   nominal fall is a real fall of at least the same size.
2. **Nominal growth alone stays neutral without a verified price index.** With a
   `current` domestic index for the right jurisdiction, a real figure may be
   computed — and it is then a `calculated` value citing that observation, never
   an assumption. Without one, neutral.
3. **Share-based ratios within one currency are untouched.** Purchasing power
   appears on both sides of a ratio and cancels. Applying an inflation
   adjustment to a concentration percentage would be a category error.

One addition, in the same spirit: a real figure computed from a `delayed` or
`stale` index is reported with that state attached. "Real return, using an index
published eleven weeks ago" is a different claim from "real return", and the
difference belongs on the figure rather than in a footnote.
