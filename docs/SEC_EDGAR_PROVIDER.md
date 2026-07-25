# SEC EDGAR provider

EDGAR is the strongest evidence NeoOS can obtain: audited figures filed by a
company with its regulator, free, public, and citable to the exact document. It
enters at tier 1 of the evidence hierarchy for that reason.

It is not a price feed. EDGAR knows what a company earned; it has no view on what
the market will pay for that today. Fundamentals come from here, prices come from
a licensed feed, and the two are never conflated.

---

## 1. Endpoints used

| Endpoint | What it gives |
|---|---|
| `/api/xbrl/companyfacts/CIK##########.json` | Every XBRL concept the filer has tagged, across all periods |
| `/submissions/CIK##########.json` | Filing history — what was filed and when |

Both are public and need no key. The SEC's fair-access policy asks for two
things in return, and the client enforces both rather than trusting callers:

- **A descriptive User-Agent** identifying the requester. Without
  `SEC_EDGAR_USER_AGENT`, the provider reports itself `disabled` and makes no
  request. NeoOS does not send anonymous traffic to a public agency.
- **A request rate under ten per second.** The client serialises requests through
  one queue and spaces them at eight per second, so concurrency cannot defeat it.

---

## 2. Concept selection

Filers tag the same quantity differently and change tags between years. Revenue
alone has moved across three `us-gaap` tags in recent taxonomies.

Each concept therefore lists candidate tags in preference order, and the first
with usable facts wins. Preference order matters: a filer may keep a legacy tag
populated with values it no longer maintains, and taking the newest tag first
avoids reporting a figure the company stopped updating.

**The tag actually used is recorded on every evidence record.** A tagging change
is then visible in the audit trail rather than silently changing the numbers.

Concepts extracted: revenue, net income, diluted EPS, operating cash flow,
capital expenditure, stockholders' equity, total assets, total liabilities,
current assets, current liabilities, cash and equivalents, long-term debt, shares
outstanding, weighted-average diluted shares.

The list is deliberately short — these are the inputs the engine's factors
actually consume. Pulling every concept in a filer's facts file would be thousands
of series the engine never reads, and evidence nobody uses dilutes an audit.

---

## 3. The awkward cases, and what happens

| Case | Behaviour |
|---|---|
| Same period reported twice at different values | The later filing wins. That is the company's current position on its own past, and using anything else reports a figure it has since corrected |
| Quarterly figure inside a 10-K | Excluded by **elapsed days** (300–400), not by the `fp` field. Trusting `fp` silently mixes Q4 into an annual series |
| Figure from a 10-Q | Excluded from the annual series by form |
| Concept absent entirely | A named warning and **no record**. Never a zero |
| Submissions columns of unequal length | The whole response is refused. Pairing the wrong form with the wrong date is worse than reporting nothing |
| Response shape changed | `malformed_response`, surfaced as a provider error. Not retried — a shape change will not repair itself |
| 404 | Not retried. It is a settled answer |
| 403 / 429 | Reported as `rate_limited` with the likely cause named |

---

## 4. Citations

Every value carries the accession number of the filing it came from and a URL to
the document. Any figure NeoOS displays can be checked against the original in
two clicks, which is the entire reason for preferring tier-1 evidence.

Publication date is the filing's acceptance date, not the retrieval time — that
is what the engine's freshness horizon for official filings measures.

EDGAR states no confidence about its own data, so records carry `rawConfidence:
null`. Inventing one would be fabrication.

---

## 5. Coverage

Covered assets are listed explicitly in `EDGAR_COVERAGE`. An asset is listed only
when its issuer files XBRL statements that mean something for the engine's
factors.

Everything else has a **named reason** in `EDGAR_NON_COVERAGE`, so a gap can be
explained rather than appearing blank:

| Asset | Why not |
|---|---|
| Index ETF | The trust files, but its statements describe the wrapper, not the underlying businesses |
| Gold | No issuer. Priced, never filed |
| Treasury bills | Issued by the Treasury, not an EDGAR filer |
| UAE equity | Files with the SCA, not the SEC — see [UAE_EVIDENCE_POLICY.md](UAE_EVIDENCE_POLICY.md) |
| Fund category | Not a single filer |

---

## 6. Testing

36 contract tests run against fixtures in
`src/server/providers/sec-edgar/fixtures/`.

**Those fixtures are hand-authored, not captured.** They were written to the
SEC's documented response shape; the session that wrote them had no outbound
network access to record real responses. The fixtures' own README states this
plainly, and the synthetic issuer (`Fixture Issuer Inc.`, CIK `0001234567`) exists
so no invented figure is ever attached to a real company's name.

What the fixtures prove: the client, validation, tag selection, restatement
handling, period filtering, and mapping behave as specified — including on the
awkward inputs above, which is what the fixture is built out of.

What they do not prove: that EDGAR's live responses match this shape today. A
shape change surfaces as `malformed_response` rather than as wrong numbers, but
the first real fetch is what confirms it.

No test in the normal suite touches the network. A suite whose result depends on
a public agency's uptime fails for reasons unrelated to the code under test.
