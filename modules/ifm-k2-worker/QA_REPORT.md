# IFM K2 Worker Adapter — QA evidence

Date: 2026-11-22

- Source package: `modules/ifm-k2-worker` in `abztabz/NeoOS` proposed branch; install state: **not deployed**.
- Test command: `node --test tests/*.test.mjs` using Node 22.16.0.
- Coverage: owner authorization gate, expiry and data zone, bounded caps, conditional idempotency reservation, one request per ID, uncertain network failures, no automatic retries, tool execution rejection, malformed/partial JSON rejection, cancellation semantics, read-only JSON QA gate, simulated concurrent caller, and worker template flags.
- IFM real cloud calls: **0**. IFM credentials accessed: **0**. Local/hosted NeoStudio runtime modified: **no**.
- Known blocker: NeoStudio's published ChatGPT connector currently exposes neither `neo_k2_submit` nor `neo_k2_status`; its Mac host source is not in `abztabz/NeoOS`. Runtime owner or release source is necessary before live integration can be verified.
- Tests are simulation-only; all live gates explicitly pending.