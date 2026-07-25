import { getReportStore } from "@/server/persistence";
import { verifyEnvelope } from "@/server/signing/sign";
import { signingMaterial } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The latest stored report, verified on the way out.
 *
 * Verification happens here, on read, rather than being trusted from what was
 * written at store time. The whole reason for signing is that storage sits
 * outside the trust boundary, so a `verification.status` that was computed
 * before the row was written proves nothing about the row now.
 *
 * A report whose signature fails is still returned, with the failure attached.
 * Withholding it would hide evidence of tampering from the only person in a
 * position to act on it; the UI's job is to refuse to render the numbers as
 * trustworthy, which it does off this field.
 */
export async function GET() {
  const store = getReportStore();
  const envelope = await store.getLatestReport();
  const storeHealth = await store.health();

  if (!envelope) {
    return Response.json(
      {
        report: null,
        storage: storeHealth,
        detail:
          "No server-generated report has been stored yet. The application continues to render its client-side cockpit, which is labelled as such.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const outcome = verifyEnvelope(envelope, signingMaterial().trustedKeys);
  return Response.json(
    {
      report: {
        ...envelope,
        verification: { status: outcome.status, checkedAt: new Date().toISOString(), detail: outcome.detail },
      },
      storage: storeHealth,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
