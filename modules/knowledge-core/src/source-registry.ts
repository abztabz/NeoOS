import type { RegistryRequest, RegistryResponse, SourceRegistryAdapter } from "./contracts.js";

/**
 * Boundary adapter for the NeoOS Source Registry / Neo Data Gateway.
 * Consumers address capabilities, never provider-specific response shapes.
 */
export class CallbackSourceRegistryAdapter implements SourceRegistryAdapter {
  constructor(private readonly resolver: (request: RegistryRequest) => Promise<RegistryResponse>) {}

  resolve(request: RegistryRequest): Promise<RegistryResponse> {
    if (!request.capability.trim()) throw new Error("Registry capability is required");
    return this.resolver(request);
  }
}

export interface HttpSourceRegistryOptions {
  baseUrl: string;
  consumer: string;
  token: string;
  fetchImpl?: typeof fetch;
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Authenticated adapter for the deployed Neo Data Gateway.
 * Credentials stay server-side and are never included in returned provenance.
 */
export class HttpSourceRegistryAdapter implements SourceRegistryAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpSourceRegistryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!this.baseUrl.startsWith("https://")) throw new Error("Source Registry baseUrl must use HTTPS");
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(options.consumer)) throw new Error("Invalid Source Registry consumer id");
    if (options.token.trim().length < 24) throw new Error("Source Registry token must be at least 24 characters");
  }

  async resolve(request: RegistryRequest): Promise<RegistryResponse> {
    const capability = request.capability.trim();
    if (!capability) throw new Error("Registry capability is required");

    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-neo-consumer": this.options.consumer,
        authorization: `Bearer ${this.options.token}`,
      },
      body: JSON.stringify({
        capability,
        input: request.input,
        includeExperimental: request.allowExperimental === true,
      }),
      redirect: "error",
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = plainObject(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`Neo Data Gateway request failed: ${message}`);
    }
    if (!plainObject(body) || body.ok !== true || typeof body.observedAt !== "string") {
      throw new Error("Neo Data Gateway returned an invalid response");
    }

    return {
      capability: typeof body.capability === "string" ? body.capability : capability,
      selectedProvider: typeof body.provider === "string" ? body.provider : undefined,
      observationTimestamp: body.observedAt,
      sourceObservationTimestamp: typeof body.sourceObservedAt === "string" ? body.sourceObservedAt : undefined,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
      provenance: plainObject(body.provenance) ? body.provenance : {},
      data: body.data,
      failedAttempts: Array.isArray(body.attempts) ? body.attempts : undefined,
    };
  }
}
