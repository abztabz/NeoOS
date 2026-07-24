import { demoSections } from "@/data/demo-report";
import type { NeoosReport } from "@/schemas/neoos-report";

/**
 * Per-section report selectors. A v1.1 report may carry any subset of the
 * workspace sections; whatever is missing falls back to the canonical demo
 * content, and the caller gets provenance so the UI can label the fallback.
 */
export interface SectionView<T> {
  data: T;
  /** True when the current report itself provided this section. */
  fromReport: boolean;
}

type SectionKey = keyof typeof demoSections;

function view<K extends SectionKey>(
  report: NeoosReport,
  key: K,
): SectionView<NonNullable<NeoosReport[K]>> {
  const fromReport = report[key] != null;
  const data = (fromReport ? report[key] : demoSections[key]) as NonNullable<NeoosReport[K]>;
  return { data, fromReport };
}

export const regimeView = (r: NeoosReport) => view(r, "regime");
export const commentaryView = (r: NeoosReport) => view(r, "commentary");
export const marketsView = (r: NeoosReport) => view(r, "markets");
export const portfolioView = (r: NeoosReport) => view(r, "portfolio");
export const goldView = (r: NeoosReport) => view(r, "gold");
export const cashView = (r: NeoosReport) => view(r, "cash");
export const timelineView = (r: NeoosReport) => view(r, "timeline");
export const tiersView = (r: NeoosReport) => view(r, "tiers");
export const deploymentPlanView = (r: NeoosReport) => view(r, "deploymentPlan");

/**
 * A fallback section only needs calling out when the surrounding report is
 * NOT demo data — in demo mode everything is demo and the header badge says so.
 */
export function isDemoFallback(report: NeoosReport, sectionView: SectionView<unknown>): boolean {
  return !sectionView.fromReport && report.mode !== "demo";
}

/** Section keys a report actually provides (used by the import preview). */
export function providedSections(report: NeoosReport): SectionKey[] {
  return (Object.keys(demoSections) as SectionKey[]).filter((key) => report[key] != null);
}
