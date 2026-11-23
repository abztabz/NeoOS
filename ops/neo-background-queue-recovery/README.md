# NeoStudio worker queue — controlled recovery v0.1

**Target:** existing `com.neostudio.background` macOS launchd service, scoped to the signed-in user's `gui/<uid>` or `user/<uid>` launchd domain. This is a **one-time recovery**, not a permanent scheduler patch.

## Verified live symptoms (23 November 2026)

- The paired Mac reports NeoStudio 2.18.71 online, but background job `7f7f4415-75f5-4e5b-8bfe-e47a1834fb7f` remains `queued` without an observed claim.
- A harmless model-status command `e0e441e6-9582-40f6-b99f-fb3481ad5970` remains `queued`.
- The old QA job `b1de7819-3493-4358-b895-720e1fae0f40` remains `leased`, `cancel_requested=true` after an attempted cancellation. This may indicate an expired/unacknowledged lease but its causal relationship to other queued jobs is **not confirmed**.
- Prior Ollama monitor passed bounded text/JSON/vision but `normal_calibration_granted=false`. This is a **separate** admission issue, not proof the queue consumer is healthy.

## What the script does

1. Locally locates the exact NeoStudio background launchd service. If it cannot find it, **stops without changing anything**.
2. Writes a private before-service diagnostic to `~/NeoOS/diagnostics/queue-recovery-*` (`umask 077`). It does not upload logs.
3. Asks the operator to confirm NeoStudio has no other active work.
4. Calls `launchctl kickstart -k` for **only** the located service; does not kill arbitrary processes, disable model guards, remove locks or delete stored jobs.
5. Reads the service state after restart. It **does not** claim the worker resumed: the queued job IDs must be verified afterward over the live bridge, without duplicate submissions.

## One operator action on the Mac

Download this folder to the Mac; double-click **Recover_NeoStudio_Background.command**, approve only if no render/task is active, and share the final message. macOS may block unfamiliar downloaded `.command` files; do **not** disable Gatekeeper or run an unknown installer to get around that. The recovery never requests a password or elevated permissions.

## Exact acceptance

After the restart, the existing queued background job must change to `leased`/`running`/terminal, and the diagnostic status job must be claimed. Success requires a **real terminal response** with job evidence, not just a launchd exit code. If neither progresses, inspect the actual NeoStudio 2.18.71 Mac bridge consumer logs and server lease/queue authorization; this utility does not fix those source/runtime defects.

## Rollback / safety

No files or config are modified outside the private diagnostic directory; launchd service is restarted, not uninstalled. If NeoStudio loses its background service, start NeoStudio normally and inspect local logs; do not restart repeatedly. Existing in-flight worker jobs may be interrupted, which is why the script requires an idle-state confirmation.

## Evidence states

- Script syntax and mocks: testable in isolated environment, not evidence of execution on the owner's Mac.
- Actual Mac service restart: **not performed through the current ChatGPT connector**.
- Queue resolution: **requires live post-restart poll**.

Tracked engineering issue: https://github.com/abztabz/NeoOS/issues/13