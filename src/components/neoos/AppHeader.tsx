"use client";

import { useState } from "react";
import { useReport } from "@/data/report-store";
import { formatAsOf } from "@/lib/format";
import { ImportDialog } from "@/components/neoos/ImportDialog";

export function AppHeader() {
  const { report, source, storageStatus } = useReport();
  const [importOpen, setImportOpen] = useState(false);

  const demo = report.mode === "demo";

  return (
    <header className="mb-4 flex items-center justify-between gap-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-[42px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#dff8ff] via-cyan to-green font-black text-[#071015] shadow-[0_0_30px_rgba(84,214,255,.24)]"
        >
          N
        </div>
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold leading-tight tracking-[0.02em]">NeoOS CIO</h1>
          <p className="microlabel mt-0.5 hidden text-[11px] sm:block">
            Capital Allocation Operating System
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          data-testid="mode-badge"
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-wider ${
            demo ? "border-amber/40 text-amber" : "border-cyan/40 text-cyan"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${demo ? "bg-amber shadow-[0_0_14px_rgba(242,181,107,.7)]" : "bg-cyan shadow-[0_0_14px_rgba(84,214,255,.7)]"}`}
          />
          <span className="hidden sm:inline">
            {demo ? "Demo data" : `${source === "imported" ? "Imported" : "Live"} · ${formatAsOf(report.asOf)}`}
          </span>
          <span className="sm:hidden">{demo ? "Demo" : "Live"}</span>
        </span>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink"
        >
          Data
        </button>
      </div>

      {storageStatus === "memory-only" ? (
        <span className="sr-only" role="status">
          Browser storage is blocked; imported reports last only for this session.
        </span>
      ) : null}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </header>
  );
}
