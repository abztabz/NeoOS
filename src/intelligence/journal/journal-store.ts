import { fnv1a64, stableStringify } from "@/engine/hash";
import { decisionJournalEntrySchema, type DecisionJournalEntry } from "@/engine/models";
import { decisionCaptureSchema, type DecisionCapture } from "@/intelligence/types/decision";
import { z } from "zod";

/**
 * Append-only journal and decision log.
 *
 * Entries are never edited. A correction appends a NEW entry whose
 * `supersedes` points at the one it replaces; both remain readable, and the
 * timeline shows the correction rather than quietly rewriting the past.
 *
 * Persistence is browser-local for this sprint. The storage port below is the
 * seam a durable server-side store slots into — see docs/JOURNAL_APPEND_FLOW.md
 * for the limitation, which the UI states plainly.
 */

const JOURNAL_KEY = "neoos.journal.v3";
const DECISIONS_KEY = "neoos.decisions.v3";
const RUN_HISTORY_KEY = "neoos.runs.v3";

/** Storage port. Swapping this is how the journal becomes durable later. */
export interface JournalStorage {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
}

export const browserStorage: JournalStorage = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export function memoryStorage(): JournalStorage {
  const map = new Map<string, string>();
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => {
      map.set(key, value);
      return true;
    },
  };
}

const journalFileSchema = z.object({
  schemaVersion: z.literal("3.0"),
  entries: z.array(decisionJournalEntrySchema),
});

const decisionFileSchema = z.object({
  schemaVersion: z.literal("3.0"),
  decisions: z.array(decisionCaptureSchema),
});

/**
 * Compact run summary. The full cycle result is large and session-scoped; this
 * is the durable record of what ran and how it went.
 */
export const runSummarySchema = z.object({
  runId: z.string(),
  state: z.string(),
  dataLabel: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  rawIngested: z.number().int(),
  normalized: z.number().int(),
  rawRejected: z.number().int(),
  conflictsUnresolved: z.number().int(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

const runHistoryFileSchema = z.object({
  schemaVersion: z.literal("3.0"),
  runs: z.array(runSummarySchema),
});

export function readRunHistory(storage: JournalStorage): RunSummary[] {
  const raw = storage.read(RUN_HISTORY_KEY);
  if (raw === null) return [];
  try {
    const parsed = runHistoryFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.runs : [];
  } catch {
    return [];
  }
}

/** Append a run summary, newest first, capped so storage cannot grow without bound. */
export function appendRunSummary(storage: JournalStorage, summary: RunSummary): RunSummary[] {
  const next = [summary, ...readRunHistory(storage).filter((r) => r.runId !== summary.runId)].slice(
    0,
    50,
  );
  storage.write(RUN_HISTORY_KEY, JSON.stringify({ schemaVersion: "3.0", runs: next }));
  return next;
}

export function readJournal(storage: JournalStorage): DecisionJournalEntry[] {
  const raw = storage.read(JOURNAL_KEY);
  if (raw === null) return [];
  try {
    const parsed = journalFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.entries : [];
  } catch {
    return [];
  }
}

export function readDecisions(storage: JournalStorage): DecisionCapture[] {
  const raw = storage.read(DECISIONS_KEY);
  if (raw === null) return [];
  try {
    const parsed = decisionFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.decisions : [];
  } catch {
    return [];
  }
}

export interface AppendOutcome {
  ok: boolean;
  entries: DecisionJournalEntry[];
  persisted: boolean;
  reason: string | null;
}

/**
 * Append an entry. Refuses to append an entry whose id already exists —
 * re-recording the same run must go through `appendCorrection`.
 */
export function appendJournalEntry(
  storage: JournalStorage,
  entry: DecisionJournalEntry,
): AppendOutcome {
  const entries = readJournal(storage);
  if (entries.some((e) => e.entryId === entry.entryId)) {
    return {
      ok: false,
      entries,
      persisted: false,
      reason: `Entry ${entry.entryId} already exists. History is append-only: record a correction instead.`,
    };
  }
  const next = [...entries, entry];
  const persisted = storage.write(
    JOURNAL_KEY,
    JSON.stringify({ schemaVersion: "3.0", entries: next }),
  );
  return { ok: true, entries: next, persisted, reason: persisted ? null : "Browser storage unavailable; this entry lasts only for the session." };
}

/**
 * Record a correction to an earlier entry. The original is left untouched; the
 * new entry references it via `supersedes`.
 */
export function appendCorrection(
  storage: JournalStorage,
  originalEntryId: string,
  changes: Partial<Omit<DecisionJournalEntry, "entryId" | "supersedes" | "integrityHash">>,
  newEntryId: string,
): AppendOutcome {
  const entries = readJournal(storage);
  const original = entries.find((e) => e.entryId === originalEntryId);
  if (!original) {
    return { ok: false, entries, persisted: false, reason: `No entry ${originalEntryId} to correct.` };
  }
  const base = {
    ...original,
    ...changes,
    entryId: newEntryId,
    supersedes: originalEntryId,
  };
  const draft: Omit<DecisionJournalEntry, "integrityHash"> = { ...base };
  delete (draft as Partial<DecisionJournalEntry>).integrityHash;
  const corrected: DecisionJournalEntry = {
    ...base,
    integrityHash: fnv1a64(stableStringify(draft)),
  };
  return appendJournalEntry(storage, corrected);
}

export interface DecisionOutcome {
  ok: boolean;
  decisions: DecisionCapture[];
  persisted: boolean;
  reason: string | null;
}

/** Record a user decision. Decisions are separate records from recommendations. */
export function recordDecision(
  storage: JournalStorage,
  decision: DecisionCapture,
): DecisionOutcome {
  const decisions = readDecisions(storage);
  const next = [...decisions.filter((d) => d.decisionId !== decision.decisionId), decision];
  const persisted = storage.write(
    DECISIONS_KEY,
    JSON.stringify({ schemaVersion: "3.0", decisions: next }),
  );
  return {
    ok: true,
    decisions: next,
    persisted,
    reason: persisted ? null : "Browser storage unavailable; this decision lasts only for the session.",
  };
}

/** Verify an entry's integrity marker. Tamper-evident, not tamper-proof. */
export function verifyEntryIntegrity(entry: DecisionJournalEntry): boolean {
  const draft: Omit<DecisionJournalEntry, "integrityHash"> = { ...entry };
  delete (draft as Partial<DecisionJournalEntry>).integrityHash;
  return fnv1a64(stableStringify(draft)) === entry.integrityHash;
}

/** Entries that have been superseded by a later correction. */
export function supersededIds(entries: DecisionJournalEntry[]): Set<string> {
  return new Set(entries.map((e) => e.supersedes).filter((id): id is string => id !== null));
}
