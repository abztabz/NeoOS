import { authorizeOperator, denied, rateLimit } from "@/server/api/auth";
import { runCycleNow } from "@/server/api/run";
import { parsePortfolioContext } from "@/server/config/portfolio";
import { dispatchNotification, severityForAlerts } from "@/server/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** A portfolio context large enough to be an attack is not a portfolio context. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Operator-triggered cycle.
 *
 * Same run as the scheduled path, different trigger recorded. The optional body
 * supplies a portfolio context; without one the run proceeds against an
 * explicitly undeclared portfolio and says so, rather than assuming a cash
 * position nobody stated.
 */
export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("cycle:run", 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many manual runs this hour.", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: `Request body exceeds ${MAX_BODY_BYTES} bytes.` },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  let context;
  if (raw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
    }
    const result = parsePortfolioContext((parsed as { context?: unknown })?.context ?? parsed);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    context = result.context;
  }

  const outcome = await runCycleNow({ trigger: "manual_api", triggeredBy: auth.principal, context });
  if (!outcome.ok) {
    return Response.json(
      { ran: false, reason: outcome.reason, missing: outcome.missing },
      { status: outcome.status, headers: { "cache-control": "no-store" } },
    );
  }

  const { result } = outcome;
  const severity = severityForAlerts(result.alerts, result.envelope !== null);
  if (severity !== "info") {
    await dispatchNotification({
      severity,
      title: `Manual cycle: ${result.liveState.replace("_", " ")}`,
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
      verification: result.envelope?.verification.status ?? null,
      stored: result.stored,
      storeReason: result.storeReason,
      evidenceCounts: result.cycle.evidenceCounts,
      alerts: result.alerts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
