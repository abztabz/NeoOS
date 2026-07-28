"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ConversationTurn, MorpheusAnswer, MorpheusIntent } from "@/domain/morpheus/answer";
import { classify } from "@/domain/morpheus/intents";
import { respond, type AnswerContext } from "@/domain/morpheus/answers";
import { calculateProfile, type ProfileCalculations } from "@/domain/profile/calculations";
import { intakeProfileSchema, type IntakeProfile } from "@/domain/intake/types";

/**
 * The conversational thread.
 *
 * A module singleton read through `useSyncExternalStore`, matching the report
 * store — which keeps hydration out of render and means the server and first
 * client paint agree without an effect that immediately invalidates itself.
 *
 * Living above the router is what makes "conversation state survives navigation
 * to supporting workspaces" true by construction: moving from Morpheus to the
 * Gold workspace does not touch this module, so there is nothing to preserve
 * and nothing to lose.
 *
 * Two things this store deliberately does not do:
 *
 *   1. **It does not call a language model.** `ask()` classifies
 *      deterministically and answers from computed domain outputs. The same
 *      question against the same position returns the same words, offline.
 *   2. **It does not hold the position without the right to.** The profile is
 *      fetched only when the operator token is already in session storage, and
 *      a payload that fails schema validation is treated as no profile — half a
 *      position produces confidently wrong answers.
 */

const THREAD_KEY = "neoos.conversation";
const TOKEN_KEY = "neoos.operator-token";
/** Bounded so a long session cannot grow session storage without limit. */
const MAX_TURNS = 60;

interface ConversationState {
  thread: ConversationTurn[];
  profile: IntakeProfile | null;
  loading: boolean;
  /** True when no operator token is held, so nothing personal can be shown. */
  locked: boolean;
  skippedGaps: string[];
}

const serverState: ConversationState = {
  thread: [],
  profile: null,
  loading: false,
  locked: true,
  skippedGaps: [],
};

let clientState: ConversationState = serverState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<ConversationState>): void {
  clientState = { ...clientState, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------------- storage ---------------- */

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Blocked storage degrades to "nothing stored" rather than throwing. Losing
    // history is a nuisance; failing to render the home screen is a defect.
    return null;
  }
}

function writeThread(thread: ConversationTurn[]): void {
  try {
    window.sessionStorage.setItem(THREAD_KEY, JSON.stringify(thread.slice(-MAX_TURNS)));
  } catch {
    // Memory-only for this session. The conversation still works.
  }
}

function readThread(): ConversationTurn[] {
  const raw = readSession(THREAD_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConversationTurn[]) : [];
  } catch {
    return [];
  }
}

/**
 * Load the position, if the operator has already unlocked it.
 *
 * Fired once at module init rather than from an effect. The token is read, not
 * requested: this store never prompts for it, because the intake surface owns
 * that interaction and duplicating it would mean two places that can ask for
 * the key to everything.
 */
function loadProfile(): void {
  const token = readSession(TOKEN_KEY);
  if (!token) {
    setState({ locked: true });
    return;
  }

  setState({ locked: false, loading: true });
  void fetch("/api/intake", { headers: { Authorization: `Bearer ${token}` } })
    .then(async (response) => {
      if (!response.ok) return null;
      const body: unknown = await response.json();
      const candidate = (body as { profile?: unknown } | null)?.profile ?? body;
      const parsed = intakeProfileSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    })
    .catch(() => null)
    .then((profile) => setState({ profile, loading: false }));
}

if (typeof window !== "undefined") {
  clientState = { ...serverState, thread: readThread() };
  loadProfile();
}

/** Test-only: reset the module singleton between cases. */
export function _resetConversationForTests(): void {
  clientState = { ...serverState };
  emit();
}

/* ---------------- context ---------------- */

export interface ConversationContextValue extends ConversationState {
  calculations: ProfileCalculations | null;
  ask: (question: string, origin: string) => MorpheusAnswer;
  askIntent: (intent: MorpheusIntent, label: string, origin: string) => MorpheusAnswer;
  skipGap: (id: string) => void;
  clear: () => void;
  lastAnswer: MorpheusAnswer | null;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    () => clientState,
    () => serverState,
  );

  const calculations = useMemo(
    () => (state.profile === null ? null : calculateProfile(state.profile)),
    [state.profile],
  );

  const lastAnswer = useMemo(() => {
    for (let index = state.thread.length - 1; index >= 0; index -= 1) {
      const turn = state.thread[index];
      if (turn?.role === "morpheus" && turn.answer) return turn.answer;
    }
    return null;
  }, [state.thread]);

  const run = useCallback(
    (intent: MorpheusIntent, text: string, origin: string): MorpheusAnswer => {
      const context: AnswerContext = {
        calculations,
        // No profile means the visible cockpit is the worked example, and every
        // answer must say so rather than describe it as the user's position.
        isDemo: clientState.profile === null,
        lastIntent: lastAnswer?.intent ?? null,
        lastAnswer,
      };
      const result = respond(intent, text, context);
      const at = new Date().toISOString();
      const suffix = clientState.thread.length;
      const thread = [
        ...clientState.thread,
        { id: `${at}-${suffix}-q`, role: "user" as const, text, answer: null, at, origin },
        {
          id: `${at}-${suffix}-a`,
          role: "morpheus" as const,
          text: result.conclusion,
          answer: result,
          at,
          origin,
        },
      ].slice(-MAX_TURNS);

      setState({ thread });
      if (typeof window !== "undefined") writeThread(thread);
      return result;
    },
    [calculations, lastAnswer],
  );

  const ask = useCallback(
    (question: string, origin: string) => run(classify(question), question, origin),
    [run],
  );

  const askIntent = useCallback(
    (intent: MorpheusIntent, label: string, origin: string) => run(intent, label, origin),
    [run],
  );

  const skipGap = useCallback((id: string) => {
    if (clientState.skippedGaps.includes(id)) return;
    setState({ skippedGaps: [...clientState.skippedGaps, id] });
  }, []);

  const clear = useCallback(() => {
    setState({ thread: [], skippedGaps: [] });
    if (typeof window !== "undefined") writeThread([]);
  }, []);

  const value = useMemo(
    () => ({ ...state, calculations, ask, askIntent, skipGap, clear, lastAnswer }),
    [state, calculations, ask, askIntent, skipGap, clear, lastAnswer],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationContextValue {
  const value = useContext(ConversationContext);
  if (!value) throw new Error("useConversation must be used inside ConversationProvider.");
  return value;
}
