"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  browserStorage,
  readDecisions,
  readJournal,
  recordDecision,
  type JournalStorage,
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
  const [storagePersists, setStoragePersists] = useState(true);
  const [previousReport, setPreviousReport] = useState<EngineReport | null>(null);

  // Journal and decisions load lazily on first access so the provider never
  // touches storage during server rendering.
  const ensureLoaded = useCallback(() => {
    if (journal.length === 0 && decisions.length === 0) {
      setJournal(readJournal(storage));
      setDecisions(readDecisions(storage));
    }
  }, [journal.length, decisions.length, storage]);

  const record = useCallback((run: DailyCycleResult) => {
    setLastRun(run);
    setHistory((prev) => [run, ...prev].slice(0, 20));
    // Only a run that produced a report advances the comparison baseline; a
    // failed run must not become the thing the next run is compared against.
    if (run.report) setPreviousReport(run.report.engine);
    return run;
  }, []);

  const runFixtureDay = useCallback(
    async (day: 1 | 2) => {
      setRunning(true);
      ensureLoaded();
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
    [ensureLoaded, previousReport, record, storage],
  );

  const runManualEvidence = useCallback(
    async (text: string) => {
      const parsed = ManualEvidenceImportAdapter.parse(text);
      if (!parsed.ok) return { error: parsed.error };

      setRunning(true);
      ensureLoaded();
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
    [ensureLoaded, previousReport, record, storage],
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
