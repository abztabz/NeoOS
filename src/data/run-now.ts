/**
 * Triggering a server cycle from the browser.
 *
 * Until now the intelligence panel could run *fixtures* and it could ingest a
 * file, but it had no way to ask the server for a real run — the endpoint
 * existed and nothing called it. That left the deployment in a state where the
 * only reachable numbers were an invented household's, which is precisely the
 * confusion the rest of this codebase spends its effort preventing.
 *
 * Three things this module refuses to do, each of which would be easier:
 *
 *   1. **Treat a refusal as a failure.** `readiness().canRunLive === false`
 *      comes back as HTTP 409 with the reason and the missing inputs named.
 *      That is the server working correctly, and it is the single most useful
 *      thing an operator can be shown — so it is surfaced verbatim rather than
 *      flattened into "run failed".
 *   2. **Apply a report it did not verify.** A stored report whose signature
 *      does not check out is still returned by the API, deliberately, so the
 *      tampering is visible. Loading it into the cockpit would render those
 *      numbers as ordinary content.
 *   3. **Apply a report from some earlier run.** If the run did not store, the
 *      latest stored report belongs to somebody else's run. Applying it would
 *      make a failed run look like it succeeded.
 */

import type { ParseReportResult } from "@/schemas/neoos-report";

/** Where the intake page and the conversation store already keep the token. */
export const OPERATOR_TOKEN_KEY = "neoos.operator-token";

export const NO_TOKEN_MESSAGE =
  "No operator token is held in this session. Enter it on the Intake screen and it will be used here too.";

export type RunNowOutcome =
  | {
      kind: "ran";
      runId: string;
      cycleState: string;
      liveState: string;
      reportId: string | null;
      stored: boolean;
      storeReason: string | null;
      alerts: string[];
      /** The stored report file, ready for `importReport`. Null when not applicable. */
      reportText: string | null;
      /** Why no report text came back, when it did not. Null when it did. */
      reportNote: string | null;
    }
  | { kind: "refused"; reason: string; missing: string[] }
  | { kind: "rate_limited"; reason: string; retryAfterSeconds: number }
  | { kind: "unauthorized"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; reason: string };

/** Verification outcomes that must never be loaded into the cockpit. */
const UNTRUSTWORTHY = ["signature_invalid", "content_modified", "key_unknown"];

interface RunResponse {
  ran?: boolean;
  runId?: string;
  cycleState?: string;
  liveState?: string;
  reportId?: string | null;
  stored?: boolean;
  storeReason?: string | null;
  alerts?: string[];
  reason?: string;
  missing?: string[];
  error?: string;
  retryAfterSeconds?: number;
}

interface LatestResponse {
  report?: {
    content?: { reportId?: string; report?: unknown };
    verification?: { status?: string; detail?: string };
  } | null;
}

export interface RunNowDeps {
  token: string;
  fetchImpl?: typeof fetch;
}

export async function triggerServerRun({
  token,
  fetchImpl = fetch,
}: RunNowDeps): Promise<RunNowOutcome> {
  let response: Response;
  try {
    response = await fetchImpl("/api/cycle/run", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      // An empty object rather than no body: the route reads it as "no portfolio
      // context supplied", which is true, and the run says so in its commentary
      // rather than assuming a position nobody declared.
      body: "{}",
      cache: "no-store",
    });
  } catch (cause) {
    return { kind: "error", reason: reachError(cause) };
  }

  const body = await readJson<RunResponse>(response);

  if (response.status === 401 || response.status === 403) {
    return { kind: "unauthorized", reason: body?.error ?? "That token was not accepted." };
  }
  if (response.status === 503) {
    return {
      kind: "unavailable",
      reason:
        body?.error ??
        "This deployment has no operator token configured, so the run endpoint is closed.",
    };
  }
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      reason: body?.error ?? "Too many manual runs this hour.",
      retryAfterSeconds: body?.retryAfterSeconds ?? 0,
    };
  }
  if (response.status === 409) {
    // The refusal path, and the reason it is worth pressing the button at all.
    // `reason` names what stopped the run; `missing` names what to supply.
    return {
      kind: "refused",
      reason: body?.reason ?? "The server declined to run and gave no reason.",
      missing: body?.missing ?? [],
    };
  }
  if (!response.ok || body === null) {
    return {
      kind: "error",
      reason: body?.error ?? body?.reason ?? `The run endpoint returned ${response.status}.`,
    };
  }

  const stored = body.stored === true;
  const reportId = body.reportId ?? null;
  const base = {
    kind: "ran" as const,
    runId: body.runId ?? "unknown",
    cycleState: body.cycleState ?? "unknown",
    liveState: body.liveState ?? "unknown",
    reportId,
    stored,
    storeReason: body.storeReason ?? null,
    alerts: body.alerts ?? [],
  };

  if (!stored || reportId === null) {
    return {
      ...base,
      reportText: null,
      reportNote:
        body.storeReason ??
        "This run produced no stored report, so the cockpit is unchanged. That is the correct outcome, not a lost result.",
    };
  }

  const fetched = await fetchStoredReport(reportId, fetchImpl);
  return { ...base, ...fetched };
}

/**
 * Retrieve the report this run just stored — and only that one.
 *
 * Matching on `reportId` is what stops a run that stored nothing from adopting
 * an earlier run's report and looking successful.
 */
async function fetchStoredReport(
  reportId: string,
  fetchImpl: typeof fetch,
): Promise<{ reportText: string | null; reportNote: string | null }> {
  let response: Response;
  try {
    response = await fetchImpl("/api/report/latest", { cache: "no-store" });
  } catch (cause) {
    return { reportText: null, reportNote: reachError(cause) };
  }

  const body = await readJson<LatestResponse>(response);
  const stored = body?.report ?? null;
  if (!response.ok || !stored) {
    return {
      reportText: null,
      reportNote: "The run stored a report, but it could not be read back from the server.",
    };
  }

  const verification = stored.verification?.status ?? null;
  if (verification !== null && UNTRUSTWORTHY.includes(verification)) {
    return {
      reportText: null,
      reportNote: `The stored report did not verify (${verification}), so it has not been loaded. ${
        stored.verification?.detail ?? ""
      }`.trim(),
    };
  }

  if (stored.content?.reportId !== reportId) {
    return {
      reportText: null,
      reportNote:
        "The newest stored report is not the one this run produced, so nothing has been loaded.",
    };
  }

  if (stored.content.report === undefined || stored.content.report === null) {
    return {
      reportText: null,
      reportNote: "The stored envelope carried no report file.",
    };
  }

  return { reportText: JSON.stringify(stored.content.report), reportNote: null };
}

/**
 * A one-line account of what happened, for the status area.
 *
 * Kept here rather than in the component so the wording is testable and so the
 * refusal case reads as an answer instead of an error.
 */
export function describeOutcome(outcome: RunNowOutcome, applied: ParseReportResult | null): string {
  switch (outcome.kind) {
    case "ran": {
      const head = `Run ${outcome.runId} finished as ${outcome.cycleState.replace(/_/g, " ")} · ${outcome.liveState.replace(/_/g, " ")}.`;
      if (outcome.reportText === null) return `${head} ${outcome.reportNote ?? ""}`.trim();
      if (applied && !applied.ok) {
        return `${head} The report was stored but did not pass validation here, so the cockpit is unchanged: ${applied.error}`;
      }
      return `${head} Report loaded into the cockpit.`;
    }
    case "refused":
      return outcome.reason;
    case "rate_limited":
      return `${outcome.reason} Try again in ${Math.ceil(outcome.retryAfterSeconds / 60)} minute(s).`;
    case "unauthorized":
    case "unavailable":
    case "error":
      return outcome.reason;
  }
}

/** True when the outcome should be rendered as an alert rather than a status. */
export function isFault(outcome: RunNowOutcome): boolean {
  return outcome.kind === "unauthorized" || outcome.kind === "unavailable" || outcome.kind === "error";
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function reachError(cause: unknown): string {
  return cause instanceof Error
    ? `Could not reach the server: ${cause.message}`
    : "Could not reach the server.";
}

/** Session storage, degrading to "no token" rather than throwing. */
export function readOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(OPERATOR_TOKEN_KEY);
  } catch {
    return null;
  }
}
