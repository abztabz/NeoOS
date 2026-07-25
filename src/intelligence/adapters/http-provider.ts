import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";

/**
 * Example HTTP provider adapter.
 *
 * This is the shape a real market-data vendor integration takes. It ships
 * UNCONFIGURED and fails safely: with no credential it never issues a request,
 * reports `disabled`, and contributes nothing. Enabling it is a deployment
 * decision requiring a licensed data agreement.
 *
 * Credentials are read from the server environment only. No key is ever
 * embedded here, and this adapter must not be constructed in client code —
 * see docs/PROVIDER_ADAPTERS.md.
 */
export class HttpProviderAdapter implements ProviderAdapter {
  private readonly apiKey: string | null;
  private readonly baseUrl: string | null;
  private lastSuccess: string | null = null;
  private lastFailure: string | null = null;

  constructor(
    private readonly config: {
      providerId: string;
      providerName: string;
      sourceTier: number;
      /** Env var name holding the credential. The VALUE is never logged. */
      apiKeyEnvVar: string;
      baseUrlEnvVar: string;
      legalNotes: string;
    },
    env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
  ) {
    this.apiKey = env[config.apiKeyEnvVar] ?? null;
    this.baseUrl = env[config.baseUrlEnvVar] ?? null;
  }

  private get configured(): boolean {
    return this.apiKey !== null && this.baseUrl !== null;
  }

  describe(): ProviderDescriptor {
    return {
      providerId: this.config.providerId,
      providerName: this.config.providerName,
      providerType: "market_data",
      sourceTier: this.config.sourceTier,
      capabilities: ["prices", "reference_data"],
      supportedAssetClasses: ["Equity", "ETF", "Commodity"],
      // Unconfigured providers are `disabled`, never `live`.
      mode: this.configured ? "live" : "disabled",
      configured: this.configured,
      authenticated: this.configured,
      health: this.lastFailure ? "failing" : this.configured ? "ok" : "unconfigured",
      lastSuccessfulRetrieval: this.lastSuccess,
      failureReason: this.configured
        ? this.lastFailure
        : `Not configured: set ${this.config.apiKeyEnvVar} and ${this.config.baseUrlEnvVar} to enable. NeoOS will not claim live data without a configured, authenticated provider.`,
      legalNotes: this.config.legalNotes,
      rateLimit: this.configured ? { requestsPerMinute: 60, remaining: null } : null,
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    if (!this.configured) {
      // Fail safe: no request is attempted, and the result is explicitly not live.
      return {
        providerId: this.config.providerId,
        mode: "disabled",
        ok: false,
        respondedAt: request.asOf,
        rawPayloadRef: "none",
        records: [],
        failureReason: `Provider ${this.config.providerId} is not configured; no request was attempted.`,
        warnings: [],
      };
    }

    try {
      const url = new URL("/v1/quotes", this.baseUrl as string);
      url.searchParams.set("symbols", request.assetIds.join(","));
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${this.apiKey}`, accept: "application/json" },
      });
      if (!response.ok) {
        this.lastFailure = `HTTP ${response.status}`;
        return {
          providerId: this.config.providerId,
          mode: "error",
          ok: false,
          respondedAt: new Date().toISOString(),
          rawPayloadRef: url.pathname,
          records: [],
          failureReason: this.lastFailure,
          warnings: [],
        };
      }
      const payload: unknown = await response.json();
      this.lastSuccess = new Date().toISOString();
      this.lastFailure = null;
      return {
        providerId: this.config.providerId,
        mode: "live",
        ok: true,
        respondedAt: this.lastSuccess,
        rawPayloadRef: url.pathname,
        // A real integration maps the vendor payload into RawEvidenceRecords
        // here. Ingestion validates whatever arrives, so a mapping bug becomes
        // a rejected record rather than a silently wrong score.
        records: Array.isArray(payload) ? payload : [],
        failureReason: null,
        warnings: [],
      };
    } catch (error) {
      this.lastFailure = error instanceof Error ? error.message : "Unknown transport failure";
      return {
        providerId: this.config.providerId,
        mode: "error",
        ok: false,
        respondedAt: new Date().toISOString(),
        rawPayloadRef: "none",
        records: [],
        failureReason: this.lastFailure,
        warnings: [],
      };
    }
  }
}

/** The example vendor wiring, disabled unless the environment supplies both vars. */
export function exampleHttpProvider(env?: Record<string, string | undefined>): HttpProviderAdapter {
  return new HttpProviderAdapter(
    {
      providerId: "example-http-vendor",
      providerName: "Example market data vendor",
      sourceTier: 2,
      apiKeyEnvVar: "NEOOS_MARKET_DATA_API_KEY",
      baseUrlEnvVar: "NEOOS_MARKET_DATA_BASE_URL",
      legalNotes:
        "Requires a licensed market-data agreement. Redistribution of vendor data may be restricted; confirm terms before enabling.",
    },
    env,
  );
}
