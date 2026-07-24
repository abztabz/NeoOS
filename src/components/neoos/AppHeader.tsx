"use client";

import { useState } from "react";
import { useReport } from "@/data/report-store";
import { ImportDialog } from "@/components/neoos/ImportDialog";
import { DataStateBadge } from "@/components/neoos/DataStateBadge";

export function AppHeader() {
  const { storageStatus } = useReport();
  const [importOpen, setImportOpen] = useState(false);

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
        <DataStateBadge />
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
