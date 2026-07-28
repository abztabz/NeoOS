/**
 * Storage failures, said out loud.
 *
 * The operator API is authenticated by a single shared token, and the person
 * holding it is the person who configured the database. Returning them a bare
 * `500` is not a security posture, it is a dead end — they are the only one who
 * can fix the fault and the only one who cannot see it.
 *
 * This module turns a driver error into a sentence that names the cause and the
 * fix. It is deliberately narrow: it runs only behind operator authorisation,
 * and it never echoes the connection string, credentials, or row data.
 *
 * The specific failure this was written for: a Postgres pooler in transaction
 * mode accepts `SELECT 1` and rejects the migration's dollar-quoted PL/pgSQL,
 * so health reports the database as reachable while every real query fails. The
 * two facts look contradictory and are both true, which is precisely the sort of
 * thing an error message should explain rather than leave to guesswork.
 */

export interface StorageFailure {
  /** What went wrong, in the operator's terms. */
  message: string;
  /** The concrete next step, where one is known. */
  remedy: string | null;
  /** Driver code, kept for the operator's own searching. */
  code: string | null;
}

/** Postgres SQLSTATE codes worth naming specifically. */
const KNOWN: Record<string, { message: string; remedy: string }> = {
  "42501": {
    message: "The database rejected the operation on a privilege check.",
    remedy:
      "The role in DATABASE_URL needs SELECT and INSERT on the NeoOS tables, and UPDATE/DELETE grants that foreign keys depend on. See the notes at the foot of schema.sql.",
  },
  "42P01": {
    message: "A table NeoOS expects does not exist.",
    remedy:
      "The schema migration has not completed against this database. It runs on first use, so this usually means the migration itself failed — check the accompanying message.",
  },
  "28P01": {
    message: "The database refused the credentials in DATABASE_URL.",
    remedy: "Check the password in the connection string, then redeploy so the new value is picked up.",
  },
  "3D000": {
    message: "The database named in DATABASE_URL does not exist.",
    remedy: "Check the database name at the end of the connection string.",
  },
  "53300": {
    message: "The database is out of connections.",
    remedy:
      "Use a pooled connection string. On a serverless host a direct connection exhausts the limit under load.",
  },
  "57P01": {
    message: "The database closed the connection while NeoOS was using it.",
    remedy: "Usually transient. If it persists, the database may be restarting or overloaded.",
  },
};

/**
 * Patterns that indicate a pooler in transaction mode.
 *
 * Matched on text rather than code because poolers surface these as generic
 * errors from a proxy rather than as SQLSTATE from Postgres itself.
 */
const POOLER_HINTS = [
  "prepared statement",
  "unsupported startup parameter",
  "cannot insert multiple commands",
  "server closed the connection unexpectedly",
];

const POOLER_REMEDY =
  "This looks like a connection pooler in transaction mode. NeoOS creates functions and triggers when it first runs, and transaction-mode pooling cannot carry that. Use the session pooler instead — on Supabase that is the same host on port 5432 rather than 6543 — then redeploy.";

export function describeStorageFailure(error: unknown): StorageFailure {
  const raw = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;

  const known = code !== null ? KNOWN[code] : undefined;
  if (known) return { message: known.message, remedy: known.remedy, code };

  const lower = raw.toLowerCase();
  if (POOLER_HINTS.some((hint) => lower.includes(hint))) {
    return { message: `The database rejected the request: ${raw}`, remedy: POOLER_REMEDY, code };
  }
  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return {
      message: "The database did not respond in time.",
      remedy: "Check the host is reachable from this deployment and that the database is not paused.",
      code,
    };
  }
  if (lower.includes("enotfound") || lower.includes("eai_again")) {
    return {
      message: "The database host in DATABASE_URL could not be resolved.",
      remedy: "Check the hostname. A copied connection string sometimes keeps a placeholder.",
      code,
    };
  }

  // Unknown faults still return the driver's own words. A message NeoOS cannot
  // interpret is more useful to the operator than one it silently swallows.
  return { message: `The database rejected the request: ${raw}`, remedy: null, code };
}

/**
 * A JSON response for a storage failure behind operator authorisation.
 *
 * 503 rather than 500: the request was well-formed and the fault is a
 * dependency being unavailable, which is a different thing for the operator to
 * act on than a bug in the request they sent.
 */
export function storageFailed(error: unknown): Response {
  const failure = describeStorageFailure(error);
  return Response.json(
    {
      error: failure.message,
      remedy: failure.remedy,
      code: failure.code,
      // Named so the operator knows the position was not partially written.
      stored: false,
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
