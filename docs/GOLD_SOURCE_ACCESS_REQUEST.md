# UAE gold source: access request and decision record

Status: **awaiting a reply from the Dubai Jewellery Group.** No gold provider is
configured, and the board correctly shows no number.

## Why NeoOS does not scrape the published page

Investigated 2026-07-29 against `mahdi-salmanzade/MCP-Dubai`, pinned at commit
`a507d4065aad5d45d6c60a3404aaf89a2090d641` (main, 2026-07-26, internal version
0.4.0 — ahead of the PyPI release 0.2.0).

The findings, for the record:

- `dubai_gold_rate` **does exist** on that revision. 120 tools versus 91 on
  PyPI. It takes no arguments and returns each karat separately — it does not
  derive 22K from 24K, which is the thing NeoOS most cares about.
- Its eight unit tests pass offline against mocked HTML.
- **It works by parsing the rendered homepage of `dubaicityofgold.com` with
  regexes, sending a spoofed desktop-browser User-Agent.** From the module's own
  docstring: *"the site's JSON API is WAF-blocked, so this feature parses that
  HTML directly with tolerant regexes"*, and the browser User-Agent *"keeps us
  on the safe side"* of that WAF.

That is the blocker, and it is not a technical one:

1. **NeoOS forbids scraping rendered pages.** It is the stated reason
   `ae_listed_equity` and `np_listed_equity` are `manual_only` in
   `providers/market/hierarchy.ts`. Adopting a scraped gold source would hold
   the household's largest priceable asset to a *looser* standard than its
   equities.
2. **The site publishes a machine-readable API and put a WAF in front of it.**
   That is the operator stating how they want automated access handled. Reading
   the HTML instead, with a browser User-Agent, works around that statement.
3. **The upstream project makes terms compliance the consumer's
   responsibility** (`DISCLAIMER.md` §7), and its own policy says it does not
   *"circumvent rate limits, captchas, or access controls"* — which sits
   uneasily beside this particular implementation.

The MIT licence on the code is not the issue; the data source's terms are.

**This is a decision about NeoOS's standards, not a judgement of MCP-Dubai**,
which is a substantial and carefully-built project. A different consumer with
different rules could reasonably use it.

## What would unblock it

Any **one** of these, in preference order:

1. **DJG grants API access.** Converts gold to `official_primary`, the strongest
   rung in the hierarchy, with no ambiguity at all.
2. **DJG confirms in writing that automated retrieval of the published rates is
   permitted** for personal, non-redistributive use. That resolves the terms
   question and a direct HTTPS adapter becomes legitimate.
3. **A commercial metals feed** with UAE retail coverage and clean terms.

## The request

Send to the Dubai Jewellery Group. The contact route is on
`dubaicityofgold.com` — a contact form or a published address; this environment
has no outbound web access, so the exact address has to be taken from the site
rather than guessed here.

Ask both questions in one message: if the answer to the first is no, the second
may still be yes, and either one unblocks a path.

---

**Subject:** API access request — DJG suggested retail gold rates (personal use)

Dear Dubai Jewellery Group,

I am a UAE resident and I hold physical gold. I have built a small private
tool for my own household that keeps track of what my savings are worth, and
I would like it to show the DJG suggested retail rate rather than a global
spot price, because the DJG rate is the one that actually reflects what gold
is worth here.

I noticed that dubaicityofgold.com serves the rates through an internal API.
I would rather ask than work around anything, so:

1. Is there a documented way to access those rates programmatically — an API
   key, a data feed, or a licence I could apply for?

2. If not, would you permit a small number of automated requests per day to
   the published rates page for personal, non-commercial use?

To be clear about the scale and the intent:

- It is one household. Not a product, not a business, and nothing is sold.
- I would cache the rate on my own server and fetch it roughly three times a
  day, matching your publication schedule. No per-visitor requests.
- I would not redistribute the rates, republish them, or expose them through
  any public API of my own.
- I would display them as "Dubai Jewellery Group Suggested Retail Rate", with
  the date and time you published them, and note that they are jewellery
  reference rates rather than spot bullion and exclude making charges.
- If you would prefer I identify my requests with a particular User-Agent, or
  keep to a specific rate limit, I will follow whatever you specify.

If there is a fee for proper access, I am open to that too.

Thank you for publishing the rates — they are a genuinely useful public
service.

Kind regards,
[your name]
[your email]
Dubai, UAE

---

## When a reply arrives

- **Access granted with an API:** send me the endpoint and a sample response.
  I will build a `DubaiGoldRateProvider` at the `official_primary` rung — a
  direct HTTPS call from the Next.js server, no Python and no MCP subprocess,
  so it runs inside Vercel. Cached server-side, 24K and 22K carried separately
  from the source, source timestamp and retrieval timestamp both displayed, and
  a visible stale state once a publication window is missed.
- **Permission granted without an API:** same adapter, reading the published
  page, with the agreed User-Agent and rate limit recorded in the code and in
  `EGRESS_ALLOWLIST`.
- **Declined or no reply:** gold stays unpriced and the board keeps saying so.
  That is an honest state, and it is better than a number nobody may use.
