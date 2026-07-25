import { getReportStore } from "@/server/persistence";
import { buildLiveAdapters, readiness, signingMaterial } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational status. Public, and therefore carefully bounded.
 *
 * It answers "is this deployment configured, and are its providers working" and
 * nothing else. Every credential appears as a boolean; the signing key id is
 * included because it is a public fingerprint an auditor needs in order to
 * verify a report, and the private key is never touched by this handler.
 *
 * The temptation with a health endpoint is to make it useful for debugging by
 * including a bit more. That is exactly how a health endpoint becomes an
 * information-disclosure bug.
 */
export async function GET() {
  const ready = readiness();
  const store = getReportStore();
  const storeHealth = await store.health();
  const providers = buildLiveAdapters().map((adapter) => {
    const d = adapter.describe();
    return {
      providerId: d.providerId,
      providerName: d.providerName,
      mode: d.mode,
      health: d.health,
      configured: d.configured,
      sourceTier: d.sourceTier,
      capabilities: d.capabilities,
      lastSuccessfulRetrieval: d.lastSuccessfulRetrieval,
      failureReason: d.failureReason,
      legalNotes: d.legalNotes,
    };
  });

  const keys = signingMaterial();

  return Response.json(
    {
      canRunLive: ready.canRunLive,
      detail: ready.detail,
      missing: ready.missing,
      configuration: ready.configuration,
      signing: { configured: keys.privateKey !== null, keyId: keys.keyId },
      storage: storeHealth,
      providers,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
