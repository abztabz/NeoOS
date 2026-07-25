# Deployment and configuration

Everything NeoOS needs to run live, what each variable costs, and what happens
when it is absent. Nothing here is optional-but-secretly-required: the
application starts with none of it set and tells you what is missing.

Check the current state of any deployment at `GET /api/health`. It returns
presence booleans, never values.

---

## 1. Environment variables

All are server-side. **None carries the `NEXT_PUBLIC_` prefix**, which is what
makes it structurally impossible for Next.js to inline them into a browser
bundle. A test enforces that (`src/server/security.test.ts`).

| Variable | Cost | Required for | Absent means |
|---|---|---|---|
| `SEC_EDGAR_USER_AGENT` | Free | SEC filings, fundamentals | No filing evidence; no asset can be rated from accounts |
| `MARKET_DATA_BASE_URL` | Paid | Prices | No prices; every asset caps at partial live |
| `MARKET_DATA_API_KEY` | Paid | Prices | as above |
| `MARKET_DATA_TIMELINESS` | Free | Honest quote labelling | Quotes are labelled `unknown` and aged conservatively |
| `METALS_BASE_URL` | Paid | Gold spot | Gold is unpriced |
| `METALS_API_KEY` | Paid | Gold spot | as above |
| `DATABASE_URL` | Free tier available | Durable storage | Reports and journal live in server memory and are lost on recycle |
| `REPORT_SIGNING_PRIVATE_KEY` | Free | Report signing | Reports are stored unsigned and cannot be verified later |
| `REPORT_SIGNING_KEY_ID` | Free | Display only | Derived from the key itself |
| `CRON_SECRET` | Free | Scheduled runs | `/api/cron/daily` returns 503 |
| `OPERATOR_API_TOKEN` | Free | Manual runs, decisions, outcomes | Those endpoints return 503 |
| `NOTIFICATION_WEBHOOK_URL` | Free | Alerts | Findings are returned in the response but not pushed anywhere |

An unset secret **closes** its endpoint rather than opening it. Skipping an
authorisation check when no secret is configured would turn a forgotten
variable into an open endpoint on the route that triggers runs.

---

## 2. `SEC_EDGAR_USER_AGENT` — start here

This is the highest-value variable in the table and it is free.

The SEC's fair-access policy requires every request to identify the requester.
It is not a credential and not a secret; it is a contact string, and NeoOS
refuses to send anonymous traffic to a public agency without one.

```
SEC_EDGAR_USER_AGENT=NeoOS CIO you@yourdomain.com
```

With this set and nothing else, NeoOS can retrieve filed accounts, compute
fundamentals, and rate US equities. Assets will report `partial_live` rather
than `live_verified` because a price is the other half of the test — see
[LIVE_DATA_STATES.md](LIVE_DATA_STATES.md).

---

## 3. Generating a signing key

Run locally. The private key never leaves your environment.

```bash
node -e "
const {generateKeyPairSync,createHash}=require('crypto');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'der'});
console.log('REPORT_SIGNING_PRIVATE_KEY=' + privateKey.export({type:'pkcs8',format:'der'}).toString('base64url'));
console.log('public key (safe to publish)=' + pub.toString('base64url'));
console.log('key id=ed25519-' + createHash('sha256').update(pub).digest('hex').slice(0,16));
"
```

Set the private key in your host's environment settings. Publish the public key
and key id wherever an auditor can reach them — a signature nobody can check
against a known key proves nothing.

**Rotation.** Generate a new pair and replace the private key. Reports signed
with the old key will verify as `key_unknown` until the old public key is added
back to the trusted set. That is the correct behaviour: a report whose signing
key you no longer recognise should not silently read as verified.

---

## 4. Database

Any PostgreSQL will do — Supabase, Neon, RDS, or local. Use a pooled connection
string on serverless hosts; a direct connection exhausts the database's
connection limit under load.

```
DATABASE_URL=postgresql://user:password@host:6543/postgres?sslmode=require
```

The schema is created on first use (`migrate()` runs on every cold start and is
idempotent). It is defined in `src/server/persistence/schema.sql` and is
append-only throughout: no `UPDATE`, no `DELETE`, and a trigger on every table
rejects both if anything ever tries.

Without a database the application still runs. It reports `durable: false` in
the UI and says entries will be lost, which is the honest description of holding
a decision journal in a serverless function's memory.

---

## 5. Scheduled runs

`vercel.json` declares the schedule:

```json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "30 10 * * 1-5" }] }
```

10:30 UTC on weekdays — after US filings are typically accepted, before most
European decisions get made. Adjust to your own routine.

Vercel sends `Authorization: Bearer $CRON_SECRET`. A retried invocation is safe:
report ids are content-addressed and storage is append-only, so a repeat cannot
duplicate or overwrite a report.

---

## 6. Verifying a deployment

```bash
# What is configured, and what is missing.
curl https://your-deployment/api/health

# Trigger a run manually.
curl -X POST -H "Authorization: Bearer $OPERATOR_API_TOKEN" \
  https://your-deployment/api/cycle/run

# Fetch the latest report, verified on read.
curl https://your-deployment/api/report/latest
```

A run that cannot happen returns 409 with a list of what is missing. It does not
fall back to fixture data — see [SERVER_ARCHITECTURE.md](SERVER_ARCHITECTURE.md)
for why that refusal matters more than it might appear.

---

## 7. What the browser cockpit is

With nothing configured, NeoOS still renders a complete cockpit from bundled
fixture records. That is deliberate and it is labelled: the data-state badge, the
provenance labels, and the server-report panel on Timeline all say so.

The fixture cockpit demonstrates the interface. It is not market intelligence,
and no amount of configuration turns it into any — configuring providers produces
*new*, server-generated reports rather than promoting the fixtures.
