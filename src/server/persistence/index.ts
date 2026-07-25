import { readFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl } from "@/server/config/env";
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

let cached: ReportStore | null = null;
let cachedFor: string | null = null;

export function migrationSql(): string {
  return readFileSync(join(process.cwd(), "src/server/persistence/schema.sql"), "utf8");
}

export function getReportStore(): ReportStore {
  const url = databaseUrl();
  const key = url ?? "memory";
  if (cached && cachedFor === key) return cached;

  cached = url ? new PostgresReportStore(url, migrationSql()) : new MemoryReportStore();
  cachedFor = key;
  return cached;
}

/** Test seam. Never called by application code. */
export function __setReportStoreForTests(store: ReportStore | null): void {
  cached = store;
  cachedFor = store ? "test" : null;
}
