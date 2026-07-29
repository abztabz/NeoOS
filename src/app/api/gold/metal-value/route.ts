import { describeGoldSource, getGoldMetalValues } from "@/server/gold/metal-value-service";
import { unhandled } from "@/server/api/storage-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Gold metal value, AED per gram by purity.
 *
 * Public and read-only. A metal value derived from a public XAU/USD quote is a
 * fact about a commodity, not a statement about anybody's holdings — the
 * household's own gold weight lives behind the operator token elsewhere.
 *
 * Gold-API is called from here and only from here. The browser never touches
 * it: a client-side fetch would skip the cache, the validation and the
 * plausibility guard, which is everything that makes the number worth showing.
 *
 * A failure returns 200 with `available: false` and the reason. An unreachable
 * upstream is a state the page must render, not a request error.
 *
 * `?diagnose=1` forces a fresh call and reports which response fields were
 * parsed. That exists because the schema could not be observed at build time —
 * the build environment blocks this host — so the first production call is what
 * confirms the mapping. It returns no price the normal path would not.
 */
export async function GET(request: Request) {
  try {
    const diagnose = new URL(request.url).searchParams.get("diagnose") === "1";

    if (diagnose) {
      const described = await describeGoldSource();
      return Response.json(described, { headers: { "cache-control": "no-store" } });
    }

    const board = await getGoldMetalValues();
    return Response.json(board, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return unhandled(error, "GET /api/gold/metal-value");
  }
}
