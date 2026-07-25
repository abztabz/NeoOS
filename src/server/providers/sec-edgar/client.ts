import {
  companyFactsSchema,
  companyFactsUrl,
  submissionsSchema,
  submissionsUrl,
  type CompanyFacts,
  type Submissions,
} from "@/server/providers/sec-edgar/types";

/**
 * EDGAR HTTP client.
 *
 * EDGAR is a free public endpoint operated by a government agency, and their
 * fair-access policy asks for two things in return: a descriptive User-Agent
 * identifying the requester, and no more than ten requests a second. Both are
 * enforced here rather than left to the caller's discipline — an unconfigured
 * User-Agent makes the provider refuse to run at all, and the rate limiter is
 * in the only code path that can reach the network.
 *
 * The client is injectable (`fetchImpl`) so tests exercise the real parsing,
 * retry, and error handling against recorded responses without touching the
 * network. See docs/SEC_EDGAR_PROVIDER.md.
 */

/** SEC fair-access ceiling. NeoOS stays under it with margin. */
export const EDGAR_MAX_REQUESTS_PER_SECOND = 8;
const MIN_REQUEST_SPACING_MS = 1000 / EDGAR_MAX_REQUESTS_PER_SECOND;

export const EDGAR_TIMEOUT_MS = 15_000;
export const EDGAR_MAX_ATTEMPTS = 3;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface EdgarClientOptions {
  userAgent: string;
  fetchImpl?: FetchLike;
  /** Injectable clock and sleep so rate-limit behaviour is testable. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type EdgarFailureKind =
  | "unconfigured"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_status"
  | "malformed_response";

export interface EdgarFailure {
  ok: false;
  kind: EdgarFailureKind;
  status: number | null;
  message: string;
  url: string;
}

export interface EdgarSuccess<T> {
  ok: true;
  data: T;
  url: string;
  /** Server-stated last modification, used as the evidence publication time. */
  lastModified: string | null;
  retrievedAt: string;
}

export type EdgarResult<T> = EdgarSuccess<T> | EdgarFailure;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class EdgarClient {
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Serialises requests so the spacing rule cannot be defeated by concurrency. */
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * Negative infinity, not zero: "no request has been made yet" is a different
   * statement from "a request was made at the epoch", and only the first is
   * true at construction.
   */
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(options: EdgarClientOptions) {
    this.userAgent = options.userAgent;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
  }

  async companyFacts(cik: string | number): Promise<EdgarResult<CompanyFacts>> {
    return this.getJson(companyFactsUrl(cik), companyFactsSchema);
  }

  async submissions(cik: string | number): Promise<EdgarResult<Submissions>> {
    return this.getJson(submissionsUrl(cik), submissionsSchema);
  }

  /** Chain every request onto one queue, then space it from the previous one. */
  private async throttle(): Promise<void> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_REQUEST_SPACING_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getJson<T>(
    url: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  ): Promise<EdgarResult<T>> {
    let lastFailure: EdgarFailure = {
      ok: false,
      kind: "network",
      status: null,
      message: "No attempt was made.",
      url,
    };

    for (let attempt = 1; attempt <= EDGAR_MAX_ATTEMPTS; attempt++) {
      await this.throttle();
      const outcome = await this.attempt<T>(url, schema);
      if (outcome.ok) return outcome;
      lastFailure = outcome;

      // A 404 is a settled answer, and a malformed body will not repair itself.
      // Retrying either would be noise against a public agency's servers.
      if (outcome.kind === "not_found" || outcome.kind === "malformed_response") break;
      if (attempt < EDGAR_MAX_ATTEMPTS) {
        await this.sleep(500 * 2 ** (attempt - 1));
      }
    }
    return lastFailure;
  }

  private async attempt<T>(
    url: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  ): Promise<EdgarResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EDGAR_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          // Required by SEC fair access. Identifies the requester, not a secret.
          "User-Agent": this.userAgent,
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        signal: controller.signal,
      });

      if (response.status === 404) {
        return { ok: false, kind: "not_found", status: 404, message: "EDGAR has no record at this path.", url };
      }
      if (response.status === 429 || response.status === 403) {
        return {
          ok: false,
          kind: "rate_limited",
          status: response.status,
          message:
            "EDGAR refused the request. This usually means the User-Agent is missing or the fair-access rate was exceeded.",
          url,
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          kind: "bad_status",
          status: response.status,
          message: `EDGAR returned HTTP ${response.status}.`,
          url,
        };
      }

      const body: unknown = await response.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success || parsed.data === undefined) {
        return {
          ok: false,
          kind: "malformed_response",
          status: response.status,
          message:
            "EDGAR's response did not match the expected shape. Refusing to derive fundamentals from an unrecognised payload.",
          url,
        };
      }

      return {
        ok: true,
        data: parsed.data,
        url,
        lastModified: response.headers.get("last-modified"),
        retrievedAt: new Date(this.now()).toISOString(),
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        kind: aborted ? "timeout" : "network",
        status: null,
        message: aborted
          ? `EDGAR did not respond within ${EDGAR_TIMEOUT_MS}ms.`
          : `Network failure reaching EDGAR: ${error instanceof Error ? error.message : String(error)}`,
        url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
