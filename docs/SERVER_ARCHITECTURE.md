# Server architecture

Sprint 4 added a layer, it did not replace one. The engine and the intelligence
pipeline are unchanged; `src/server/` sits in front of them and does the things
only a server can do honestly.

```
UI  →  server  →  intelligence  →  engine  →  domain
```

The dependency direction is one-way and enforced by a test. The engine still has
no concept of a provider, and the pipeline still has no concept of a credential.

---

## 1. Why a server layer at all

Three capabilities were impossible in a browser, and each of them is what the
sprint was for:

- **Credentials.** A browser cannot hold an API key. Anything it can read, the
  user can read, and so can any script on the page.
- **Durability.** Browser storage is per-device and clearable. A decision
  journal that vanishes with a cache clear is not a record.
- **Integrity.** Signing requires a key the editing party cannot reach. In a
  browser, the editing party is the key holder.

---

## 2. Execution contexts

| Context | Can claim live | Persists | Meaning |
|---|---|---|---|
| `server_live` | yes | yes | Credentialed server run |
| `server_manual` | no | yes | Server run over operator-supplied evidence |
| `client_fixture` | no | no | Browser run over bundled records |
| `client_manual` | no | no | Browser run over an imported file |
| `disabled` | no | no | No run happened |

`contextPermitsLive()` returns true for exactly one of these. The orchestrator
**throws** if a non-server context produces records claiming live retrieval —
not a warning, not a downgrade. A browser holds no credentials, so that
combination means something is wired wrong, and the failure mode of continuing
is a published live claim the environment cannot back.

---

## 3. The refusal that matters most

When no live provider is configured, the server run returns 409 and produces
nothing.

It would be easy to fall back to fixtures here. The application already has a
complete fixture universe, the run would succeed, the dashboard would populate,
and everything would look healthy.

It would also attach the credibility of the entire apparatus — a signed,
versioned, server-generated, durably stored report with a verifiable signature —
to invented numbers. Every honesty control in the system exists to prevent
exactly that, and a fallback here would defeat all of them at once. The fixture
cockpit stays in the browser, where it is labelled, and the server produces
nothing rather than something plausible.

---

## 4. Order of operations in a cycle

1. Run the existing daily Morpheus cycle. Every score still comes from the engine.
2. **Honesty gate** — refuse if the context cannot back a live claim.
3. **Assess** each asset's live state from raw records and their identity
   resolutions. Raw records are used because only they carry provider mode;
   normalized evidence looks identical whether it came from EDGAR or a fixture.
4. **Clamp** each assessment to its jurisdiction's policy ceiling. An asset can
   fall short of its ceiling; it can never exceed it.
5. **Roll up** to a global report state. `live_verified` requires every supported
   asset to be live.
6. **Version** into a v4.0 envelope with lineage and provider versions.
7. **Sign**, then immediately **verify what was just signed**. A broken signing
   configuration should surface now, not during an audit.
8. **Store**, then append a journal entry.

The order is not incidental. Assessment precedes labelling, signing precedes
storage, and the run is called live only after the assessment says so.

---

## 5. `evidenceCutoff` versus `generatedAt`

Two different instants, kept separate on purpose.

`generatedAt` is when the run finished. `evidenceCutoff` is the newest
publication time across every record the run saw. A 06:00 run working from a
filing accepted at 21:00 the previous evening has a cutoff of 21:00.

Collapsing them would make every report look as fresh as the moment it was
generated, which is the specific illusion that makes stale analysis dangerous.

---

## 6. Module map

| Path | Responsibility |
|---|---|
| `config/env.ts` | The only module that reads credentials. Throws if loaded in a browser |
| `config/source-policy.ts` | Prohibited source kinds; per-jurisdiction ceilings |
| `config/portfolio.ts` | Operator context, and the explicit undeclared default |
| `providers/sec-edgar/` | Filings and fundamentals, tier 1 |
| `providers/prices/` | Vendor-neutral licensed price feed, tier 2 |
| `providers/gold/basis.ts` | Gold price basis and unit conversion |
| `valuation/from-filings.ts` | Fundamental analysis from filed accounts |
| `orchestration/assess.ts` | Per-asset live assessment and policy clamping |
| `orchestration/server-cycle.ts` | The cycle above |
| `persistence/` | Append-only storage port, memory and Postgres |
| `signing/sign.ts` | Ed25519 signing and verification |
| `api/auth.ts` | Constant-time authorisation, rate limiting |
| `notifications/dispatch.ts` | Best-effort alerting on findings |
| `outcome/review.ts` | Decision outcome review and process quality |

---

## 7. What is still browser-side

The cockpit itself. Sprint 3's client pipeline is untouched and continues to run
fixture and manual-import cycles in the browser, because a demonstration that
requires a database and a licensed feed is not a demonstration.

The Timeline workspace carries a server-report panel that states which of the two
you are looking at, per asset, with the signature status attached.
