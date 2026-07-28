"use client";

import Link from "next/link";
import { useConversation } from "@/data/conversation-store";
import { gapUnlocks, nextGap, openGapCount } from "@/domain/morpheus/gaps";
import { list } from "@/domain/morpheus/voice";

/**
 * One question. Not a checklist.
 *
 * This is the component the "one high-value question at a time" rule lives in,
 * and its most important property is what it does not render: the other eight
 * gaps. They exist, they are counted, and they are not shown, because a person
 * confronted with everything they have not done answers none of it.
 *
 * Skipping is a first-class action rather than a hidden escape. The cost of
 * skipping is stated plainly and without pressure — a guided flow that guilts
 * somebody into an answer gets a careless answer, which is worse than no answer
 * because it looks like a fact.
 */

export function GapPrompt() {
  const { profile, calculations, skippedGaps, skipGap } = useConversation();
  const gap = nextGap(profile, calculations, skippedGaps);
  if (!gap) return null;

  const remaining = openGapCount(profile, calculations);
  const unlocks = gapUnlocks(gap, calculations);

  return (
    <section
      data-testid="gap-prompt"
      data-gap-id={gap.id}
      aria-label="One thing that would help"
      className="rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-4"
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-cyan">
        One thing that would help
      </p>

      <p data-testid="gap-question" className="mt-2 text-[15px] font-semibold leading-snug text-ink">
        {gap.question}
      </p>

      <p className="mt-1.5 text-[12px] leading-relaxed text-[#a9b6c1]">{gap.why}</p>

      {unlocks.length > 0 ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#8f9daa]">
          Answering it would let me tell you {list(unlocks)}.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href="/intake"
          data-testid="gap-answer"
          className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-cyan to-green px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#071015]"
        >
          Answer this
        </Link>
        <button
          type="button"
          onClick={() => skipGap(gap.id)}
          data-testid="gap-skip"
          className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink"
        >
          Not now
        </button>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
        {gap.ifSkipped}
        {remaining > 1 ? ` There ${remaining - 1 === 1 ? "is" : "are"} ${remaining - 1} other ${remaining - 1 === 1 ? "thing" : "things"} I'd like to know, and I'll ask about them one at a time.` : ""}
      </p>
    </section>
  );
}
