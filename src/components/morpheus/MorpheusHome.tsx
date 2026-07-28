"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AnswerBlock } from "@/components/morpheus/Answer";
import { Composer } from "@/components/morpheus/Composer";
import { GapPrompt } from "@/components/morpheus/GapPrompt";
import { FirstRun } from "@/components/morpheus/FirstRun";
import { useActivePortfolio } from "@/data/portfolio-mode";
import { useConversation } from "@/data/conversation-store";
import { buildBriefing, briefingLimits } from "@/domain/morpheus/briefing";
import { assessPersonalisation } from "@/domain/profile/personalisation";

/**
 * The home screen.
 *
 * Morpheus leads. Workspaces support. Evidence remains inspectable.
 *
 * What is deliberately absent from the opening view: the score grid, the action
 * board, the radar table, every status code, and the full gap list. All of it
 * still exists — it moved to `/capital` and to the other five workspaces, one
 * tap away — but none of it opens the product. A screen that opens with eleven
 * metrics has not decided what matters and has handed that job back to the
 * reader, which is the job they came here to delegate.
 *
 * What is present: a greeting appropriate to what is actually known, the two
 * answers, the largest risk, one suggested action, one question, and a place to
 * type. The five-second test is met by the first sentence rather than by the
 * layout.
 */

export function MorpheusHome() {
  const { profile, calculations, thread, loading, locked, lastAnswer } = useConversation();
  const active = useActivePortfolio();

  const briefing = useMemo(() => {
    const personalisation =
      profile && calculations ? assessPersonalisation(profile, calculations).state : "unavailable";
    return buildBriefing({
      context: { calculations, isDemo: profile === null, lastIntent: null, lastAnswer: null },
      personalisation,
      hasProfile: profile !== null,
      // Read once per render rather than ticking. The greeting is not a clock,
      // and re-rendering the home screen every minute to change one word would
      // be motion for its own sake.
      hour: new Date().getHours(),
    });
  }, [profile, calculations]);

  const limits = useMemo(
    () => briefingLimits({ calculations, isDemo: profile === null, lastIntent: null, lastAnswer }),
    [calculations, profile, lastAnswer],
  );

  // Only turns raised after the briefing are shown here; the briefing itself is
  // rendered above rather than duplicated into the thread.
  const conversation = thread;

  /*
    Before anything is declared and before the demo is opened, the briefing
    below would be the worked example's briefing. Showing it unasked is how a
    fictional household's posture becomes the first thing somebody reads about
    their own money.

    Locked counts here too. A locked deployment cannot tell whether a position
    exists, and "cannot tell" is not grounds for opening with a fixture — it is
    grounds for asking. FirstRun says so in the locked case.
  */
  if (!loading && profile === null && !active.demoVisible) {
    return <FirstRun locked={locked} />;
  }

  return (
    <div className="mx-auto grid max-w-[760px] gap-4 pb-4">
      <header className="grid gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">Morpheus</p>
        <h1 data-testid="morpheus-greeting" className="text-[15px] leading-relaxed text-[#a9b6c1]">
          {briefing.greeting}
        </h1>
      </header>

      {loading ? (
        <p data-testid="morpheus-loading" className="text-[13px] text-[#8f9daa]">
          Reading your position…
        </p>
      ) : null}

      {locked ? (
        <section
          data-testid="morpheus-locked"
          className="rounded-2xl border border-line bg-panel2 p-4"
        >
          <p className="text-[15px] font-semibold leading-snug text-ink">
            I can&apos;t see your position from here.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#a9b6c1]">
            Your position is held behind the operator token, so nothing personal shows until you
            unlock it. What you see below is the worked example — it demonstrates how I reason and
            says nothing about your money.
          </p>
          <Link
            href="/intake"
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
          >
            Unlock my position
          </Link>
        </section>
      ) : null}

      {/* Answer one: how hard to press. The dominant element on the screen. */}
      <section
        data-testid="briefing-posture"
        aria-label="Should capital be deployed today"
        className="rounded-2xl border border-[#27323b] bg-panel p-4 sm:p-5"
      >
        <AnswerBlock answer={briefing.posture} />
      </section>

      {/* Answer two: the largest unaddressed risk. */}
      <section
        data-testid="briefing-risk"
        aria-label="Largest unaddressed risk"
        className="rounded-2xl border border-[#222d36] bg-panel2 p-4"
      >
        <p className="mb-2 font-mono text-[9px] uppercase tracking-wider text-muted">
          Largest unaddressed risk
        </p>
        <AnswerBlock answer={briefing.risk} />
      </section>

      <section
        data-testid="briefing-changed"
        aria-label="What materially changed"
        className="rounded-2xl border border-[#222d36] bg-panel2 p-4"
      >
        <p className="mb-2 font-mono text-[9px] uppercase tracking-wider text-muted">
          What changed
        </p>
        <AnswerBlock answer={briefing.changed} />
      </section>

      {briefing.nextAction ? (
        <p
          data-testid="briefing-next-action"
          className="rounded-2xl border border-green/25 bg-green/5 px-4 py-3 text-[14px] leading-relaxed text-[#bdfbd5]"
        >
          <span className="font-mono text-[9px] uppercase tracking-wider text-green">
            If you do one thing
          </span>
          <br />
          {briefing.nextAction}
        </p>
      ) : null}

      <GapPrompt />

      {conversation.length > 0 ? (
        <section data-testid="conversation-thread" aria-label="Conversation" className="grid gap-3">
          {conversation.map((turn) =>
            turn.role === "user" ? (
              <p
                key={turn.id}
                data-testid="thread-question"
                className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-cyan/25 bg-cyan/[0.06] px-3.5 py-2.5 text-[13px] text-[#c8f3ff]"
              >
                {turn.text}
              </p>
            ) : turn.answer ? (
              <div
                key={turn.id}
                className="max-w-[95%] rounded-2xl rounded-bl-sm border border-[#222d36] bg-panel2 p-4"
              >
                <AnswerBlock answer={turn.answer} />
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      {limits ? (
        <p data-testid="briefing-limits" className="text-[12px] leading-relaxed text-muted">
          {limits}
        </p>
      ) : null}

      <Composer variant="docked" />

      <nav aria-label="Supporting workspaces" className="grid gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
          The detail, if you want it
        </p>
        <ul className="flex flex-wrap gap-2">
          {[
            { href: "/capital", label: "Capital" },
            { href: "/markets", label: "Markets" },
            { href: "/portfolio", label: "Portfolio" },
            { href: "/gold", label: "Gold" },
            { href: "/cash", label: "Cash" },
            { href: "/timeline", label: "Timeline" },
          ].map((workspace) => (
            <li key={workspace.href}>
              <Link
                href={workspace.href}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink"
              >
                {workspace.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
