// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  fetchGoldPrice,
  parseGoldResponse,
  toIsoTimestamp,
  validateObservation,
  GOLD_API_URL,
  MAX_MOVE_FRACTION,
  type GoldObservation,
} from "@/server/gold/gold-api-provider";
import {
  CACHE_TTL_MS,
  getGoldMetalValues,
  resetGoldCache,
} from "@/server/gold/metal-value-service";
import { computeMetalValues } from "@/domain/gold/metal-value";

/**
 * The Gold-API path.
 *
 * The response schema could not be observed when this was written — the build
 * environment's egress policy blocks the host — so these do two jobs. They pin
 * the behaviour that must hold whatever the schema turns out to be, and they
 * prove the parser survives several plausible shapes without ever inventing a
 * price when it survives none.
 */

const NOW = new Date("2026-07-29T12:00:00.000Z");
const STRUCK = "2026-07-29T11:55:00.000Z";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function observation(overrides: Partial<GoldObservation> = {}): GoldObservation {
  return {
    xauUsdPerTroyOunce: 3400,
    sourceUpdatedAt: STRUCK,
    retrievedAt: NOW.toISOString(),
    symbol: "XAU",
    sourceId: "gold-api-com",
    sourceName: "Gold-API.com XAU/USD",
    parsedFrom: { price: "price", timestamp: "updatedAt", symbol: "symbol" },
    raw: {},
    ...overrides,
  };
}

beforeEach(() => resetGoldCache());

/* ---------------- parsing ---------------- */

describe("parsing a valid response", () => {
  it("reads the documented shape", () => {
    const r = parseGoldResponse(
      { name: "Gold", price: 3400.25, symbol: "XAU", updatedAt: STRUCK },
      { retrievedAt: NOW.toISOString() },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.xauUsdPerTroyOunce).toBe(3400.25);
    expect(r.observation.sourceUpdatedAt).toBe(STRUCK);
    expect(r.observation.symbol).toBe("XAU");
  });

  it("records which field each value came from", () => {
    // Auditable parsing: the first production call tells us the real mapping
    // rather than leaving it to inference.
    const r = parseGoldResponse(
      { symbol: "XAU", value: 3400, timestamp: STRUCK },
      { retrievedAt: NOW.toISOString() },
    );
    expect(r.ok && r.observation.parsedFrom).toEqual({
      price: "value",
      timestamp: "timestamp",
      symbol: "symbol",
    });
  });

  it("accepts a quoted decimal and epoch seconds", () => {
    const r = parseGoldResponse(
      { symbol: "XAU", price: "3,400.50", timestamp: 1785326100 },
      { retrievedAt: NOW.toISOString() },
    );
    expect(r.ok && r.observation.xauUsdPerTroyOunce).toBe(3400.5);
    expect(r.ok && r.observation.sourceUpdatedAt).toMatch(/^2026-/);
  });

  it("normalises epoch milliseconds as well as seconds", () => {
    expect(toIsoTimestamp(1785326100)).toBe(toIsoTimestamp(1785326100000));
  });

  it("keeps the raw payload for later checking", () => {
    const payload = { symbol: "XAU", price: 3400, updatedAt: STRUCK };
    const r = parseGoldResponse(payload, { retrievedAt: NOW.toISOString() });
    expect(r.ok && r.observation.raw).toEqual(payload);
  });
});

describe("malformed responses", () => {
  it("refuses a non-object payload", () => {
    expect(parseGoldResponse("3400", { retrievedAt: NOW.toISOString() }).ok).toBe(false);
    expect(parseGoldResponse([1, 2], { retrievedAt: NOW.toISOString() }).ok).toBe(false);
  });

  it("refuses when no price field can be found, and reports what was there", () => {
    const r = parseGoldResponse(
      { metal: "gold", quote: 3400, updatedAt: STRUCK },
      { retrievedAt: NOW.toISOString() },
    );
    expect(r.ok).toBe(false);
    // The diagnostic that makes the first production call self-explaining.
    expect(!r.ok && r.observedKeys).toContain("quote");
  });

  it("refuses a missing timestamp rather than defaulting it to now", () => {
    // Defaulting would produce a figure that never ages, which defeats the
    // entire live/delayed/stale model.
    const r = parseGoldResponse({ symbol: "XAU", price: 3400 }, { retrievedAt: NOW.toISOString() });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("timestamp");
  });

  it("refuses a non-numeric price", () => {
    const r = parseGoldResponse(
      { symbol: "XAU", price: "unavailable", updatedAt: STRUCK },
      { retrievedAt: NOW.toISOString() },
    );
    expect(r.ok).toBe(false);
  });
});

/* ---------------- validation ---------------- */

describe("validation", () => {
  it("refuses zero and negative prices", () => {
    expect(validateObservation(observation({ xauUsdPerTroyOunce: 0 })).ok).toBe(false);
    expect(validateObservation(observation({ xauUsdPerTroyOunce: -5 })).ok).toBe(false);
  });

  it("refuses a price outside the plausible XAU/USD band", () => {
    // Guards against parsing a percentage change or an index level as a price.
    expect(validateObservation(observation({ xauUsdPerTroyOunce: 2.3 })).ok).toBe(false);
    expect(validateObservation(observation({ xauUsdPerTroyOunce: 500_000 })).ok).toBe(false);
  });

  it("refuses a symbol that is not XAU", () => {
    expect(validateObservation(observation({ symbol: "XAG" })).ok).toBe(false);
  });

  it("refuses a move larger than 20% from the last verified figure", () => {
    const r = validateObservation(observation({ xauUsdPerTroyOunce: 4200 }), {
      previousPrice: 3400,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("implausible");
  });

  it("accepts a move inside the tolerance", () => {
    const withinBand = 3400 * (1 + MAX_MOVE_FRACTION - 0.01);
    expect(
      validateObservation(observation({ xauUsdPerTroyOunce: withinBand }), { previousPrice: 3400 })
        .ok,
    ).toBe(true);
  });

  it("does not apply the movement guard on the first observation", () => {
    expect(validateObservation(observation(), { previousPrice: null }).ok).toBe(true);
  });
});

/* ---------------- fetching ---------------- */

describe("fetching", () => {
  it("calls the documented endpoint", async () => {
    let calledUrl = "";
    await fetchGoldPrice({
      now: () => NOW,
      fetchImpl: (async (url: string) => {
        calledUrl = String(url);
        return jsonResponse({ symbol: "XAU", price: 3400, updatedAt: STRUCK });
      }) as unknown as typeof fetch,
    });
    expect(calledUrl).toBe(GOLD_API_URL);
  });

  it("reports an HTTP error rather than throwing", async () => {
    const r = await fetchGoldPrice({
      now: () => NOW,
      fetchImpl: (async () => jsonResponse({}, 503)) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("503");
  });

  it("reports a network failure rather than throwing", async () => {
    const r = await fetchGoldPrice({
      now: () => NOW,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("ECONNREFUSED");
  });

  it("reports a non-JSON body rather than throwing", async () => {
    const r = await fetchGoldPrice({
      now: () => NOW,
      fetchImpl: (async () =>
        new Response("<html>maintenance</html>", { status: 200 })) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("JSON");
  });
});

/* ---------------- the cached board ---------------- */

describe("the board", () => {
  const ok = (price = 3400, struck = STRUCK) =>
    (async () => jsonResponse({ symbol: "XAU", price, updatedAt: struck })) as unknown as typeof fetch;

  it("returns live values and both timestamps", async () => {
    const board = await getGoldMetalValues({ now: () => NOW, fetchImpl: ok() });

    expect(board.available).toBe(true);
    expect(board.status).toBe("live");
    expect(board.values!.aedPerGram24K).toBeCloseTo(computeMetalValues(3400).aedPerGram24K, 8);
    expect(board.sourceUpdatedAt).toBe(STRUCK);
    expect(board.retrievedAt).toBe(NOW.toISOString());
    expect(board.sourceName).toContain("Gold-API");
  });

  it("serves the second read from cache without calling again", async () => {
    let calls = 0;
    const counting = (async () => {
      calls++;
      return jsonResponse({ symbol: "XAU", price: 3400, updatedAt: STRUCK });
    }) as unknown as typeof fetch;

    await getGoldMetalValues({ now: () => NOW, fetchImpl: counting });
    const second = await getGoldMetalValues({ now: () => NOW, fetchImpl: counting });

    // One upstream call per ten minutes, not one per page load.
    expect(calls).toBe(1);
    expect(second.fromCache).toBe(true);
  });

  it("calls again once the cache has expired", async () => {
    let calls = 0;
    const counting = (async () => {
      calls++;
      return jsonResponse({ symbol: "XAU", price: 3400, updatedAt: STRUCK });
    }) as unknown as typeof fetch;

    await getGoldMetalValues({ now: () => NOW, fetchImpl: counting });
    const later = new Date(NOW.getTime() + CACHE_TTL_MS + 1000);
    await getGoldMetalValues({ now: () => later, fetchImpl: counting });
    expect(calls).toBe(2);
  });

  it("retains the last verified figure through a failure and says why", async () => {
    await getGoldMetalValues({ now: () => NOW, fetchImpl: ok() });

    const later = new Date(NOW.getTime() + CACHE_TTL_MS + 1000);
    const board = await getGoldMetalValues({
      now: () => later,
      fetchImpl: (async () => {
        throw new Error("upstream down");
      }) as unknown as typeof fetch,
    });

    expect(board.available).toBe(true);
    expect(board.values).not.toBeNull();
    expect(board.fromCache).toBe(true);
    // Never silently: the failure is named alongside the retained figure.
    expect(board.lastError).toContain("upstream down");
  });

  it("ages a retained figure to delayed, then stale", async () => {
    await getGoldMetalValues({ now: () => NOW, fetchImpl: ok() });
    const failing = (async () => {
      throw new Error("still down");
    }) as unknown as typeof fetch;

    const delayed = await getGoldMetalValues({
      now: () => new Date(Date.parse(STRUCK) + 45 * 60_000),
      fetchImpl: failing,
    });
    expect(delayed.status).toBe("delayed");

    const stale = await getGoldMetalValues({
      now: () => new Date(Date.parse(STRUCK) + 7 * 60 * 60_000),
      fetchImpl: failing,
    });
    expect(stale.status).toBe("stale");
    // Stale is shown, not hidden, and never relabelled live.
    expect(stale.values).not.toBeNull();
    expect(stale.status).not.toBe("live");
  });

  it("shows the unavailable message when nothing has ever verified", async () => {
    const board = await getGoldMetalValues({
      now: () => NOW,
      fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    });

    expect(board.available).toBe(false);
    expect(board.values).toBeNull();
    expect(board.unavailableReason).toBe("Gold price temporarily unavailable.");
  });

  it("never emits a fabricated price when the upstream is unusable", async () => {
    const board = await getGoldMetalValues({
      now: () => NOW,
      fetchImpl: (async () => jsonResponse({ nonsense: true })) as unknown as typeof fetch,
    });
    expect(board.values).toBeNull();
    // No number anywhere in the payload that could be read as a price.
    expect(JSON.stringify(board)).not.toMatch(/\b\d{2,}\.\d+\b/);
  });

  it("rejects an implausible jump and keeps the previous figure", async () => {
    await getGoldMetalValues({ now: () => NOW, fetchImpl: ok(3400) });

    const later = new Date(NOW.getTime() + CACHE_TTL_MS + 1000);
    const board = await getGoldMetalValues({
      now: () => later,
      fetchImpl: ok(9000, later.toISOString()),
    });

    expect(board.values!.inputs.xauUsdPerTroyOunce).toBe(3400);
    expect(board.lastError).toContain("implausible");
  });

  it("carries the explanation and the resale caveat on every response", async () => {
    const board = await getGoldMetalValues({ now: () => NOW, fetchImpl: ok() });
    expect(board.explanation).toContain("not the Dubai Jewellery Group suggested retail rate");
    expect(board.resaleCaveat).toContain("Not a guaranteed resale value");
  });
});
