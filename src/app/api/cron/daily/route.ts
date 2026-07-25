import { authorizeScheduler, denied, rateLimit } from "@/server/api/auth";
import { runCycleNow } from "@/server/api/run";
import { dispatchNotification } from "@/server/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Cycles fetch several providers in sequence; give them room. */
export const maxDuration = 120;

/**
 * The scheduled daily cycle.
 *
 * Vercel Cron issues a GET with `Authorization: Bearer $CRON_SECRET`, which is
 * why this is a GET despite having effects — the platform's contract, not a
 * design choice. Storage is append-only and report ids are content-addressed,
 * so a retried invocation cannot duplicate or overwrite anything, which is what
 * makes the non-idempotent-looking verb safe here.
 *
 * A run that cannot happen returns 409 with what is missing. It never falls
 * back to fixture data: a signed, stored report carries the weight of the whole
 * system, and inventing its contents would spend that credibility on nothing.
 */
export async function GET(request: Request) {
  const auth = authorizeScheduler(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("cron:daily", 4, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "The daily cycle has already run several times this hour.", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  const outcome = await runCycleNow({ trigger: "scheduled", triggeredBy: auth.principal });

  if (!outcome.ok) {
    await dispatchNotification({
      severity: "warning",
      title: "Scheduled cycle did not run",
      body: outcome.reason,
      details: outcome.missing,
    });
    return Response.json(
      { ran: false, reason: outcome.reason, missing: outcome.missing },
      { status: outcome.status, headers: { "cache-control": "no-store" } },
    );
  }

  const { result } = outcome;
  if (result.alerts.length > 0) {
    await dispatchNotification({
      severity: result.envelope ? "warning" : "error",
      title: `Daily cycle: ${result.liveState.replace("_", " ")}`,
      body: `Run ${result.cycle.runId} finished as ${result.cycle.state}.`,
      details: result.alerts,
    });
  }

  return Response.json(
    {
      ran: true,
      runId: result.cycle.runId,
      cycleState: result.cycle.state,
      liveState: result.liveState,
      reportId: result.envelope?.content.reportId ?? null,
      signed: result.envelope?.signature !== null && result.envelope !== null,
      verification: result.envelope?.verification.status ?? null,
      stored: result.stored,
      storeReason: result.storeReason,
      alerts: result.alerts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
