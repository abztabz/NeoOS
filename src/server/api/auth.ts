import { timingSafeEqual } from "node:crypto";
import { cronSecret, operatorApiToken } from "@/server/config/env";

/**
 * API authorisation.
 *
 * Three rules, each of which has a specific failure it prevents:
 *
 *   1. Compare tokens in constant time. A plain `===` returns sooner the
 *      earlier it finds a mismatch, which leaks the token a character at a
 *      time to anyone patient enough to measure.
 *   2. Never echo a secret, not even truncated. "Expected token starting
 *      sk_liv…" is a meaningful head start.
 *   3. An unconfigured secret denies everything. The tempting alternative —
 *      skip the check when no secret is set — turns a forgotten environment
 *      variable into an open endpoint, which is the worst possible default for
 *      the route that triggers runs and writes to the journal.
 */

export type AuthOutcome =
  | { ok: true; principal: "operator" | "scheduler" }
  | { ok: false; status: 401 | 403 | 503; reason: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/** Constant-time string comparison that does not leak length through timing. */
export function secretsMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison so a length mismatch is not faster to detect.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function authorizeOperator(request: Request): AuthOutcome {
  const expected = operatorApiToken();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      reason:
        "This endpoint is not available because OPERATOR_API_TOKEN is not configured. It is closed rather than open by default.",
    };
  }
  const supplied = bearerToken(request);
  if (!supplied) return { ok: false, status: 401, reason: "A bearer token is required." };
  if (!secretsMatch(supplied, expected)) {
    return { ok: false, status: 403, reason: "The supplied token was not accepted." };
  }
  return { ok: true, principal: "operator" };
}

/**
 * Authorise a scheduled invocation.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The operator token is
 * also accepted so a human can trigger the scheduled path manually to test it,
 * but the reverse is not true: a cron secret cannot reach operator endpoints.
 */
export function authorizeScheduler(request: Request): AuthOutcome {
  const expectedCron = cronSecret();
  const supplied = bearerToken(request);

  if (!expectedCron) {
    return {
      ok: false,
      status: 503,
      reason: "Scheduled runs are not available because CRON_SECRET is not configured.",
    };
  }
  if (!supplied) return { ok: false, status: 401, reason: "A bearer token is required." };
  if (secretsMatch(supplied, expectedCron)) return { ok: true, principal: "scheduler" };

  const operator = operatorApiToken();
  if (operator && secretsMatch(supplied, operator)) return { ok: true, principal: "operator" };

  return { ok: false, status: 403, reason: "The supplied token was not accepted." };
}

/**
 * A minimal in-process rate limiter for the write endpoints.
 *
 * Honest about its limits: it is per-instance, so a horizontally scaled
 * deployment enforces this per instance rather than globally, and it resets on
 * a cold start. It exists to stop an accidental loop or a trivial hammering,
 * not a determined attacker. Real rate limiting belongs at the edge.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
}

/**
 * Standard JSON error response.
 *
 * The body carries a reason a developer can act on and never carries the
 * expected value, a stack trace, or a configuration detail.
 */
export function denied(outcome: Extract<AuthOutcome, { ok: false }>): Response {
  return Response.json(
    { error: outcome.reason },
    {
      status: outcome.status,
      headers: {
        // Do not let an authorisation decision be cached anywhere.
        "cache-control": "no-store",
        ...(outcome.status === 401 ? { "www-authenticate": "Bearer" } : {}),
      },
    },
  );
}
