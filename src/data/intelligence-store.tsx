"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DecisionJournalEntry, EngineReport } from "@/engine/models";
import { runDailyMorpheusCycle, type DailyCycleResult } from "@/intelligence/orchestration/cycle";
import {
  FIXTURE_CONTEXT,
  FIXTURE_FX,
  fixtureAdapters,
  fixturePrices,
  fixtureValuationConfig,
} from "@/intelligence/fixtures/run";
import { FIXTURE_DAY_1, FIXTURE_DAY_2 } from "@/intelligence/fixtures/records";
import { ManualEvidenceImportAdapter } from "@/intelligence/adapters/manual-import";
import { exampleHttpProvider } from "@/intelligence/adapters/http-provider";
import type { ProviderAdapter } from "@/intelligence/types/provider";
import {
  appendJournalEntry,
  appendRunSummary,
  browserStorage,
  readDecisions,
  readJournal,
  readRunHistory,
  recordDecision,
  type JournalStorage,
  type RunSummary,
} from "@/intelligence/journal/journal-store";
import type { DecisionCapture } from "@/intelligence/types/decision";
import { useReport } from "@/data/report-store";

/**
 * Client-side orchestration state.
 *
 * The store runs cycles and holds their results. It contains no pipeline logic
 * of its own — every step lives in src/intelligence, and every score comes from
 * the engine. A failed run leaves the previously applied report untouched.
 */

export interface IntelligenceContextValue {
  running: boolean;
  lastRun: DailyCycleResult | null;
  history: DailyCycleResult[];
  journal: DecisionJournalEntry[];
  decisions: DecisionCapture[];
  /** Durable run history, rehydrated across page loads. */
  runHistory: RunSummary[];
  storagePersists: boolean;
  runFixtureDay: (day: 1 | 2) => Promise<DailyCycleResult>;
  runManualEvidence: (text: string) => Promise<DailyCycleResult | { error: string }>;
  applyRunReport: (run: DailyCycleResult) => void;
  confirmJournalEntry: (run: DailyCycleResult) => { ok: boolean; reason: string | null };
  saveDecision: (decision: DecisionCapture) => void;
}

const IntelligenceContext = createContext<IntelligenceContextValue | null>(null);

export function IntelligenceProvider({
  children,
  storage = browserStorage,
}: {
  children: ReactNode;
  storage?: JournalStorage;
}) {
  const { importReport } = useReport();
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<DailyCycleResult | null>(null);
  const [history, setHistory] = useState<DailyCycleResult[]>([]);
  const [journal, setJournal] = useState<DecisionJournalEntry[]>([]);
  const [decisions, setDecisions] = useState<DecisionCapture[]>([]);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [storagePersists, setStoragePersists] = useState(true);
  const [previousReport, setPreviousReport] = useState<EngineReport | null>(null);

  // Rehydrate persisted state after mount. Storage is never touched during
  // server rendering, and a page load must show the journal that already
  // exists rather than an empty Timeline.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const id = setTimeout(() => {
      setJournal(readJournal(storage));
      setDecisions(readDecisions(storage));
      setRunHistory(readRunHistory(storage));
    }, 0);
    return () => clearTimeout(id);
  }, [storage]);

  const record = useCallback(
    (run: DailyCycleResult) => {
      setLastRun(run);
      setHistory((prev) => [run, ...prev].slice(0, 20));
      // A compact summary persists so run history survives a page load.
      setRunHistory(
        appendRunSummary(storage, {
          runId: run.runId,
          state: run.state,
          dataLabel: run.dataLabel,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          rawIngested: run.evidenceCounts.rawIngested,
          normalized: run.evidenceCounts.normalized,
          rawRejected: run.evidenceCounts.rawRejected,
          conflictsUnresolved: run.evidenceCounts.conflictsUnresolved,
        }),
      );
      // Only a run that produced a report advances the comparison baseline; a
      // failed run must not become the thing the next run is compared against.
      if (run.report) setPreviousReport(run.report.engine);
      return run;
    },
    [storage],
  );

  const runFixtureDay = useCallback(
    async (day: 1 | 2) => {
      setRunning(true);
      try {
        const run = await runDailyMorpheusCycle({
          runId: `fixture-day-${day}-${Date.now()}`,
          now: day === 1 ? FIXTURE_DAY_1 : FIXTURE_DAY_2,
          adapters: fixtureAdapters(day),
          context: FIXTURE_CONTEXT,
          valuationConfig: fixtureValuationConfig(fixturePrices(day)),
          fxTable: FIXTURE_FX,
          baseCurrency: "USD",
          journalHistory: readJournal(storage),
          previousReport: day === 2 ? previousReport : null,
        });
        return record(run);
      } finally {
        setRunning(false);
      }
    },
    [previousReport, record, storage],
  );

  const runManualEvidence = useCallback(
    async (text: string) => {
      const parsed = ManualEvidenceImportAdapter.parse(text);
      if (!parsed.ok) return { error: parsed.error };

      setRunning(true);
      try {
        // Manual evidence runs alongside the fixture providers so the operator
        // supplements the universe rather than having to supply all of it.
        const adapters: ProviderAdapter[] = [
          ...fixtureAdapters(1),
          parsed.adapter,
          // Included so its unconfigured state is visible in the provider panel.
          exampleHttpProvider({}),
        ];
        const run = await runDailyMorpheusCycle({
          runId: `manual-${Date.now()}`,
          now: FIXTURE_DAY_1,
          adapters,
          context: FIXTURE_CONTEXT,
          valuationConfig: fixtureValuationConfig(fixturePrices(1)),
          fxTable: FIXTURE_FX,
          baseCurrency: "USD",
          journalHistory: readJournal(storage),
          previousReport,
        });
        return record(run);
      } finally {
        setRunning(false);
      }
    },
    [previousReport, record, storage],
  );

  /** Apply a run's report to the cockpit, reusing the validated import path. */
  const applyRunReport = useCallback(
    (run: DailyCycleResult) => {
      if (!run.report) return;
      importReport(JSON.stringify(run.report));
    },
    [importReport],
  );

  const confirmJournalEntry = useCallback(
    (run: DailyCycleResult) => {
      if (!run.draftJournalEntry) return { ok: false, reason: "This run produced no journal entry." };
      const outcome = appendJournalEntry(storage, run.draftJournalEntry);
      setJournal(outcome.entries);
      setStoragePersists(outcome.persisted);
      return { ok: outcome.ok, reason: outcome.reason };
    },
    [storage],
  );

  const saveDecision = useCallback(
    (decision: DecisionCapture) => {
      const outcome = recordDecision(storage, decision);
      setDecisions(outcome.decisions);
      setStoragePersists(outcome.persisted);
    },
    [storage],
  );

  const value = useMemo(
    () => ({
      running,
      lastRun,
      history,
      journal,
      decisions,
      runHistory,
      storagePersists,
      runFixtureDay,
      runManualEvidence,
      applyRunReport,
      confirmJournalEntry,
      saveDecision,
    }),
    [
      running,
      lastRun,
      history,
      journal,
      decisions,
      runHistory,
      storagePersists,
      runFixtureDay,
      runManualEvidence,
      applyRunReport,
      confirmJournalEntry,
      saveDecision,
    ],
  );

  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
}

export function useIntelligence(): IntelligenceContextValue {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error("useIntelligence must be used within IntelligenceProvider");
  return ctx;
}
