"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { demoReport } from "@/data/demo-report";
import {
  parseReport,
  type NeoosReport,
  type ParseReportResult,
} from "@/schemas/neoos-report";

const STORAGE_KEY = "neoos.report.v1";
/** Corrupt stored reports are preserved here — never destroyed, never silently replaced. */
const RECOVERY_KEY = "neoos.report.recovery";

export type StorageStatus = "unknown" | "persisted" | "memory-only";
export type ReportSource = "demo" | "imported" | "live";

interface StoreState {
  report: NeoosReport;
  source: ReportSource;
  storageStatus: StorageStatus;
  /**
   * Non-null when loading persisted data failed. Demo content is shown, but
   * the failure is explicit (header error state) — never a silent fallback.
   */
  loadError: string | null;
}

/**
 * Defensive storage adapter. Browser storage is optional — never required for
 * first render, never allowed to throw into the UI.
 */
function storageRead(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storageWrite(value: string, key: string = STORAGE_KEY): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageClear(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * External store consumed via useSyncExternalStore: the server snapshot is
 * always the demo report (so prerendered HTML has useful content), and the
 * client snapshot rehydrates any persisted import at module load.
 */
const serverState: StoreState = {
  report: demoReport,
  source: "demo",
  storageStatus: "unknown",
  loadError: null,
};

let clientState: StoreState = serverState;
const listeners = new Set<() => void>();

function setState(partial: Partial<StoreState>): void {
  clientState = { ...clientState, ...partial };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function initFromStorage(): StoreState {
  const stored = storageRead();
  if (stored === null) {
    // Distinguish "no stored report" from "storage blocked" with a write probe.
    const writable = storageWrite("");
    storageClear();
    return {
      report: demoReport,
      source: "demo",
      storageStatus: writable ? "persisted" : "memory-only",
      loadError: null,
    };
  }
  const parsed = parseReport(stored);
  if (parsed.ok) {
    return {
      report: parsed.report,
      source: "imported",
      storageStatus: "persisted",
      loadError: null,
    };
  }
  // Stored data is corrupt or from an unsupported version. Preserve the raw
  // bytes for recovery and surface an explicit error state — demo content is
  // shown, but never silently.
  storageWrite(stored, RECOVERY_KEY);
  storageClear();
  return {
    report: demoReport,
    source: "demo",
    storageStatus: "persisted",
    loadError: `Stored report could not be loaded (${parsed.error}) — the raw data was preserved for recovery. Demo content is shown instead.`,
  };
}

if (typeof window !== "undefined") {
  clientState = initFromStorage();
}

/** Test-only: reset the module singleton between test cases. */
export function _resetStoreForTests(): void {
  storageClear();
  clientState = {
    report: demoReport,
    source: "demo",
    storageStatus: "persisted",
    loadError: null,
  };
  for (const listener of listeners) listener();
}

export interface ReportContextValue {
  report: NeoosReport;
  source: ReportSource;
  storageStatus: StorageStatus;
  loadError: string | null;
  /** Validate report text without applying it (used for import preview). */
  previewReport: (text: string) => ParseReportResult;
  /** Validate and atomically apply report text. Current state survives failure. */
  importReport: (text: string) => ParseReportResult;
  resetDemo: () => void;
  /** Acknowledge a load error (state returns to demo; recovery data stays). */
  dismissLoadError: () => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    () => clientState,
    () => serverState,
  );

  const previewReport = useCallback((text: string) => parseReport(text), []);

  const importReport = useCallback((text: string): ParseReportResult => {
    const parsed = parseReport(text);
    if (!parsed.ok) return parsed;
    const persisted = storageWrite(JSON.stringify(parsed.report));
    setState({
      report: parsed.report,
      source: "imported",
      storageStatus: persisted ? "persisted" : "memory-only",
      loadError: null,
    });
    return parsed;
  }, []);

  const resetDemo = useCallback(() => {
    storageClear();
    setState({ report: demoReport, source: "demo", loadError: null });
  }, []);

  const dismissLoadError = useCallback(() => {
    setState({ loadError: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, previewReport, importReport, resetDemo, dismissLoadError }),
    [state, previewReport, importReport, resetDemo, dismissLoadError],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used within ReportProvider");
  return ctx;
}
