"use client";

import { useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";

/**
 * Entering today's gold rate by hand.
 *
 * This exists because the alternative is nothing. The LBMA reference restricts
 * automated redistribution, no free spot source has terms NeoOS can confirm,
 * and scraping a rendered page is out. So the operator reads the rate off a
 * board they trust, says where they read it, and NeoOS carries that citation
 * everywhere the number appears.
 *
 * The form asks for the citation and the date as required fields rather than
 * optional ones. A price with neither is a rumour, and a rumour that renders
 * in the same font as a quote is worse than a blank.
 *
 * "Did you check this against the primary source?" defaults to **no**, and no
 * is a perfectly good answer that gets displayed rather than corrected. A
 * default of yes would collect an assurance nobody actually gave.
 */

const TOKEN_KEY = "neoos.operator-token";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; expiresAt: string }
  | { kind: "error"; message: string };

function readToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoldRateEntry({ onSaved }: { onSaved?: () => void }) {
  const [price, setPrice] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceDocument, setSourceDocument] = useState("");
  const [observedDate, setObservedDate] = useState(todayLocalDate());
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const token = typeof window === "undefined" ? null : readToken();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setStatus({
        kind: "error",
        message: "Unlock your position first — this writes to your own record.",
      });
      return;
    }

    const amount = Number.parseFloat(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus({ kind: "error", message: "Enter the spot price in USD per troy ounce." });
      return;
    }

    setStatus({ kind: "saving" });
    try {
      const response = await fetch("/api/manual-observations", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pricePerTroyOunceUsd: amount,
          sourceName,
          sourceDocument,
          // Midday UTC on the stated day: the operator gave a date, not a time,
          // and pretending to a precision they did not supply would be a small
          // lie in a module about not telling them.
          observedAt: `${observedDate}T12:00:00.000Z`,
          verifiedAgainstPrimarySource: verified,
          enteredBy: "operator",
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          (body as { error?: string } | null)?.error ?? `Could not record that rate (${response.status}).`;
        setStatus({ kind: "error", message });
        return;
      }
      setStatus({
        kind: "saved",
        expiresAt: (body as { expiresAt?: string } | null)?.expiresAt ?? "",
      });
      setPrice("");
      onSaved?.();
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not reach the server.",
      });
    }
  }

  return (
    <SectionCard title="ENTER TODAY'S GOLD RATE" meta="MANUAL EVIDENCE">
      <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
        No free spot source has terms NeoOS can verify, so the rate comes from you. It will value
        your gold and stays labelled as entered rather than retrieved — which means it cannot issue
        a Buy, only tell you what you hold.
      </p>

      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
            Spot price · USD per troy ounce
          </span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="2400.00"
            required
            className="min-h-11 rounded-xl border border-[#222d36] bg-panel2 px-3 text-[13px] text-ink"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
            Who published it
          </span>
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Dubai Jewellery Group"
            required
            minLength={2}
            className="min-h-11 rounded-xl border border-[#222d36] bg-panel2 px-3 text-[13px] text-ink"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
            Where you read it
          </span>
          <input
            value={sourceDocument}
            onChange={(e) => setSourceDocument(e.target.value)}
            placeholder="Daily rate board, or a link"
            required
            minLength={3}
            className="min-h-11 rounded-xl border border-[#222d36] bg-panel2 px-3 text-[13px] text-ink"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
            When it was true
          </span>
          <input
            type="date"
            value={observedDate}
            onChange={(e) => setObservedDate(e.target.value)}
            required
            className="min-h-11 rounded-xl border border-[#222d36] bg-panel2 px-3 text-[13px] text-ink"
          />
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            className="mt-1 size-4 shrink-0"
          />
          <span className="text-[11px] leading-relaxed text-[#9aa7b3]">
            I checked this against the primary source. Leaving it unticked is a fine answer and is
            shown alongside the price.
          </span>
        </label>

        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-cyan to-green px-5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#071015] disabled:opacity-50"
        >
          {status.kind === "saving" ? "Recording…" : "Record this rate"}
        </button>
      </form>

      {status.kind === "error" ? (
        <p role="alert" className="mt-3 text-[11px] leading-relaxed text-amber">
          {status.message}
        </p>
      ) : null}

      {status.kind === "saved" ? (
        <p role="status" className="mt-3 text-[11px] leading-relaxed text-green">
          Recorded. It stays in force for a week
          {status.expiresAt ? `, until ${status.expiresAt.slice(0, 10)}` : ""} — gold moves enough
          that an older figure would misstate what you hold.
        </p>
      ) : null}
    </SectionCard>
  );
}
