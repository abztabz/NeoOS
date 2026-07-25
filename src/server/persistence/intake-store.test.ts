// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyProfile, type IntakeProfile } from "@/domain/intake/types";
import { profileIntegrityHash, type IntakeStore } from "@/server/persistence/intake-store";
import { MemoryReportStore } from "@/server/persistence/memory-store";

/**
 * The intake storage contract.
 *
 * Written against the port, so the Postgres store runs the identical suite (see
 * postgres-store.test.ts). The behaviours asserted here are the ones that make
 * a correction visible as a correction rather than as a quiet rewrite.
 */

const SUBJECT = "subject-operator";
const OTHER = "subject-other";

function profile(
  profileId: string,
  recordedAt: string,
  overrides: Partial<IntakeProfile> = {},
): IntakeProfile {
  return { ...emptyProfile(SUBJECT, profileId, recordedAt), ...overrides };
}

function withOneAsset(base: IntakeProfile, amount: number): IntakeProfile {
  return {
    ...base,
    assets: [
      {
        assetHoldingId: "asset-1",
        subjectId: base.subjectId,
        kind: "real_estate",
        label: "Dubai flat",
        value: { amount, currency: "AED", basis: "professional_appraisal", asOf: "2026-01-10", note: null },
        registryAssetId: null,
        identifier: null,
        quantity: null,
        liquidity: "months",
        jurisdiction: "AE",
        custodian: null,
        encumberedBy: null,
        restricted: false,
        notes: null,
      },
    ],
  };
}

function intakeContractTests(name: string, make: () => IntakeStore) {
  describe(name, () => {
    it("returns null when the subject has declared nothing", async () => {
      // Not an error state. Nothing declared and nothing owned are different
      // things, and the difference is the whole guidance-level mechanism.
      expect(await make().getCurrentProfile(SUBJECT)).toBeNull();
    });

    it("stores a profile and returns it as current", async () => {
      const store = make();
      const result = await store.saveProfile(profile("profile-1", "2026-07-01T09:00:00.000Z"));
      expect(result.stored).toBe(true);
      expect((await store.getCurrentProfile(SUBJECT))?.profileId).toBe("profile-1");
    });

    it("refuses to overwrite an existing profile", async () => {
      const store = make();
      const first = withOneAsset(profile("profile-1", "2026-07-01T09:00:00.000Z"), 2_000_000);
      await store.saveProfile(first);

      const rewrite = withOneAsset(profile("profile-1", "2026-07-01T09:00:00.000Z"), 9_000_000);
      const second = await store.saveProfile(rewrite);

      expect(second.stored).toBe(false);
      expect(second.reason).toMatch(/already exists/);
      const current = await store.getCurrentProfile(SUBJECT);
      expect(current?.assets[0]?.value.amount).toBe(2_000_000);
    });

    it("makes a correction current while keeping the original readable", async () => {
      const store = make();
      await store.saveProfile(withOneAsset(profile("profile-1", "2026-07-01T09:00:00.000Z"), 2_000_000));
      await store.saveProfile(
        withOneAsset(profile("profile-2", "2026-07-20T09:00:00.000Z", { supersedes: "profile-1" }), 1_400_000),
      );

      // The revaluation is the current position...
      expect((await store.getCurrentProfile(SUBJECT))?.profileId).toBe("profile-2");
      // ...and the figure it replaced is still there to be compared against.
      // Without this, a third of the value disappearing would be undetectable.
      const original = await store.getProfile(SUBJECT, "profile-1");
      expect(original?.assets[0]?.value.amount).toBe(2_000_000);
    });

    it("reports history newest first and marks what was superseded", async () => {
      const store = make();
      await store.saveProfile(profile("profile-1", "2026-07-01T09:00:00.000Z"));
      await store.saveProfile(profile("profile-2", "2026-07-20T09:00:00.000Z", { supersedes: "profile-1" }));

      const history = await store.listProfileHistory(SUBJECT, 10);
      expect(history.map((h) => h.profileId)).toEqual(["profile-2", "profile-1"]);
      expect(history[0]?.superseded).toBe(false);
      expect(history[1]?.superseded).toBe(true);
      expect(history[0]?.supersedes).toBe("profile-1");
    });

    it("counts what the profile contains without opening it", async () => {
      const store = make();
      await store.saveProfile(withOneAsset(profile("profile-1", "2026-07-01T09:00:00.000Z"), 2_000_000));
      const summary = (await store.listProfileHistory(SUBJECT, 10))[0];
      expect(summary?.assetCount).toBe(1);
      expect(summary?.incomeSourceCount).toBe(0);
      expect(summary?.dependentCount).toBe(0);
      expect(summary?.integrityHash).toHaveLength(16);
    });

    it("refuses a correction to a profile that does not exist", async () => {
      const store = make();
      const result = await store.saveProfile(
        profile("profile-2", "2026-07-20T09:00:00.000Z", { supersedes: "profile-nope" }),
      );
      expect(result.stored).toBe(false);
      expect(result.reason).toMatch(/nothing to correct/);
      expect(await store.getCurrentProfile(SUBJECT)).toBeNull();
    });

    it("refuses a second correction to the same version", async () => {
      // Two profiles both claiming to replace profile-1 would leave the current
      // position ambiguous, and an ambiguous position is worse than a stale one.
      const store = make();
      await store.saveProfile(profile("profile-1", "2026-07-01T09:00:00.000Z"));
      await store.saveProfile(profile("profile-2", "2026-07-20T09:00:00.000Z", { supersedes: "profile-1" }));

      const clash = await store.saveProfile(
        profile("profile-3", "2026-07-21T09:00:00.000Z", { supersedes: "profile-1" }),
      );
      expect(clash.stored).toBe(false);
      expect(clash.reason).toMatch(/already been superseded/);
      expect((await store.getCurrentProfile(SUBJECT))?.profileId).toBe("profile-2");
    });

    it("refuses to supersede another subject's profile", async () => {
      const store = make();
      await store.saveProfile(profile("profile-1", "2026-07-01T09:00:00.000Z"));
      const crossed = await store.saveProfile({
        ...emptyProfile(OTHER, "profile-2", "2026-07-20T09:00:00.000Z"),
        supersedes: "profile-1",
      });
      expect(crossed.stored).toBe(false);
      expect(crossed.reason).toMatch(/same subject/);
    });

    it("keeps subjects apart", async () => {
      // There is one subject today. The separation is tested now so that adding
      // a second is a matter of writing a different id, not a migration.
      const store = make();
      await store.saveProfile(profile("profile-1", "2026-07-01T09:00:00.000Z"));
      await store.saveProfile(emptyProfile(OTHER, "profile-other", "2026-07-02T09:00:00.000Z"));

      expect((await store.getCurrentProfile(SUBJECT))?.profileId).toBe("profile-1");
      expect((await store.getCurrentProfile(OTHER))?.profileId).toBe("profile-other");
      expect(await store.getProfile(SUBJECT, "profile-other")).toBeNull();
      expect(await store.listProfileHistory(OTHER, 10)).toHaveLength(1);
    });

    it("treats an uncorrected older profile as current when a newer one belongs to a chain", async () => {
      // Ordering is by recordedAt, so a profile back-dated after the fact does
      // not silently become the current position.
      const store = make();
      await store.saveProfile(profile("profile-recent", "2026-07-20T09:00:00.000Z"));
      await store.saveProfile(profile("profile-backdated", "2026-01-01T09:00:00.000Z"));
      expect((await store.getCurrentProfile(SUBJECT))?.profileId).toBe("profile-recent");
    });
  });
}

intakeContractTests("MemoryReportStore intake", () => new MemoryReportStore());

describe("profileIntegrityHash", () => {
  it("does not depend on key order", () => {
    const a = profile("profile-1", "2026-07-01T09:00:00.000Z");
    const reordered = JSON.parse(
      JSON.stringify({
        objective: a.objective,
        household: a.household,
        liabilities: a.liabilities,
        assets: a.assets,
        incomeSources: a.incomeSources,
        supersedes: a.supersedes,
        recordedAt: a.recordedAt,
        profileId: a.profileId,
        subjectId: a.subjectId,
        schemaVersion: a.schemaVersion,
      }),
    ) as IntakeProfile;
    expect(profileIntegrityHash(reordered)).toBe(profileIntegrityHash(a));
  });

  it("changes when a figure changes", () => {
    const base = profile("profile-1", "2026-07-01T09:00:00.000Z");
    expect(profileIntegrityHash(withOneAsset(base, 2_000_000))).not.toBe(
      profileIntegrityHash(withOneAsset(base, 2_000_001)),
    );
  });
});
