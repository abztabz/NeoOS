"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useConversation } from "@/data/conversation-store";
import { useReport } from "@/data/report-store";
import {
  mayRender,
  resolveActivePortfolio,
  NO_ANALYSIS_YET,
  type ActivePortfolio,
  type PortfolioMode,
} from "@/domain/portfolio/portfolio";

/**
 * Which portfolio the interface is currently about.
 *
 * One hook, consulted by every surface that renders portfolio-dependent
 * content, so the answer cannot differ between two components on the same
 * screen. Before this, each workspace independently rendered whatever the
 * report store happened to hold, and the report store defaults to a fixture.
 *
 * The active mode is derived rather than chosen: a declared position makes
 * itself active, and there is no toggle back. A control that let somebody flip
 * to demo data would leave a way to read fixture holdings as their own, which
 * is the whole failure this exists to close.
 */

/**
 * Whether the operator has opened the worked example.
 *
 * A module singleton rather than context, matching the report store, and backed
 * by sessionStorage rather than localStorage on purpose: exploring the demo is
 * something you do once while deciding whether to use NeoOS, not a setting you
 * carry between sessions. Closing the tab ends it.
 */
const DEMO_KEY = "neoos.exploring-demo";
let exploringDemo = false;
const demoListeners = new Set<() => void>();

function readStoredDemoFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    // Storage blocked. In-memory state still works for this session.
    return exploringDemo;
  }
}

export function setExploringDemo(value: boolean): void {
  exploringDemo = value;
  try {
    if (value) window.sessionStorage.setItem(DEMO_KEY, "1");
    else window.sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // Ignored: the in-memory flag above is the source of truth either way.
  }
  for (const listener of demoListeners) listener();
}

function subscribeDemo(listener: () => void): () => void {
  demoListeners.add(listener);
  return () => demoListeners.delete(listener);
}

export function useExploringDemo(): boolean {
  return useSyncExternalStore(
    subscribeDemo,
    () => {
      // Reconcile once with storage so a refresh mid-exploration is not treated
      // as a fresh first run.
      if (!exploringDemo && readStoredDemoFlag()) exploringDemo = true;
      return exploringDemo;
    },
    // The server renders the pre-choice state, always. Rendering demo content
    // server-side would put fixture holdings in the initial HTML.
    () => false,
  );
}

export function useActivePortfolio(): ActivePortfolio {
  const { profile } = useConversation();
  const demo = useExploringDemo();
  return resolveActivePortfolio({ profile, exploringDemo: demo });
}

/**
 * The mode a report belongs to.
 *
 * `demo` is the fixture universe — Apple, an S&P tracker, a developed-market
 * ETF, none of which this household owns. `imported` and `live` describe the
 * subject's own analysed universe.
 */
export function useReportMode(): PortfolioMode {
  const { source } = useReport();
  return source === "demo" ? "demo" : "user";
}

/**
 * Gate for anything derived from the analysed report.
 *
 * Renders children only when the report's mode is permitted on the active
 * surface. When it is not, it says so in a sentence rather than rendering
 * nothing — the subject has declared a position, and "we haven't analysed it
 * yet" is different from "you own nothing", worth distinguishing out loud.
 */
export function ReportGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const active = useActivePortfolio();
  const reportMode = useReportMode();

  if (mayRender(active, reportMode)) return <>{children}</>;

  return (
    <>
      {fallback ?? (
        <section
          data-testid="analysis-unavailable"
          aria-label="No analysis yet"
          className="rounded-2xl border border-[#222d36] bg-panel2 p-4"
        >
          <p className="text-[13px] font-semibold text-ink">Not analysed yet</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#9aa7b3]">{NO_ANALYSIS_YET}</p>
        </section>
      )}
    </>
  );
}

/**
 * Whether the demo badge should appear at all.
 *
 * Hidden once a real portfolio exists, because at that point there is no demo
 * content on screen to warn about, and a badge that warns about nothing trains
 * people to ignore badges.
 */
export function useDemoBadgeVisible(): boolean {
  const active = useActivePortfolio();
  const reportMode = useReportMode();
  return active.demoVisible && reportMode === "demo";
}
