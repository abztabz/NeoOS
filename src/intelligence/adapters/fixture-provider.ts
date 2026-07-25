import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";

/**
 * FixtureProviderAdapter — serves recorded records from a fixture file.
 *
 * It reports mode `fixture` everywhere and stamps every record it returns with
 * that mode, so no fixture claim can be presented as live intelligence
 * anywhere downstream.
 */
export class FixtureProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly descriptor: Omit<ProviderDescriptor, "mode" | "configured" | "authenticated" | "health">,
    private readonly records: RawEvidenceRecord[],
    /** Simulates a provider outage, for partial-success testing. */
    private readonly simulateFailure: string | null = null,
  ) {}

  describe(): ProviderDescriptor {
    return {
      ...this.descriptor,
      mode: this.simulateFailure ? "error" : "fixture",
      configured: true,
      // A fixture is never authenticated against anything real; saying
      // otherwise would be the exact dishonesty this contract prevents.
      authenticated: false,
      health: this.simulateFailure ? "failing" : "ok",
      failureReason: this.simulateFailure,
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    if (this.simulateFailure) {
      return {
        providerId: this.descriptor.providerId,
        mode: "error",
        ok: false,
        respondedAt: request.asOf,
        rawPayloadRef: `fixture:${this.descriptor.providerId}:unavailable`,
        records: [],
        failureReason: this.simulateFailure,
        warnings: [],
      };
    }

    // A fixture set is already scoped to the proof universe, and matching a
    // canonical assetId against a source identifier is exactly the guesswork
    // the identity resolver exists to do properly. So the adapter serves its
    // whole set and lets resolution decide what belongs to what.
    const payload = this.records;

    return {
      providerId: this.descriptor.providerId,
      mode: "fixture",
      ok: true,
      respondedAt: request.asOf,
      rawPayloadRef: `fixture:${this.descriptor.providerId}:${payload.length}`,
      records: payload.map((record) => ({ ...record, providerMode: "fixture" as const })),
      failureReason: null,
      warnings: [],
    };
  }
}
