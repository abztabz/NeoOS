import { describe, expect, it } from "vitest";
import { EcbFxProvider, parseEcbSeries } from "@/server/providers/market/official/ecb-fx";

/**
 * Contract tests for the ECB adapter.
 *
 * Hermetic by construction: every response is a fixture and `fetchImpl` is
 * injected, so these run identically in a sandbox with no egress and in CI. A
 * test here that reached the open internet would be a defect — it would make
 * the suite depend on a third party's uptime and on network policy that
 * deliberately varies between environments.
 *
 * The fixture mirrors the SDMX-JSON shape the ECB documents. What is verified
 * is the mapping contract: that observations are dated from the series rather
 * than from the clock, that inversion is exact, and that anything unreadable
 * becomes a stated failure rather than a missing rate.
 */

const ecbFixture = {
  header: { id: "test", prepared: "2026-07-24T16:00:00Z" },
  dataSets: [
    {
      action: "Replace",
      series: {
        "0:0:0:0:0": {
          observations: {
            "0": [1.0812, 0, 0],
            "1": [1.0845, 0, 0],
          },
        },
      },
    },
  ],
  structure: {
    dimensions: {
      observation: [
        {
          id: "TIME_PERIOD",
          name: "Time period or range",
          values: [
            { id: "2026-07-23", name: "2026-07-23" },
            { id: "2026-07-24", name: "2026-07-24" },
          ],
        },
      ],
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const NOW = Date.parse("2026-07-24T18:00:00Z");

describe("parseEcbSeries", () => {
  it("dates each observation from the structure block, not its position", () => {
    const parsed = parseEcbSeries(ecbFixture);
    expect(parsed).not.toBeNull();
    // Index "1" carries the later date, so it must be the latest — resolving
    // position against TIME_PERIOD rather than assuming index order.
    expect(parsed?.latest).toEqual({ period: "2026-07-24", value: 1.0845 });
    expect(parsed?.previous).toEqual({ period: "2026-07-23", value: 1.0812 });
  });

  it("returns null rather than a partial series when the shape is unreadable", () => {
    expect(parseEcbSeries({ dataSets: [] })).toBeNull();
    expect(parseEcbSeries({ dataSets: [{ series: {} }] })).toBeNull();
    expect(parseEcbSeries(null)).toBeNull();
    expect(parseEcbSeries("not json")).toBeNull();
  });

  it("skips observations whose value is not a finite number", () => {
    const withNulls = {
      ...ecbFixture,
      dataSets: [{ series: { s: { observations: { "0": [null], "1": [1.0845] } } } }],
    };
    const parsed = parseEcbSeries(withNulls);
    expect(parsed?.latest.value).toBe(1.0845);
    expect(parsed?.previous).toBeNull();
  });
});

describe("EcbFxProvider", () => {
  it("declares itself free, credential-free, and configured with nothing set", () => {
    const descriptor = new EcbFxProvider({ pairs: [] }).describe();
    expect(descriptor.requiresPaidSubscription).toBe(false);
    expect(descriptor.requiresCredentials).toBe(false);
    // The load-bearing assertion for the whole correction: an official source
    // needs no configuration, so it cannot be reported as unconfigured.
    expect(descriptor.configured).toBe(true);
    expect(descriptor.sourceClass).toBe("official_primary");
    expect(descriptor.observationClass).toBe("latest_official");
  });

  it("observes a published rate with the ECB's own date, not the retrieval time", async () => {
    const provider = new EcbFxProvider({
      pairs: [{ assetId: "fx-eur-usd", quoteCurrency: "USD" }],
      fetchImpl: async () => jsonResponse(ecbFixture),
      now: () => NOW,
    });

    const { observations, failures } = await provider.observe({
      assetIds: ["fx-eur-usd"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });

    expect(failures).toHaveLength(0);
    const observation = observations[0]!;
    expect(observation.price).toBe(1.0845);
    expect(observation.currency).toBe("USD");
    expect(observation.observedAt).toBe("2026-07-24T00:00:00Z");
    expect(observation.retrievedAt).toBe(new Date(NOW).toISOString());
    expect(observation.previousClose).toBe(1.0812);
    expect(observation.observationClass).toBe("latest_official");
    expect(observation.attribution).toContain("European Central Bank");
  });

  it("inverts exactly and says the figure was derived", async () => {
    const provider = new EcbFxProvider({
      pairs: [{ assetId: "fx-usd-eur", quoteCurrency: "USD", invert: true }],
      fetchImpl: async () => jsonResponse(ecbFixture),
      now: () => NOW,
    });

    const { observations } = await provider.observe({
      assetIds: ["fx-usd-eur"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });

    const observation = observations[0]!;
    expect(observation.price).toBeCloseTo(1 / 1.0845, 12);
    expect(observation.currency).toBe("EUR");
    expect(observation.priceUnit).toBe("1 USD");
    expect(observation.attribution).toContain("reciprocal");
  });

  it("reports a network failure as an environment restriction, not a data gap", async () => {
    const provider = new EcbFxProvider({
      pairs: [{ assetId: "fx-eur-usd", quoteCurrency: "USD" }],
      fetchImpl: async () => {
        throw new Error("CONNECT tunnel failed, response 403");
      },
      now: () => NOW,
    });

    const { observations, failures } = await provider.observe({
      assetIds: ["fx-eur-usd"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });

    expect(observations).toHaveLength(0);
    expect(failures[0]!.kind).toBe("environment_no_network");
    expect(failures[0]!.operatorResolvable).toBe(true);
    expect(failures[0]!.message).toContain("not of the instrument");
  });

  it("refuses an implausible jump between consecutive publications", async () => {
    const corrupted = {
      ...ecbFixture,
      dataSets: [{ series: { s: { observations: { "0": [1.0812], "1": [10.845] } } } }],
    };
    const provider = new EcbFxProvider({
      pairs: [{ assetId: "fx-eur-usd", quoteCurrency: "USD" }],
      fetchImpl: async () => jsonResponse(corrupted),
      now: () => NOW,
    });

    const { observations, failures } = await provider.observe({
      assetIds: ["fx-eur-usd"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });

    // A decimal shift is refused rather than used, exactly as it would be from
    // a paid vendor. Official does not mean exempt from the plausibility guard.
    expect(observations).toHaveLength(0);
    expect(failures[0]!.kind).toBe("implausible_value");
  });

  it("reports a bad status and an unmapped pair distinctly", async () => {
    const provider = new EcbFxProvider({
      pairs: [{ assetId: "fx-eur-usd", quoteCurrency: "USD" }],
      fetchImpl: async () => jsonResponse({}, 503),
      now: () => NOW,
    });

    const bad = await provider.observe({
      assetIds: ["fx-eur-usd"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });
    expect(bad.failures[0]!.kind).toBe("provider_bad_status");

    const unmapped = await provider.observe({
      assetIds: ["fx-aed-npr"],
      asOf: "2026-07-24T18:00:00Z",
      horizon: "daily",
    });
    expect(unmapped.failures[0]!.kind).toBe("instrument_not_covered");
  });
});
