"use client";

import Link from "next/link";
import { NO_ANALYSIS_YET } from "@/domain/portfolio/portfolio";

/**
 * The gauge, before there is anything to put in it.
 *
 * The Capital Deployment Gauge is the dominant hero component, and it stays
 * dominant when the answer is "not yet". Hiding it behind the report gate meant
 * that declaring a real position *removed* the flagship element from the
 * product — the opposite of the intended effect, and a blank where the most
 * important question should be.
 *
 * So the frame, the heading and the question all remain. What is withheld is
 * the number, because the only number available would be the worked example's,
 * and a fictional household's deployment score rendered against somebody's real
 * position is precisely the confusion this gate exists to prevent.
 *
 * An empty meter track is drawn rather than omitted. The shape of the answer is
 * visible, and its emptiness is the honest content.
 */
export function GaugeAwaiting() {
  return (
    <section
      aria-label="Capital Deployment Gauge"
      data-testid="gauge-awaiting"
      className="relative mb-3.5 overflow-hidden rounded-[28px] border border-[#293540] bg-gradient-to-br from-[#121920]/[0.98] to-[#0a0e12]/[0.98] p-5 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan/[0.06] via-transparent to-green/[0.04]" />
      <div className="microlabel mb-2 text-[11px] text-[#aab6c1]">Primary Decision</div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:gap-5">
        <div>
          <h2 className="text-2xl font-bold leading-[1.03] tracking-[-0.035em] sm:text-[28px]">
            Capital Deployment Gauge
          </h2>
          <div className="mt-2 text-xs text-[#d8e1e8]">
            Awaiting the first run against your position
          </div>
        </div>
        <div className="text-right">
          <div
            data-testid="deployment-score-awaiting"
            className="text-5xl font-extrabold leading-[0.9] tracking-[-0.07em] text-[#4a5560] sm:text-[58px]"
          >
            —
          </div>
          <div className="microlabel mt-2 text-[10px]">Not computed yet</div>
        </div>
      </div>

      <div className="mt-5">
        {/* Drawn empty rather than omitted: the shape of the answer is visible,
            and the emptiness is the content. */}
        <div
          className="gauge-hatch relative h-[18px] overflow-hidden rounded-[7px] border border-line-strong bg-[#1b232b] p-[3px]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          // Zero, with the text saying what zero means here. A meter without a
          // value is invalid ARIA; a meter reading 0% with no explanation would
          // be read as "deploy nothing", which is a recommendation NeoOS has
          // not made.
          aria-valuenow={0}
          aria-valuetext="Not computed yet"
          aria-label="Deployment intensity, not computed yet"
        />
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[#9aa7b3]">{NO_ANALYSIS_YET}</p>

      <Link
        href="/"
        className="mt-3 inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
      >
        Ask Morpheus what he can see
      </Link>
    </section>
  );
}
