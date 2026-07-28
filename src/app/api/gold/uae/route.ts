import { buildUaeGoldBoard } from "@/server/gold/uae-gold-service";
import { marketProvidersWithManualEntries } from "@/server/runtime";
import { unhandled } from "@/server/api/storage-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The UAE gold board.
 *
 * Public and read-only: it exposes a reference price and the name of the source
 * that published it, which is not confidential. No credential, provider key or
 * endpoint URL is included — the trail carries provider *ids* and outcomes so a
 * reader can see which sources were consulted, not how to call them.
 *
 * When no gold provider is configured this returns 200 with `available: false`
 * and the reason, rather than an error status. A missing subscription is a
 * configuration fact the page must render, not a request failure.
 */
export async function GET() {
  try {
    const board = await buildUaeGoldBoard({
      providers: await marketProvidersWithManualEntries(),
      now: new Date(),
      // NeoOS publishes no gold Good Buy discipline per gram yet. Passing null
      // means the board omits the row rather than inventing a level.
      goodBuy24KPerGram: null,
    });

    return Response.json(board, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return unhandled(error, "GET /api/gold/uae");
  }
}
