import { describe, expect, it } from "vitest";
import { describeStorageFailure, storageFailed } from "@/server/api/storage-error";

/**
 * The behaviour these pin: an operator staring at a broken deployment gets a
 * sentence they can act on, not a status code. The failure that motivated this
 * module took three rounds of guesswork to identify because the interface said
 * only "(500)".
 */

function pgError(code: string, message = "boom"): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("naming known database faults", () => {
  it("recognises a privilege refusal and points at the grants", () => {
    const failure = describeStorageFailure(pgError("42501", "permission denied for table reports"));
    expect(failure.message).toContain("privilege");
    expect(failure.remedy).toContain("SELECT and INSERT");
    expect(failure.code).toBe("42501");
  });

  it("recognises a missing table as a migration that did not complete", () => {
    const failure = describeStorageFailure(pgError("42P01"));
    expect(failure.message).toContain("does not exist");
    expect(failure.remedy).toContain("migration");
  });

  it("recognises bad credentials without echoing them", () => {
    const failure = describeStorageFailure(pgError("28P01", "password authentication failed for user postgres"));
    expect(failure.message).toContain("refused the credentials");
    expect(failure.message).not.toContain("postgres");
    expect(failure.remedy).toContain("redeploy");
  });

  it("recognises connection exhaustion and points at pooling", () => {
    expect(describeStorageFailure(pgError("53300")).remedy).toContain("pooled");
  });
});

describe("the transaction-pooler case", () => {
  // The specific fault this module was written for: a pooler in transaction
  // mode accepts SELECT 1 and rejects the migration's dollar-quoted PL/pgSQL,
  // so health reports the database reachable while every real query fails.
  const poolerErrors = [
    "prepared statement \"s1\" does not exist",
    "unsupported startup parameter: options",
    "cannot insert multiple commands into a prepared statement",
    "server closed the connection unexpectedly",
  ];

  for (const message of poolerErrors) {
    it(`identifies "${message.slice(0, 32)}…" as transaction-mode pooling`, () => {
      const failure = describeStorageFailure(new Error(message));
      expect(failure.remedy).toContain("session pooler");
      expect(failure.remedy).toContain("5432");
      expect(failure.remedy).toContain("6543");
    });
  }
});

describe("faults it cannot interpret", () => {
  it("returns the driver's own words rather than swallowing them", () => {
    const failure = describeStorageFailure(new Error("something entirely novel"));
    expect(failure.message).toContain("something entirely novel");
    expect(failure.remedy).toBeNull();
  });

  it("handles a thrown non-error", () => {
    expect(describeStorageFailure("just a string").message).toContain("just a string");
  });
});

describe("the response", () => {
  it("uses 503 rather than 500, because the request was fine", async () => {
    const response = storageFailed(pgError("42P01"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; remedy: string; stored: boolean };
    expect(body.error).toBeTruthy();
    expect(body.remedy).toBeTruthy();
    // States plainly that nothing was half-written.
    expect(body.stored).toBe(false);
  });

  it("is never cached", () => {
    expect(storageFailed(new Error("x")).headers.get("cache-control")).toBe("no-store");
  });
});
