import { z } from "zod";
import { authorizeOperator, denied } from "@/server/api/auth";
import { unhandled } from "@/server/api/storage-error";
import { pricingService } from "@/server/pricing/registry";
import { resolveIdentity } from "@/server/pricing/instrument";
import { instrumentAssetTypes } from "@/server/pricing/instrument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A price for one instrument, through the only path that is allowed to produce
 * one.
 *
 * Operator-authenticated, unlike `/api/gold/uae`. A gold reference is a public
 * fact about a metal; an instrument quote is tied to a specific holding this
 * household has declared, and the list of instruments somebody asks about is
 * itself a statement about what they own.
 *
 * The route is thin on purpose. Identity resolution, validation, freshness,
 * caching, fallback and the source-switch record all live in the service, so
 * there is one implementation of those rules rather than one per caller.
 */

/**
 * No `id` field. The identity's id is *derived* from symbol and venue by
 * `resolveIdentity`, so accepting one would let a caller assert an identity the
 * resolver never agreed to — and the resolver refusing an ambiguous symbol is
 * the whole point of it running first.
 */
const requestSchema = z.object({
  symbol: z.string().min(1).max(40),
  name: z.string().min(1).max(200).optional(),
  assetType: z.enum(instrumentAssetTypes).optional(),
  exchange: z.string().max(60).optional(),
  mic: z.string().max(10).optional(),
  currency: z.string().length(3).optional(),
  /** providerId → the key that provider knows this instrument by. */
  providerMappings: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) return denied(auth);

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Instrument description was not usable.",
          detail: parsed.error.issues[0]?.message ?? "invalid",
          quote: null,
        },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    // Identity first, always. The service refuses an ambiguous symbol anyway;
    // resolving here means the caller gets the reason rather than a bare null.
    const identity = resolveIdentity(parsed.data);
    const result = await pricingService().getPrice(identity);

    return Response.json(
      {
        instrumentId: result.instrumentId,
        identityStatus: identity.identityStatus,
        quote: result.quote,
        unavailableReason: result.unavailableReason,
        usableForDecision: result.usableForDecision,
        evidence: result.evidence,
        // Provider ids and outcomes only. Never endpoints, never credentials.
        trail: result.trail,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return unhandled(error, "POST /api/pricing/quote");
  }
}
