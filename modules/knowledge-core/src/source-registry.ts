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
