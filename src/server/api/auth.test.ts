// @vitest-environment node
//
// Runs in node, not jsdom. src/server/config/env.ts refuses to load where a
// `window` exists — that guard is the point, and it fires here otherwise.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimits,
  authorizeOperator,
  authorizeScheduler,
  denied,
  rateLimit,
  secretsMatch,
} from "@/server/api/auth";
import { dispatchNotification, severityForAlerts, NOTIFICATION_TIMEOUT_MS } from "@/server/notifications/dispatch";
import {
  MINIMUM_REVIEW_HORIZON_DAYS,
  realisedReturnPercent,
  reviewDueAt,
  reviewIsDue,
  summariseProcessQuality,
  type OutcomeReview,
} from "@/server/outcome/review";

function request(token?: string): Request {
  return new Request("https://neoos.example/api/cycle/run", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ORIGINAL = { ...process.env };
beforeEach(() => {
  __resetRateLimits();
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllEnvs();
});

describe("token comparison", () => {
  it("matches an identical token and rejects a different one", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("rejects on a length mismatch without throwing", () => {
    expect(secretsMatch("short", "muchlongertoken")).toBe(false);
    expect(secretsMatch("", "x")).toBe(false);
  });
});

describe("operator authorisation", () => {
  it("denies everything when no token is configured", () => {
    vi.stubEnv("OPERATOR_API_TOKEN", "");
    const outcome = authorizeOperator(request("anything"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // Closed rather than open: a forgotten variable must not open the endpoint.
    expect(outcome.status).toBe(503);
  });

  it("requires a bearer token", () => {
    vi.stubEnv("OPERATOR_API_TOKEN", "correct-token");
    const outcome = authorizeOperator(request());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(401);
  });

  it("rejects a wrong token without revealing the expected one", () => {
    vi.stubEnv("OPERATOR_API_TOKEN", "correct-token");
    const outcome = authorizeOperator(request("wrong-token"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(403);
    expect(outcome.reason).not.toContain("correct");
  });

  it("accepts the configured token", () => {
    vi.stubEnv("OPERATOR_API_TOKEN", "correct-token");
    const outcome = authorizeOperator(request("correct-token"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.principal).toBe("operator");
  });

  it("ignores a non-bearer scheme", () => {
    vi.stubEnv("OPERATOR_API_TOKEN", "correct-token");
    const basic = new Request("https://neoos.example/x", {
      headers: { authorization: "Basic correct-token" },
    });
    expect(authorizeOperator(basic).ok).toBe(false);
  });
});

describe("scheduler authorisation", () => {
  it("accepts the cron secret", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const outcome = authorizeScheduler(request("cron-secret"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.principal).toBe("scheduler");
  });

  it("lets an operator trigger the scheduled path manually", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("OPERATOR_API_TOKEN", "operator-token");
    const outcome = authorizeScheduler(request("operator-token"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.principal).toBe("operator");
  });

  it("does not let a cron secret reach operator endpoints", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("OPERATOR_API_TOKEN", "operator-token");
    expect(authorizeOperator(request("cron-secret")).ok).toBe(false);
  });

  it("is unavailable when no cron secret is configured", () => {
    vi.stubEnv("CRON_SECRET", "");
    const outcome = authorizeScheduler(request("anything"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(503);
  });
});

describe("denied responses", () => {
  it("never caches an authorisation decision", async () => {
    const response = denied({ ok: false, status: 403, reason: "nope" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "nope" });
  });

  it("challenges on 401 only", () => {
    expect(denied({ ok: false, status: 401, reason: "x" }).headers.get("www-authenticate")).toBe("Bearer");
    expect(denied({ ok: false, status: 403, reason: "x" }).headers.get("www-authenticate")).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to the limit then refuses with a retry hint", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("k", 3, 60_000, 1000).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 3, 60_000, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window", () => {
    rateLimit("w", 1, 60_000, 1000);
    expect(rateLimit("w", 1, 60_000, 1000).allowed).toBe(false);
    expect(rateLimit("w", 1, 60_000, 70_000).allowed).toBe(true);
  });

  it("keys buckets independently", () => {
    rateLimit("a", 1, 60_000, 1000);
    expect(rateLimit("b", 1, 60_000, 1000).allowed).toBe(true);
  });
});

describe("notifications", () => {
  it("does not dispatch informational notices", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    const result = await dispatchNotification(
      { severity: "info", title: "t", body: "b", details: [] },
      fetchImpl,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.delivered).toBe(false);
  });

  it("says so rather than failing when no webhook is configured", async () => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "");
    const result = await dispatchNotification({ severity: "error", title: "t", body: "b", details: [] });
    expect(result.delivered).toBe(false);
    expect(result.reason).toMatch(/No notification webhook/);
  });

  it("sends only findings, never credentials or report content", async () => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.example/neoos");
    let sent = "";
    await dispatchNotification(
      { severity: "error", title: "Signature failed", body: "run x", details: ["detail"] },
      async (_url, init) => {
        sent = String(init?.body);
        return new Response("", { status: 200 });
      },
    );
    const payload = JSON.parse(sent);
    expect(Object.keys(payload).sort()).toEqual(["at", "body", "details", "severity", "source", "title"]);
  });

  it("never throws when the webhook is down", async () => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.example/neoos");
    const result = await dispatchNotification(
      { severity: "error", title: "t", body: "b", details: [] },
      async () => {
        throw new Error("connection refused");
      },
    );
    // A messaging outage must not become a lost report.
    expect(result.delivered).toBe(false);
    expect(result.reason).toMatch(/connection refused/);
  });

  it("reports a non-2xx webhook as undelivered", async () => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.example/neoos");
    const result = await dispatchNotification(
      { severity: "warning", title: "t", body: "b", details: [] },
      async () => new Response("", { status: 500 }),
    );
    expect(result.delivered).toBe(false);
    expect(result.reason).toMatch(/HTTP 500/);
  });

  it("bounds how long it will wait", () => {
    expect(NOTIFICATION_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("escalates a missing report and a signature failure, stays quiet otherwise", () => {
    expect(severityForAlerts([], true)).toBe("info");
    expect(severityForAlerts(["provider degraded"], true)).toBe("warning");
    expect(severityForAlerts(["Signature self-check failed"], true)).toBe("error");
    expect(severityForAlerts([], false)).toBe("error");
  });
});

describe("outcome review", () => {
  function review(overrides: Partial<OutcomeReview> = {}): OutcomeReview {
    return {
      schemaVersion: "4.0",
      outcomeId: "outcome-1",
      decisionId: "decision-1",
      reviewedAt: "2026-07-25T00:00:00.000Z",
      recommendationSnapshot: "Accumulate",
      result: "worked_out",
      reasoningVerdict: "sound",
      attributions: ["thesis_correct"],
      priceAtDecision: 100,
      priceAtReview: 120,
      currency: "USD",
      whatHappened: "The position appreciated.",
      lesson: null,
      reviewedBy: "operator",
      ...overrides,
    };
  }

  it("computes a realised return only when both prices are supplied", () => {
    expect(realisedReturnPercent(review())).toBeCloseTo(20, 6);
    expect(realisedReturnPercent(review({ priceAtReview: null }))).toBeNull();
    expect(realisedReturnPercent(review({ priceAtDecision: null }))).toBeNull();
  });

  it("waits a meaningful horizon before a review is due", () => {
    const now = new Date("2026-07-25T00:00:00Z");
    expect(reviewIsDue("2026-07-01T00:00:00Z", now)).toBe(false);
    expect(reviewIsDue("2026-01-01T00:00:00Z", now)).toBe(true);
    expect(MINIMUM_REVIEW_HORIZON_DAYS).toBeGreaterThanOrEqual(60);
  });

  it("states when a review will be due", () => {
    expect(reviewDueAt("2026-01-01T00:00:00.000Z")).toBe("2026-04-01T00:00:00.000Z");
    expect(reviewDueAt("not a date")).toBeNull();
  });

  it("keeps process quality and hit rate as separate numbers", () => {
    const summary = summariseProcessQuality([
      review({ reasoningVerdict: "sound", result: "worked_out" }),
      review({ reasoningVerdict: "sound", result: "did_not_work_out" }),
      review({ reasoningVerdict: "flawed_but_profitable", result: "worked_out" }),
      review({ reasoningVerdict: "flawed", result: "did_not_work_out" }),
    ]);
    expect(summary.reviewed).toBe(4);
    expect(summary.hitRate).toBe(0.5);
    expect(summary.soundReasoningRate).toBe(0.5);
    // The two dangerous-and-valuable cases are counted, not averaged away.
    expect(summary.luckyWins).toBe(1);
    expect(summary.unluckyLosses).toBe(1);
  });

  it("excludes unjudgeable reviews from both rates rather than scoring them zero", () => {
    const summary = summariseProcessQuality([
      review({ reasoningVerdict: "cannot_assess", result: "too_early_to_tell" }),
      review({ reasoningVerdict: "sound", result: "worked_out" }),
    ]);
    expect(summary.reviewed).toBe(1);
    expect(summary.hitRate).toBe(1);
  });

  it("returns null rates rather than a misleading zero with nothing reviewed", () => {
    const summary = summariseProcessQuality([]);
    expect(summary.hitRate).toBeNull();
    expect(summary.soundReasoningRate).toBeNull();
  });
});
