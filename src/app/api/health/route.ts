import { getReportStore } from "@/server/persistence";
import { buildLiveAdapters, buildMarketProviders, readiness, signingMaterial } from "@/server/runtime";
import { freelyCoveredAssetClasses, unsupportedAssetClasses } from "@/server/providers/market/hierarchy";
import { pricingService } from "@/server/pricing/registry";

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

  // Market providers are reported separately from the evidence adapters above,
  // and deliberately include the free official ones even when they are
  // unreachable. An operator looking at a failing deployment needs to be able to
  // tell "my environment has no egress" from "this needs a subscription", and a
  // provider list that omitted the free sources could not show them the
  // difference.
  const market = buildMarketProviders().map((provider) => {
    const d = provider.describe();
    return {
      providerId: d.providerId,
      providerName: d.providerName,
      sourceName: d.sourceName,
      sourceClass: d.sourceClass,
      observationClass: d.observationClass,
      assetClasses: d.assetClasses,
      configured: d.configured,
      requiresCredentials: d.requiresCredentials,
      requiresPaidSubscription: d.requiresPaidSubscription,
      outboundHosts: d.outboundHosts,
      unavailableReason: d.unavailableReason,
      attribution: d.attribution,
    };
  });

  return Response.json(
    {
      canRunLive: ready.canRunLive,
      detail: ready.detail,
      missing: ready.missing,
      optionalUpgrades: ready.optionalUpgrades,
      configuration: ready.configuration,
      network: ready.network,
      marketData: {
        ...ready.market,
        providers: market,
        freelyCovered: freelyCoveredAssetClasses(),
        unsupported: unsupportedAssetClasses(),
      },
      // What this deployment may honestly claim about the prices it displays.
      // Booleans and provider ids only: whether a credential exists is
      // operational fact, what it is never leaves the server.
      pricing: pricingService().describeCapability(),
      signing: { configured: keys.privateKey !== null, keyId: keys.keyId },
      storage: storeHealth,
      providers,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
