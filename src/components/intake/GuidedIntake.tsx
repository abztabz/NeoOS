"use client";

import { useState, type FormEvent } from "react";
import {
  currentStep,
  GUIDED_STEPS,
  goBack,
  isComplete,
  recordAnswer,
  startSession,
  summarise,
  unansweredRequired,
  type GuidedSession,
} from "@/domain/intake/guided";

/**
 * Guided intake — one question, then the next.
 *
 * The screen holds a single question at all times. That is the entire design,
 * and everything else follows from it: the progress line is small and quiet,
 * "I don't know" sits next to the input rather than hidden behind it, and the
 * cost of skipping is stated under the question instead of being implied by a
 * red asterisk.
 *
 * Nothing is written until the summary is confirmed. A person reading back
 * eleven plain sentences catches their own mistakes; a person confirming a JSON
 * payload does not.
 */

export function GuidedIntake({
  onComplete,
  onSwitchToForm,
}: {
  onComplete: (session: GuidedSession) => void;
  onSwitchToForm: () => void;
}) {
  const [session, setSession] = useState<GuidedSession>(startSession);
  const [draft, setDraft] = useState("");

  const step = currentStep(session);
  const complete = isComplete(session);
  const missing = unansweredRequired(session);

  const submitAnswer = (event: FormEvent) => {
    event.preventDefault();
    if (!step) return;
    const value = draft.trim();
    setSession(recordAnswer(session, value.length > 0 ? value : null));
    setDraft("");
  };

  const answerUnknown = () => {
    if (!step) return;
    setSession(recordAnswer(session, null, true));
    setDraft("");
  };

  if (complete) {
    const lines = summarise(session);
    return (
      <section data-testid="guided-summary" className="grid gap-4">
        <header className="grid gap-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-cyan">Before I save this</p>
          <h2 className="text-[17px] font-semibold leading-snug text-ink">
            Here&apos;s what I took down. Have a read before I write any of it.
          </h2>
        </header>

        <ul className="grid gap-2">
          {lines.map((line) => (
            <li
              key={line.question}
              className={`rounded-xl border px-3 py-2.5 ${
                line.isGap ? "border-[#2a3540] bg-transparent" : "border-[#222d36] bg-panel2"
              }`}
            >
              <p className="text-[12px] leading-relaxed text-[#8f9daa]">{line.question}</p>
              <p
                className={`mt-1 text-[13px] font-medium ${line.isGap ? "text-muted italic" : "text-ink"}`}
              >
                {line.answer}
              </p>
            </li>
          ))}
        </ul>

        {missing.length > 0 ? (
          <p
            data-testid="guided-blocking"
            className="rounded-xl border border-amber/30 bg-amber/5 px-3 py-2.5 text-[12px] leading-relaxed text-[#ffe1c2]"
          >
            I still need {missing.length === 1 ? "one thing" : `${missing.length} things`} before I
            can save: {missing.map((s) => s.prompt.toLowerCase().replace(/\?$/, "")).join("; ")}.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="guided-confirm"
            disabled={missing.length > 0}
            onClick={() => onComplete(session)}
            className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-cyan to-green px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#071015] disabled:opacity-35"
          >
            That&apos;s right — save it
          </button>
          <button
            type="button"
            onClick={() => setSession(goBack(session))}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] hover:border-line-strong hover:text-ink"
          >
            Change something
          </button>
          <button
            type="button"
            onClick={onSwitchToForm}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] hover:border-line-strong hover:text-ink"
          >
            Finish in the form
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          Anything you weren&apos;t sure about stays empty rather than being guessed at. Holdings,
          debts and dependants are recorded in the form, where each one can be entered precisely —
          I won&apos;t split an estimate into holdings you never stated.
        </p>
      </section>
    );
  }

  if (!step) return null;

  return (
    <section data-testid="guided-intake" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
          {session.cursor + 1} of {GUIDED_STEPS.length}
        </p>
        <button
          type="button"
          onClick={onSwitchToForm}
          data-testid="switch-to-form"
          className="font-mono text-[9px] uppercase tracking-wider text-[#8896a1] transition-colors hover:text-ink"
        >
          Use the form instead
        </button>
      </div>

      <div
        aria-hidden="true"
        className="h-0.5 w-full overflow-hidden rounded-full bg-[#1a2229]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan to-green transition-[width] duration-300"
          style={{ width: `${(session.cursor / GUIDED_STEPS.length) * 100}%` }}
        />
      </div>

      <div className="grid gap-2">
        <h2 data-testid="guided-question" className="text-[19px] font-semibold leading-snug text-ink">
          {step.prompt}
        </h2>
        <p className="text-[13px] leading-relaxed text-[#a9b6c1]">{step.why}</p>
      </div>

      <form onSubmit={submitAnswer} className="grid gap-2.5">
        <label htmlFor="guided-answer" className="sr-only">
          {step.prompt}
        </label>
        {step.kind === "choice" && step.options ? (
          <div className="flex flex-wrap gap-2">
            {step.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSession(recordAnswer(session, option.value));
                  setDraft("");
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[13px] text-[#a9b6c1] transition-colors hover:border-cyan/40 hover:text-cyan"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <input
            id="guided-answer"
            data-testid="guided-answer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={step.placeholder ?? "Your answer"}
            autoComplete="off"
            className="min-h-11 rounded-xl border border-line bg-panel2 px-3.5 text-[15px] text-ink placeholder:text-muted focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/25"
          />
        )}

        <div className="flex flex-wrap gap-2">
          {step.kind !== "choice" ? (
            <button
              type="submit"
              data-testid="guided-next"
              disabled={draft.trim().length === 0}
              className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-cyan to-green px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#071015] disabled:opacity-35"
            >
              Next
            </button>
          ) : null}
          <button
            type="button"
            data-testid="guided-unknown"
            onClick={answerUnknown}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] hover:border-line-strong hover:text-ink"
          >
            I don&apos;t know
          </button>
          {session.cursor > 0 ? (
            <button
              type="button"
              onClick={() => setSession(goBack(session))}
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] hover:border-line-strong hover:text-ink"
            >
              Back
            </button>
          ) : null}
        </div>
      </form>

      <p className="text-[11px] leading-relaxed text-muted">
        {step.optional ? "You can skip this. " : "I need this one. "}
        {step.ifSkipped}
      </p>
    </section>
  );
}
