import { describe, expect, it, vi } from "vitest";
import {
  describeOutcome,
  isFault,
  triggerServerRun,
  type RunNowOutcome,
} from "@/data/run-now";

/**
 * The behaviour under test is mostly about *refusing* things: refusing to treat
 * a correct refusal as a failure, refusing to load an unverified report, and
 * refusing to adopt a report the run did not produce. Each of those has a test
 * because each is a silent, plausible-looking wrong answer if it regresses.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const RAN_BODY = {
  ran: true,
  runId: "run-1",
  cycleState: "success",
  liveState: "partial_live",
  reportId: "rep-1",
  stored: true,
  storeReason: null,
  alerts: [],
};

function latestBody(overrides: Record<string, unknown> = {}) {
  return {
    report: {
      content: { reportId: "rep-1", report: { version: "2.0" } },
      verification: { status: "verified", detail: "Signature checks out." },
      ...overrides,
    },
  };
}

describe("triggerServerRun", () => {
  it("surfaces a readiness refusal verbatim rather than as a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        ran: false,
        reason: "Live runs are unavailable because no market data provider is configured.",
        missing: ["MARKET_DATA_API_KEY"],
      }),
    );

    const outcome = await triggerServerRun({ token: "t", fetchImpl });

    expect(outcome).toEqual({
      kind: "refused",
      reason: "Live runs are unavailable because no market data provider is configured.",
      missing: ["MARKET_DATA_API_KEY"],
    });
    // A refusal is an answer, not a fault: it must not render as an alert.
    expect(isFault(outcome)).toBe(false);
    expect(describeOutcome(outcome, null)).toContain("no market data provider is configured");
  });

  it("sends the operator token as a bearer credential and an empty context body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, RAN_BODY))
      .mockResolvedValueOnce(jsonResponse(200, latestBody()));

    await triggerServerRun({ token: "secret-token", fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cycle/run");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
    expect(init.body).toBe("{}");
  });

  it("returns the stored report file when the run stored one that verifies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, RAN_BODY))
      .mockResolvedValueOnce(jsonResponse(200, latestBody()));

    const outcome = await triggerServerRun({ token: "t", fetchImpl });

    expect(outcome.kind).toBe("ran");
    if (outcome.kind !== "ran") throw new Error("expected a run");
    expect(outcome.reportText).toBe(JSON.stringify({ version: "2.0" }));
    expect(outcome.reportNote).toBeNull();
    expect(describeOutcome(outcome, { ok: true } as never)).toContain("loaded into the cockpit");
  });

  it("refuses to load a report whose signature did not verify", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, RAN_BODY))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          latestBody({ verification: { status: "content_modified", detail: "Bytes differ." } }),
        ),
      );

    const outcome = await triggerServerRun({ token: "t", fetchImpl });

    if (outcome.kind !== "ran") throw new Error("expected a run");
    expect(outcome.reportText).toBeNull();
    expect(outcome.reportNote).toContain("content_modified");
    expect(outcome.reportNote).toContain("not been loaded");
  });

  it("refuses to adopt a stored report from a different run", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, RAN_BODY))
      .mockResolvedValueOnce(
        jsonResponse(200, latestBody({ content: { reportId: "rep-OLD", report: {} } })),
      );

    const outcome = await triggerServerRun({ token: "t", fetchImpl });

    if (outcome.kind !== "ran") throw new Error("expected a run");
    expect(outcome.reportText).toBeNull();
    expect(outcome.reportNote).toContain("not the one this run produced");
  });

  it("does not read the report back when the run stored nothing", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        ...RAN_BODY,
        stored: false,
        storeReason: "Storage is not durable in this deployment.",
      }),
    );

    const outcome = await triggerServerRun({ token: "t", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    if (outcome.kind !== "ran") throw new Error("expected a run");
    expect(outcome.reportText).toBeNull();
    expect(outcome.reportNote).toBe("Storage is not durable in this deployment.");
  });

  it("distinguishes a rejected token from an unconfigured endpoint", async () => {
    const rejected = await triggerServerRun({
      token: "t",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(403, { error: "The supplied token was not accepted." })),
    });
    expect(rejected.kind).toBe("unauthorized");

    const unconfigured = await triggerServerRun({
      token: "t",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(503, { error: "OPERATOR_API_TOKEN is not configured." })),
    });
    expect(unconfigured.kind).toBe("unavailable");
  });

  it("reports a rate limit with the wait, in minutes", async () => {
    const outcome = await triggerServerRun({
      token: "t",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse(429, { error: "Too many manual runs this hour.", retryAfterSeconds: 1800 }),
        ),
    });

    expect(outcome.kind).toBe("rate_limited");
    expect(describeOutcome(outcome, null)).toContain("30 minute(s)");
  });

  it("names a network failure instead of reporting a silent no-op", async () => {
    const outcome = await triggerServerRun({
      token: "t",
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
    });

    expect(outcome).toEqual({ kind: "error", reason: "Could not reach the server: network down" });
    expect(isFault(outcome)).toBe(true);
  });

  it("keeps the cockpit unchanged when a stored report fails validation here", () => {
    const outcome: RunNowOutcome = {
      kind: "ran",
      runId: "run-1",
      cycleState: "success",
      liveState: "partial_live",
      reportId: "rep-1",
      stored: true,
      storeReason: null,
      alerts: [],
      reportText: "{}",
      reportNote: null,
    };

    const described = describeOutcome(outcome, { ok: false, error: "Report does not match schema." });
    expect(described).toContain("cockpit is unchanged");
    expect(described).toContain("Report does not match schema.");
  });
});
