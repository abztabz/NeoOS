import { readFileSync } from "node:fs";
import { join } from "node:path";
import { databaseCaCertificate, databaseUrl } from "@/server/config/env";
import type { IntakeStore } from "@/server/persistence/intake-store";
import { MemoryReportStore } from "@/server/persistence/memory-store";
import { PostgresReportStore } from "@/server/persistence/postgres-store";
import type { ReportStore } from "@/server/persistence/store";

/**
 * Store selection.
 *
 * With `DATABASE_URL` set, Postgres. Without it, memory — and the memory store
 * says durable: false, which the UI renders. The application does not refuse to
 * start without a database, but it also never lets the absence of one pass
 * unmentioned.
 *
 * The instance is cached per process so a warm serverless invocation reuses its
 * connection pool instead of opening a new one on every request.
 */

/**
 * Both implementations satisfy both ports over one connection. Callers ask for
 * the port they need, so a module that only reads intake cannot reach the
 * report journal by accident.
 */
type CombinedStore = ReportStore & IntakeStore;

let cached: CombinedStore | null = null;
let cachedFor: string | null = null;

export function migrationSql(): string {
  return readFileSync(join(process.cwd(), "src/server/persistence/schema.sql"), "utf8");
}

function getStore(): CombinedStore {
  const url = databaseUrl();
  const key = url ?? "memory";
  if (cached && cachedFor === key) return cached;

  cached = url
    ? new PostgresReportStore(url, migrationSql(), {}, databaseCaCertificate())
    : new MemoryReportStore();
  cachedFor = key;
  return cached;
}

export function getReportStore(): ReportStore {
  return getStore();
}

export function getIntakeStore(): IntakeStore {
  return getStore();
}

/** Test seam. Never called by application code. */
export function __setReportStoreForTests(store: CombinedStore | null): void {
  cached = store;
  cachedFor = store ? "test" : null;
}
