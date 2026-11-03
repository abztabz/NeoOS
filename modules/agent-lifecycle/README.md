# NeoOS Agent Lifecycle Manager — foundation v0.1

**Evidence state:** Implemented in source / pending CI and live runtime integration.

A small modular-monolith component for creating reusable **approved agent jobs** when needed, gating dispatch on safe capacity, reviewing results independently, keeping an audit record, and cancelling or retiring jobs with evidence. No new paid service is required.

## Supported roles

| Registry role | Neo bridge agent kind | Scope |
| --- | --- | --- |
| `sales.qualifier` | `extract_facts` | Extract explicitly supplied public facts; do not infer missing features |
| `sales.pitch_drafter` | `rewrite` | Rewrite preapproved pitch text; **never send** |
| `sales.researcher` | `subject_learner` | Bounded public-domain subject research |
| `ops.summarizer` | `summarize` | Summarize supplied text |

This is **not** an open-ended autonomous agent factory. These roles map to the agent kinds already advertised by the paired Mac's Neo 2.18.37 bridge. There is **no Google Maps browsing or outbound email capability in this module**. Prospector discovery needs a separate compliant data-source adapter. Outreach sending requires an explicit, authorized connector/action and the applicable legal/approval checks.

## States and assurance

`queued → dispatching → running → review_required → verified/rejected`

Alternative paths: `blocked`, `failed`, or `running → cancelling → cancelled`.

- Dispatch is **idempotent by requestId** and uncertain network dispatch **blocks** rather than blindly creating duplicates.
- No capacity probe or failed capacity preflight means **no dispatch**.
- No independent verifier means **review_required**, never a claim of verified completion.
- Only a backend `cancelled` observation confirms cancellation.
- Finished jobs stop occupying orchestration slots, but **model memory is NOT assumed released**. A separate resource probe with measurable evidence is required to record `memoryRelease: verified`.
- All activities are read-only tasks. Never send email, incur cost, change websites, run shell commands, or unload a shared Ollama model from this module.
- Rejected outputs require review; do not automatically retry potentially consequential actions.
- Avoid storing personal data or secrets in tasks/audit logs.

## Quick tests

```bash
cd modules/agent-lifecycle
npm test
```

Tests use an in-memory fake Neo bridge and never call the real paired Mac.

## Wiring into the live NeoOS runtime

The bridge adapter is **dependency-injected**, not embedded. An authorized runtime must implement:

```js
const transport = {
  assign: (payload) => neoBridge.assignAgent(payload),
  read: ({ job_id, include_entry }) => neoBridge.getAgentTask({ job_id, include_entry }),
  cancel: ({ job_id }) => neoBridge.cancelJob({ job_id })
};
const capacityProbe = async () => ({ safe: /* scheduler capacity verified */, reason: "" });
const verifier = async task => ({
  status: "verified", // only after independent substantive evidence review
  reviewer: "independent-reviewer-id",
  evidence: "review-record-id"
});
```

A local service/driver must call `manager.tick()` periodically or on state changes and persist state through `JsonFileStore` (single-process development only). Do **not** expose filesystem-based logs publicly or claim the manager is operating just because it exists in GitHub.

### Production gates

1. Confirm source-to-runtime relationship: the installed Mac Neo worker/scheduler implementation is not contained in this GitHub repo. Obtain the matching live runtime source/deployment channel before claiming installation.
2. Connect the injected adapter to the actual Neo bridge and verify its supported tool schemas and authorization scopes.
3. Replace the single-process JSON ledger with transactional durable storage and a one-leader lease before multiple managers.
4. Integrate the real scheduler capacity and observed memory metrics; do not invent model-unload results.
5. Add an independent QA implementation and review evidence registry before automatically setting verified.
6. Run a live but harmless test: create → wait → finish → review → release slot; separately cancel a running test job and confirm terminal state.
7. Run basic security review and regression tests, then release deliberately.

**No live sales messages or paid APIs are part of v0.1.**
