import { z } from "zod";
import { authorizeOperator, denied, rateLimit } from "@/server/api/auth";
import { getReportStore } from "@/server/persistence";
import { reviewDueAt } from "@/server/outcome/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the schema migration on first use. See the note in the intake route. */
export const maxDuration = 60;

/**
 * Recorded decisions.
 *
 * A decision is what the operator chose, which is a separate fact from what the
 * engine recommended. Both are stored, and a decision that departs from the
 * recommendation is a first-class outcome rather than an error — the point of
 * the journal is to make that departure visible later, not to discourage it.
 */
const decisionSchema = z.object({
  decisionId: z.string().min(1).max(120),
  reportId: z.string().nullable(),
  assetId: z.string().nullable(),
  recordedAt: z.iso.datetime({ offset: true }),
  kind: z.enum(["acted", "declined", "deferred", "partial", "posture_change"]),
  /** What the engine said, captured at the moment of deciding. */
  recommendationSnapshot: z.string(),
  /** Why the operator decided as they did. */
  reason: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().length(3).nullable(),
  decidedBy: z.string(),
});

export async function GET(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const store = getReportStore();
  await store.migrate();
  const decisions = await store.listDecisions(200);

  return Response.json(
    {
      decisions: decisions.map((d) => ({ ...d, reviewDueAt: reviewDueAt(d.recordedAt) })),
      storage: await store.health(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("decisions:write", 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json({ error: "Too many writes this hour." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      { error: `Decision is invalid — ${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}.` },
      { status: 400 },
    );
  }

  const store = getReportStore();
  await store.migrate();
  await store.saveDecision({
    decisionId: parsed.data.decisionId,
    reportId: parsed.data.reportId,
    assetId: parsed.data.assetId,
    recordedAt: parsed.data.recordedAt,
    kind: parsed.data.kind,
    payload: parsed.data,
  });

  return Response.json(
    { recorded: true, decisionId: parsed.data.decisionId, reviewDueAt: reviewDueAt(parsed.data.recordedAt) },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
