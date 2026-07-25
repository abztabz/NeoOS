import { getReportStore } from "@/server/persistence";
import { verifyEnvelope } from "@/server/signing/sign";
import { signingMaterial } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Report ids are content-addressed and generated; anything else is rejected. */
const REPORT_ID = /^report-[A-Za-z0-9-]{1,120}$/;

/**
 * A specific report by id, verified on read.
 *
 * This is the endpoint that makes an audit possible: given a report id from a
 * journal entry, anyone can fetch the artefact and check its signature against
 * the published key. It is intentionally readable without a token — a report
 * whose integrity can only be checked by its author is not verifiable in any
 * useful sense.
 */
export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await context.params;

  // Validate before touching storage. The id reaches a parameterised query, so
  // this is defence in depth rather than the only guard.
  if (!REPORT_ID.test(reportId)) {
    return Response.json({ error: "Malformed report id." }, { status: 400 });
  }

  const envelope = await getReportStore().getReport(reportId);
  if (!envelope) {
    return Response.json({ error: "No report with that id." }, { status: 404 });
  }

  const outcome = verifyEnvelope(envelope, signingMaterial().trustedKeys);
  return Response.json(
    {
      report: {
        ...envelope,
        verification: { status: outcome.status, checkedAt: new Date().toISOString(), detail: outcome.detail },
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
