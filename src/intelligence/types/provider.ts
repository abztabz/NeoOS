import { z } from "zod";

/**
 * Provider adapter contract.
 *
 * A provider is anything that can hand NeoOS raw source records: a fixture
 * file, a manual import, or a real HTTP data vendor. The contract exists so
 * the application can always state, precisely and visibly, WHERE a claim came
 * from and whether it was actually retrieved.
 *
 * Adapters never produce scores, ratings, or normalized evidence. They produce
 * RawEvidenceRecords and nothing else.
 */

/**
 * Operating mode. This is the single most important honesty control in the
 * system: `live` may only be claimed when data was actually retrieved from a
 * configured, authenticated provider.
 */
export const providerModes = ["live", "fixture", "manual_import", "disabled", "error"] as const;
export type ProviderMode = (typeof providerModes)[number];

export const providerTypes = [
  "official_filing",
  "market_data",
  "institutional_research",
  "macro",
  "news",
  "sentiment",
  "manual",
] as const;
export type ProviderType = (typeof providerTypes)[number];

export const providerCapabilities = [
  "prices",
  "fundamentals",
  "filings",
  "macro_series",
  "news",
  "reference_data",
] as const;
export type ProviderCapability = (typeof providerCapabilities)[number];

export const providerHealthStates = ["ok", "degraded", "unconfigured", "failing"] as const;
export type ProviderHealth = (typeof providerHealthStates)[number];

export const providerDescriptorSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  providerType: z.enum(providerTypes),
  /** Evidence hierarchy tier this provider's records enter at (1 strongest). */
  sourceTier: z.number().int().min(1).max(6),
  capabilities: z.array(z.enum(providerCapabilities)),
  supportedAssetClasses: z.array(z.string()),
  mode: z.enum(providerModes),
  configured: z.boolean(),
  authenticated: z.boolean(),
  health: z.enum(providerHealthStates),
  lastSuccessfulRetrieval: z.iso.datetime({ offset: true }).nullable(),
  failureReason: z.string().nullable(),
  /** Licensing/terms notes. Displayed in the provider panel, never hidden. */
  legalNotes: z.string(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().int().positive(),
      remaining: z.number().int().min(0).nullable(),
    })
    .nullable(),
});
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

/** Outcome of one fetch attempt. Failure is data, not an exception. */
export interface ProviderFetchResult {
  providerId: string;
  /** Mode the data was ACTUALLY produced under — never aspirational. */
  mode: ProviderMode;
  ok: boolean;
  /** Timestamp the provider responded. */
  respondedAt: string;
  /** Opaque reference to the untouched payload, for audit. */
  rawPayloadRef: string;
  records: unknown[];
  failureReason: string | null;
  warnings: string[];
}

export interface ProviderFetchRequest {
  /** Canonical asset ids the caller is interested in. */
  assetIds: string[];
  /** Cycle timestamp — adapters must not read the wall clock themselves. */
  asOf: string;
}

/**
 * The adapter interface. `describe()` must be safe to call at any time,
 * including when the provider is unconfigured — the UI depends on it to render
 * provider status without triggering a network call.
 */
export interface ProviderAdapter {
  describe(): ProviderDescriptor;
  fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult>;
}

/** Human-facing label per mode. Used verbatim in the UI. */
export const providerModeLabels: Record<ProviderMode, string> = {
  live: "Live verified",
  fixture: "Fixture intelligence",
  manual_import: "Manual evidence",
  disabled: "Disabled",
  error: "Provider error",
};

/**
 * Whether a mode may contribute to a `live_verified` application state.
 * Only genuinely retrieved data qualifies; fixtures and manual imports never do.
 */
export function modeCountsAsLive(mode: ProviderMode): boolean {
  return mode === "live";
}
