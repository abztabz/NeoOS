"use client";

import Link from "next/link";
import { setExploringDemo } from "@/data/portfolio-mode";

/**
 * The first screen, before anything is declared.
 *
 * It exists to stop the product opening with somebody else's holdings. NeoOS
 * previously loaded a fixture universe by default, so a new arrival's first
 * impression was Apple, an S&P tracker and a developed-market ETF sitting under
 * the word "PORTFOLIO" — content they might reasonably read as a starting
 * position rather than an illustration.
 *
 * Two doors, and the difference between them stated rather than implied. The
 * demo is offered plainly because a worked example is genuinely the fastest way
 * to see how NeoOS reasons; it is offered as a second choice, once, and it
 * disappears the moment a real position exists.
 */

export function FirstRun({ locked = false }: { locked?: boolean }) {
  return (
    <section
      data-testid="first-run"
      aria-label="Getting started"
      className="mx-auto grid max-w-[560px] gap-4 pb-4"
    >
      <header className="grid gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">Morpheus</p>
        <h1 className="text-[20px] font-semibold leading-snug text-ink">
          I can&apos;t advise you on money I can&apos;t see.
        </h1>
        <p className="text-[14px] leading-relaxed text-[#a9b6c1]">
          {locked
            ? // A locked deployment cannot tell whether a position exists, and it
              // must not resolve that ambiguity by showing a fixture.
              "Your position is held behind the operator token, so I can't tell from here whether you have declared one. Unlock it and I'll pick up wherever you left off."
            : "Tell me what you hold and what you owe, and I'll tell you whether today is a day to deploy capital. Until then, anything I showed you would be about somebody else."}
        </p>
      </header>

      <Link
        href="/intake"
        data-testid="create-portfolio"
        className="flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan to-green px-5 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-[#071015]"
      >
        {locked ? "Unlock my position" : "Create my portfolio"}
      </Link>

      <div className="rounded-2xl border border-[#222d36] bg-panel2 p-4">
        <p className="text-[13px] font-semibold text-ink">Want to see how it reasons first?</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#9aa7b3]">
          The worked example runs the whole system on an invented household. Every holding in it is
          fictional, and none of it is a suggestion about what you should own.
        </p>
        <button
          type="button"
          data-testid="explore-demo"
          onClick={() => setExploringDemo(true)}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-amber/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-amber transition-colors hover:bg-amber/10"
        >
          Explore the worked example
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Your position stays on your own deployment. NeoOS holds it append-only, so nothing you
        declare is silently overwritten.
      </p>
    </section>
  );
}
