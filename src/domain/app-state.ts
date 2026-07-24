import type { NeoosReport } from "@/schemas/neoos-report";

/**
 * Explicit application data states. The header badge always shows exactly one
 * of these — there is no silent fallback between them.
 *
 * - demo:                  demo report active, everything labeled demo
 * - imported:              a user-imported report is active and fresh
 * - live_verified:         reserved for a real, timestamped, verified live feed
 *                          (unreachable until such a feed exists — we never
 *                          claim live without actual retrieval + verification)
 * - stale:                 non-demo report older than the freshness horizon
 * - insufficient_evidence: the active report's overall posture could not be
 *                          computed from sufficient evidence
 * - error:                 loading persisted data failed; demo is shown but the
 *                          failure is surfaced, and the raw bytes are preserved
 */
export type DataState =
  | "demo"
  | "imported"
  | "live_verified"
  | "stale"
  | "insufficient_evidence"
  | "error";

/**
 * Freshness horizon for a daily report. 36h (not 24h) so a report generated
 * yesterday morning is still "fresh" tonight, but skipping a day is visibly
 * stale. Documented in docs/EVIDENCE_POLICY.md.
 */
export const REPORT_STALE_AFTER_HOURS = 36;

export interface DataStateInput {
  report: NeoosReport;
  source: "demo" | "imported" | "live";
  loadError: string | null;
  now?: Date;
}

export function deriveDataState({ report, source, loadError, now }: DataStateInput): DataState {
  if (loadError !== null) return "error";
  if (source === "demo" || report.mode === "demo") return "demo";
  if (report.deployment.recommendation === "Insufficient Evidence") {
    return "insufficient_evidence";
  }
  if (isReportStale(report.asOf, now)) return "stale";
  return source === "live" ? "live_verified" : "imported";
}

export function isReportStale(asOfIso: string, now: Date = new Date()): boolean {
  const asOf = new Date(asOfIso).getTime();
  if (Number.isNaN(asOf)) return true;
  return now.getTime() - asOf > REPORT_STALE_AFTER_HOURS * 3_600_000;
}

export const dataStateLabels: Record<DataState, string> = {
  demo: "Demo data",
  imported: "Imported",
  live_verified: "Live · verified",
  stale: "Stale report",
  insufficient_evidence: "Insufficient evidence",
  error: "Data error",
};

/** Badge tone per state — color plus text, never color alone. */
export const dataStateTones: Record<DataState, "amber" | "cyan" | "green" | "red"> = {
  demo: "amber",
  imported: "cyan",
  live_verified: "green",
  stale: "amber",
  insufficient_evidence: "amber",
  error: "red",
};

/** "3h ago" / "2d ago" — details view always keeps the exact timestamp too. */
export function formatRelativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
