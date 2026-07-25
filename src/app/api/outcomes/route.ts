import { authorizeOperator, denied, rateLimit } from "@/server/api/auth";
import { getReportStore } from "@/server/persistence";
import {
  MINIMUM_REVIEW_HORIZON_DAYS,
  outcomeReviewSchema,
  reviewDueAt,
  summariseProcessQuality,
  type OutcomeReview,
} from "@/server/outcome/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outcome reviews — the feedback loop on recorded decisions.
 *
 * GET returns reviews already recorded, the process-quality summary, and the
 * queue of decisions old enough to judge. POST records one review.
 *
 * Reviews are append-only like everything else. A review that can be edited
 * after the fact is a review that gets edited after the fact, usually to agree
 * with what happened next.
 */
export async function GET(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const store = getReportStore();
  await store.migrate();

  const stored = await store.listOutcomes(200);
  const reviews = stored
    .map((row) => outcomeReviewSchema.safeParse(row.payload))
    .filter((r) => r.success)
    .map((r) => r.data as OutcomeReview);

  const cutoff = new Date(Date.now() - MINIMUM_REVIEW_HORIZON_DAYS * 86_400_000).toISOString();
  const queue = await store.listDecisionsAwaitingReview(cutoff);

  return Response.json(
    {
      reviews,
      processQuality: summariseProcessQuality(reviews),
      awaitingReview: queue.map((d) => ({
        decisionId: d.decisionId,
        assetId: d.assetId,
        recordedAt: d.recordedAt,
        kind: d.kind,
        dueAt: reviewDueAt(d.recordedAt),
      })),
      reviewHorizonDays: MINIMUM_REVIEW_HORIZON_DAYS,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  const limit = rateLimit("outcomes:write", 60, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json({ error: "Too many writes this hour." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const parsed = outcomeReviewSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      { error: `Outcome review is invalid — ${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}.` },
      { status: 400 },
    );
  }

  const store = getReportStore();
  await store.migrate();

  // A review of a decision that was never recorded has nothing to review.
  const decisions = await store.listDecisions(500);
  if (!decisions.some((d) => d.decisionId === parsed.data.decisionId)) {
    return Response.json(
      { error: `No decision with id ${parsed.data.decisionId} has been recorded.` },
      { status: 404 },
    );
  }

  await store.saveOutcome({
    outcomeId: parsed.data.outcomeId,
    decisionId: parsed.data.decisionId,
    reviewedAt: parsed.data.reviewedAt,
    payload: parsed.data,
  });

  return Response.json(
    { recorded: true, outcomeId: parsed.data.outcomeId },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
