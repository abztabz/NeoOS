# Deploying NeoOS: Step-by-Step Setup

This guide walks through deploying a production NeoOS instance from scratch.

## Prerequisites

- Git
- Node.js 18+ with npm
- A PostgreSQL database (Supabase, Neon, RDS, or self-hosted)
- A Vercel account (or compatible serverless host)
- 15 minutes

## Part 1: Database Setup

NeoOS needs a PostgreSQL database for:
- Storing household position (intake)
- Preserving decision journal
- Caching reports with signatures

### Option A: Supabase (recommended for fastest start)

1. Go to https://supabase.com and create a project
2. In the Supabase dashboard, copy your **connection string**:
   - Settings → Database → Connection Pooler (Session mode, not Transaction)
   - Copy the PostgreSQL URI
3. Set `DATABASE_URL` in your deployment

**Security note:** Supabase auto-provisions with a default password. Rotate it first:
- Settings → Database → Reset Password
- Update DATABASE_URL with the new password

### Option B: Neon

1. Go to https://console.neon.tech and create a project
2. Copy the connection string from the dashboard
3. Append `?sslmode=require` if not already present
4. Set `DATABASE_URL`

### Option C: RDS / Self-hosted

1. Create a PostgreSQL database (any version 13+)
2. Create a connection string: `postgresql://user:password@host:5432/dbname?sslmode=require`
3. Set `DATABASE_URL`

## Part 2: Generate Secrets

Create three secrets:

```bash
# 1. Operator API token (for the Run button)
OPERATOR_TOKEN=$(openssl rand -base64 32)
echo "OPERATOR_API_TOKEN=$OPERATOR_TOKEN"

# 2. Report signing key (for verifiable reports)
node -e "
const {generateKeyPairSync,createHash}=require('crypto');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'der'});
console.log('REPORT_SIGNING_PRIVATE_KEY=' + privateKey.export({type:'pkcs8',format:'der'}).toString('base64url'));
console.log('REPORT_SIGNING_KEY_ID=ed25519-' + createHash('sha256').update(pub).digest('hex').slice(0,16));
"

# 3. Cron secret (for scheduled runs, optional)
CRON_TOKEN=$(openssl rand -base64 32)
echo "CRON_SECRET=$CRON_TOKEN"
```

Save these values securely — you'll need them for deployment.

## Part 3: Configure Evidence Providers

At minimum, set the SEC EDGAR User-Agent (free, no credential needed):

```bash
SEC_EDGAR_USER_AGENT="NeoOS CIO you@yourdomain.com"
```

This enables:
- SEC filing retrieval for US companies
- Fundamental valuation from financial statements
- Foundation for the evidence layer

Optional providers (for richer data, paid):

| Provider | Cost | Effect | Setup |
|----------|------|--------|-------|
| Market-Data (equity quotes) | Paid | US/global equity prices update at venue latency | MARKET_DATA_BASE_URL + MARKET_DATA_API_KEY |
| Metals (gold spot) | Paid | Gold pricing at venue latency | METALS_BASE_URL + METALS_API_KEY |
| Gold-API (free fallback) | Free | Automatic, no setup needed | Already wired as fallback |

## Part 4: Create `.env.local` File

In your local clone, create `.env.local`:

```bash
# Required
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
OPERATOR_API_TOKEN=<your-operator-token>
SEC_EDGAR_USER_AGENT=NeoOS CIO you@yourdomain.com

# Signing (from Part 2)
REPORT_SIGNING_PRIVATE_KEY=<your-base64url-key>
REPORT_SIGNING_KEY_ID=<your-key-id>

# Cron (optional, only if you want scheduled runs)
CRON_SECRET=<your-cron-token>

# Premium providers (optional)
# MARKET_DATA_BASE_URL=...
# MARKET_DATA_API_KEY=...
```

Never commit this file. It's in `.gitignore`.

## Part 5: Test Locally

Before deploying, verify everything works:

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# In another terminal, check the health endpoint
curl http://localhost:3000/api/health

# Expected response (with your config):
{
  "database": true,
  "secEdgar": true,
  "signing": true,
  "operatorApi": true,
  "marketData": false,  // if not configured
  "metals": false,      // if not configured
  ...
}
```

All `true` values shown? Great. Missing ones are optional.

## Part 6: Deploy to Vercel

1. Push your code to GitHub (if not already done)
2. Go to https://vercel.com/new and import the NeoOS repository
3. In the "Environment Variables" section, add each key from `.env.local`:
   - DATABASE_URL
   - OPERATOR_API_TOKEN
   - SEC_EDGAR_USER_AGENT
   - REPORT_SIGNING_PRIVATE_KEY
   - REPORT_SIGNING_KEY_ID
   - CRON_SECRET (if configured)
4. Click Deploy

Vercel will build and deploy automatically. Check the build logs for any errors.

## Part 7: Verify Deployment

Once deployed, test the health endpoint:

```bash
curl https://your-deployment.vercel.app/api/health
```

Should return the same configuration as local, with all required fields `true`.

## Part 8: Run a Cycle Manually

With the Run button now wired, test a full cycle:

1. Open https://your-deployment.vercel.app/intake
2. Enter a household position (or use the demo)
3. Go to the home page and click the Run button
4. The button should call `/api/cycle/run` with your OPERATOR_API_TOKEN

Success indicators:
- Run completes with status (under 10 seconds typically)
- A new report is stored and signed
- The cockpit updates with fresh numbers

## Part 9: Optional: Schedule Daily Runs

To run NeoOS automatically each day:

1. In `vercel.json`, the schedule is already set:
   ```json
   { "crons": [{ "path": "/api/cron/daily", "schedule": "30 10 * * 1-5" }] }
   ```
   (10:30 UTC on weekdays)

2. Adjust the schedule if needed. Vercel will send:
   ```
   Authorization: Bearer $CRON_SECRET
   ```

3. Deploy again. Vercel activates the schedule automatically.

## Troubleshooting

### Deployment fails at build time

Check the Vercel build logs for TypeScript or lint errors. These are the same checks that run locally:

```bash
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run build      # Next.js build
```

Run these locally to debug before re-deploying.

### `/api/health` reports false for database

The DATABASE_URL isn't reachable from Vercel:
- Verify the connection string is correct
- Check if your database has firewall rules blocking Vercel's IP range
- For Supabase: Settings → Database → Connection Pooler → copy the **Pooler** URI, not the direct connection URI

### Run button doesn't work

Check the error in the browser console:
- **401 Unauthorized**: The OPERATOR_API_TOKEN isn't set on the server
- **409 Conflict**: A readiness refusal (missing provider, etc.) — check `/api/health`
- **503 Service Unavailable**: The endpoint is unconfigured (shouldn't happen if `/api/health` is green)

## What's Next?

Your NeoOS deployment is now live. You can:

1. **Import real household data** via the Intake form on /intake
2. **Run cycles manually** via the Run button on the home page
3. **Schedule daily runs** to get fresh evidence each morning
4. **Invite advisors** to review positions (future feature)

For detailed configuration reference, see `docs/DEPLOYMENT.md`.

## Support

For issues or questions:
- Check `docs/BUILD_LOG.md` for recent changes
- Review recent commits for what changed
- Read the error details in `/api/health` response
