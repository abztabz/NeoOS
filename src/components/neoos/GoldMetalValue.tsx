"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { goldStatusLabels, type GoldStatus } from "@/domain/gold/metal-value";
import type { GoldMetalValueBoard } from "@/server/gold/metal-value-service";
import { formatAsOf, formatCurrency } from "@/lib/format";

/**
 * What the metal in this household's gold is worth.
 *
 * The headline is AED per gram by purity, because that is the unit somebody
 * holding gold in the UAE actually thinks in. XAU/USD sits underneath as the
 * derivation, not the answer.
 *
 * The word "value" is doing deliberate work throughout. This is not a shop
 * rate, and the explanation says so in full rather than in a footnote — the gap
 * between metal value and what a jeweller pays is large enough that reading one
 * as the other would materially overstate what this household could realise.
 *
 * Status is never decoration. A delayed or stale figure is shown *with its
 * age*, because the alternative — hiding it, or quietly calling it live — is
 * how somebody acts on a number that stopped being true hours ago.
 */

const STATUS_TONE: Record<GoldStatus, string> = {
  live: "border-green/40 text-green",
  delayed: "border-cyan/40 text-cyan",
  stale: "border-amber/40 text-amber",
  unavailable: "border-red/40 text-red",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; board: GoldMetalValueBoard }
  | { status: "error"; message: string };

export function GoldMetalValue() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gold/metal-value", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Gold value unavailable (${response.status}).`);
        return response.json() as Promise<GoldMetalValueBoard>;
      })
      .then((board) => {
        if (!cancelled) setState({ status: "ready", board });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Gold value unavailable.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard title="GOLD METAL VALUE" meta="AED PER GRAM">
      {state.status === "loading" ? (
        <p className="text-xs text-muted">Checking the metal price…</p>
      ) : state.status === "error" ? (
        <p data-testid="gold-metal-unavailable" className="text-[11px] leading-relaxed text-amber">
          {state.message}
        </p>
      ) : state.board.available && state.board.values ? (
        <Available board={state.board} />
      ) : (
        <p
          data-testid="gold-metal-unavailable"
          className="rounded-lg border border-amber/30 bg-amber/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber"
        >
          {state.board.unavailableReason}
        </p>
      )}

      <p className="mt-3 border-t border-[#222d36] pt-2.5 text-[10px] leading-relaxed text-faint">
        {state.status === "ready"
          ? state.board.explanation
          : "Market-linked gold value converted from live XAU/USD into AED per gram."}
      </p>
    </SectionCard>
  );
}

function Available({ board }: { board: GoldMetalValueBoard }) {
  const values = board.values!;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          data-testid="gold-status"
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_TONE[board.status]}`}
        >
          {goldStatusLabels[board.status]}
        </span>
        {board.fromCache ? (
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Cached</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Karat
          testId="gold-metal-24k"
          label="24K Gold Metal Value"
          aedPerGram={values.aedPerGram24K}
        />
        <Karat
          testId="gold-metal-22k"
          label="22K Gold Metal Value"
          aedPerGram={values.aedPerGram22K}
        />
      </div>

      {board.status === "stale" ? (
        <p className="mt-2.5 rounded-lg border border-amber/30 bg-amber/[0.07] px-2.5 py-2 text-[10px] leading-snug text-amber">
          This figure is over six hours old. Treat it as a rough guide until it refreshes.
        </p>
      ) : null}

      {board.lastError ? (
        <p className="mt-2.5 text-[10px] leading-snug text-amber">
          Last refresh failed, so the figure above is the last one verified.
        </p>
      ) : null}

      <dl className="mt-3 grid gap-1.5 border-t border-[#222d36] pt-2.5 text-[10px]">
        <Row label="Source" value={board.sourceName} />
        <Row
          label="Source updated"
          value={board.sourceUpdatedAt ? formatAsOf(board.sourceUpdatedAt) : "—"}
        />
        <Row
          label="NeoOS retrieved"
          value={board.retrievedAt ? formatAsOf(board.retrievedAt) : "—"}
        />
        <Row
          label="Underlying"
          value={`${formatCurrency(values.inputs.xauUsdPerTroyOunce, "USD", 2)} / troy oz (XAU/USD)`}
        />
        <Row
          label="USD/AED"
          value={`${values.inputs.usdAed.toFixed(4)} · documented peg`}
        />
        <Row label="Calculation" value={values.calculationVersion} />
      </dl>

      <p className="mt-2.5 text-[10px] leading-relaxed text-faint">{board.resaleCaveat}</p>
    </div>
  );
}

function Karat({
  testId,
  label,
  aedPerGram,
}: {
  testId: string;
  label: string;
  aedPerGram: number;
}) {
  return (
    <div data-testid={testId} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
      <span className="block font-mono text-[9px] uppercase tracking-wider text-faint">{label}</span>
      <strong className="mt-0.5 block text-[22px] font-extrabold tracking-[-0.03em]">
        {formatCurrency(aedPerGram, "AED", 2)}
      </strong>
      <span className="block text-[10px] text-[#8e9aa5]">per gram</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate text-right text-[#c3ccd4]">{value}</dd>
    </div>
  );
}
