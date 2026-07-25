# UAE evidence policy

**UAE assets can never be labelled `live_verified` by NeoOS.** Their ceiling is
`partial_live`, enforced in code at assessment time.

This is a statement about what NeoOS can retrieve and redistribute. It is not a
judgement about UAE markets, UAE issuers, or the quality of UAE disclosure.

---

## 1. Why

Two constraints, both structural:

**No public structured endpoint.** UAE issuer disclosure is published through the
Securities and Commodities Authority and the ADX and DFM portals, as PDFs and
rendered pages rather than a documented machine-readable API. The US equivalent —
EDGAR's XBRL-derived JSON with a published fair-access policy — has no UAE
counterpart NeoOS can rely on.

**Licensed market data.** ADX and DFM price data is licensed per exchange, with
redistribution terms set by agreement. NeoOS does not assume a licence it has not
been given.

---

## 2. What NeoOS will not do

The obvious workaround is to scrape the portals. NeoOS refuses, and
`rendered_page_scrape` is a prohibited source kind in
`src/server/config/source-policy.ts` rather than merely an unimplemented one.

The reasons are not sentimental:

- **It breaks silently.** A layout change turns a scraper into a producer of
  plausible wrong numbers, which is worse than a producer of no numbers. A
  structured endpoint's shape change is detectable; a rendered page's is not.
- **It cannot be cited properly.** Tier-1 evidence means a reader can open the
  original document and check the figure. A scraped table cell has no accession
  number and no stable address.
- **It disregards the publisher.** Terms of use exist, and taking data a
  publisher chose not to expose programmatically is not made acceptable by being
  technically easy.

Secondary aggregators are refused for a related reason: they restate primary data
without accountability for it, and their revisions are invisible.

---

## 3. What NeoOS does instead

**Manual evidence with citations.** An operator enters UAE evidence through the
v3.0 manual import path, citing the original filing. The record enters at the
tier its source justifies, carries `providerMode: manual_import`, and is
labelled "Manual evidence" everywhere it appears.

Everything downstream works normally: identity resolution, normalization,
validation, conflict detection, scoring, and the Strong Buy gate all apply. A UAE
asset can be rated, can be recommended, and can carry high confidence.

What it cannot be is `live_verified`, because NeoOS did not retrieve that evidence
from a structured official source and will not claim it did.

---

## 4. What would change this

Any of the following, and the ceiling lifts:

- The SCA, ADX, or DFM publishes a documented machine-readable disclosure API.
- A licensed vendor with UAE fundamentals coverage is configured, and the licence
  permits the use.
- A licensed ADX or DFM price feed is configured with stated redistribution terms.

The policy lives in one table (`JURISDICTION_POLICIES`). Raising the ceiling is a
data change and a licence, not a rewrite.

---

## 5. Reading it in the interface

A UAE asset shows `partial_live` with the reason attached:

> Capped at partial live by source policy for this asset's jurisdiction and class.

Its evidence carries "Manual evidence" provenance. The provider panel names the
gap rather than leaving it blank.

None of this is buried. A user should be able to see, without asking, that the
UAE holding rests on evidence someone typed in and cited, while the US holding
rests on evidence NeoOS fetched from a regulator — and weigh them accordingly.
