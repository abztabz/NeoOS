import { z } from "zod";

/**
 * Where a cycle actually ran, and therefore what it is allowed to claim.
 *
 * Sprint 3 could only run in the browser, so provenance was a property of the
 * providers alone. Now a run can happen on the server with credentials the
 * browser will never see, and the two situations are not interchangeable: a
 * browser run cannot reach a licensed feed, so it must not be able to produce
 * a report that says it did.
 *
 * This is enforced structurally by `contextPermitsLive`, not by convention.
 */

export const executionContexts = [
  "server_live",
  "server_manual",
  "client_fixture",
  "client_manual",
  "disabled",
] as const;
export type ExecutionContext = (typeof executionContexts)[number];

export const executionContextLabels: Record<ExecutionContext, string> = {
  server_live: "Server — live providers",
  server_manual: "Server — manual evidence",
  client_fixture: "Browser — fixture intelligence",
  client_manual: "Browser — manual evidence",
  disabled: "Disabled",
};

export const executionContextDescriptions: Record<ExecutionContext, string> = {
  server_live:
    "Ran on the server with credentialed providers. This is the only context that can produce live_verified.",
  server_manual:
    "Ran on the server against operator-supplied evidence. Durable and signed, but not retrieved from a live source.",
  client_fixture:
    "Ran in the browser against bundled fixture records. Illustrative only.",
  client_manual: "Ran in the browser against an imported evidence file.",
  disabled: "No cycle ran.",
};

/**
 * Only a server run with credentials may claim live data. The browser has no
 * credentials by construction — see `src/server/config/env.ts` — so a client
 * context claiming `live` is a bug, and the orchestrator rejects it.
 */
export function contextPermitsLive(context: ExecutionContext): boolean {
  return context === "server_live";
}

export function contextIsServer(context: ExecutionContext): boolean {
  return context === "server_live" || context === "server_manual";
}

/** Whether results from this context are eligible for durable, signed storage. */
export function contextIsPersistable(context: ExecutionContext): boolean {
  return contextIsServer(context);
}

export const executionContextRecordSchema = z.object({
  context: z.enum(executionContexts),
  /** Deployment region or host label, where the runtime exposes one. */
  runtimeRegion: z.string().nullable(),
  /** How the run was started. Scheduled runs are unattended by definition. */
  trigger: z.enum(["scheduled", "manual_api", "manual_ui", "backfill"]),
  /** Identifier of whoever or whatever started it. Never a credential. */
  triggeredBy: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
});
export type ExecutionContextRecord = z.infer<typeof executionContextRecordSchema>;
