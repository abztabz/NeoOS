"use client";

import { useEffect, useRef, useState } from "react";
import { useReport } from "@/data/report-store";
import { MAX_REPORT_BYTES, type NeoosReport } from "@/schemas/neoos-report";
import { providedSections } from "@/domain/report-view";
import { formatAsOf } from "@/lib/format";

interface Preview {
  text: string;
  report: NeoosReport;
  fileName: string;
  sourceVersion: "1.0" | "1.1" | "2.0";
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { source, storageStatus, previewReport, importReport, resetDemo } = useReport();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      setPreview(null);
      setApplied(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onFileSelected(file: File | undefined) {
    setError(null);
    setPreview(null);
    setApplied(false);
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) {
      setError("File is too large. NeoOS reports are under 1 MB.");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("Could not read the file. Try selecting it again.");
      return;
    }
    const result = previewReport(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview({
      text,
      report: result.report,
      fileName: file.name,
      sourceVersion: result.sourceVersion,
    });
  }

  function onApply() {
    if (!preview) return;
    const result = importReport(preview.text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApplied(true);
    setPreview(null);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="import-dialog-title"
      className="m-auto w-[min(92vw,520px)] rounded-3xl border border-line bg-panel p-0 text-ink"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="microlabel">Daily report</div>
            <h3 id="import-dialog-title" className="mt-1 text-lg font-bold">
              Import NeoOS JSON
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Select a schema v1.0 report. It is validated before anything changes — an invalid file
          never touches the current state.
        </p>

        <label className="mt-4 block">
          <span className="microlabel mb-2 block">Report file</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => onFileSelected(e.target.files?.[0])}
            className="block w-full cursor-pointer rounded-xl border border-line bg-panel2 p-3 text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-cyan/15 file:px-4 file:py-2.5 file:font-mono file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:text-cyan"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red/40 bg-red/10 p-3 text-xs leading-relaxed text-[#ffd0d0]"
          >
            {error} Your current report is untouched.
          </p>
        ) : null}

        {preview ? (
          <div className="mt-4 rounded-xl border border-cyan/30 bg-cyan/5 p-3.5">
            <div className="microlabel text-cyan">Preview — not applied yet</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted">File</dt>
              <dd className="truncate text-right">{preview.fileName}</dd>
              <dt className="text-muted">As of</dt>
              <dd className="text-right">{formatAsOf(preview.report.asOf)} UTC</dd>
              <dt className="text-muted">Mode</dt>
              <dd className="text-right uppercase">{preview.report.mode}</dd>
              <dt className="text-muted">Deployment</dt>
              <dd className="text-right">
                {Math.round(preview.report.deployment.score)}% ·{" "}
                {preview.report.deployment.recommendation}
              </dd>
              <dt className="text-muted">Schema</dt>
              <dd className="text-right">
                v{preview.sourceVersion}
                {preview.sourceVersion === "1.0" ? " → migrated to v1.1" : ""}
                {preview.sourceVersion === "2.0" ? " (engine report — full trace)" : ""}
              </dd>
              <dt className="text-muted">Radar items</dt>
              <dd className="text-right">{preview.report.radar.length}</dd>
              <dt className="text-muted">Assets</dt>
              <dd className="text-right">{preview.report.assets.length}</dd>
              <dt className="text-muted">Workspace sections</dt>
              <dd className="text-right">
                {providedSections(preview.report).length > 0
                  ? providedSections(preview.report).join(", ")
                  : "none — demo content fills the workspaces"}
              </dd>
            </dl>
            <button
              type="button"
              onClick={onApply}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan to-green px-5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#071015]"
            >
              Apply report
            </button>
          </div>
        ) : null}

        {applied ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-green/40 bg-green/10 p-3 text-xs text-[#bdfbd5]"
          >
            Report applied{storageStatus === "memory-only"
              ? " for this session. Browser storage is blocked, so it will not survive a refresh."
              : " and saved on this device."}
          </p>
        ) : null}

        {storageStatus === "memory-only" && !applied ? (
          <p className="mt-4 text-[11px] text-amber">
            Browser storage is blocked — imports work but last only for this session.
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <span className="microlabel">
            Current: {source === "demo" ? "Demo data" : "Imported report"}
          </span>
          <button
            type="button"
            onClick={() => {
              resetDemo();
              setApplied(false);
              setPreview(null);
              setError(null);
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-amber/40 bg-amber/10 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-amber transition-colors hover:bg-amber/20"
          >
            Reset to demo
          </button>
        </div>
      </div>
    </dialog>
  );
}
