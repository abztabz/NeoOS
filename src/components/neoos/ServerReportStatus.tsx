"use client";

import { useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import {
  assetLiveStateLabels,
  assetLiveStateTones,
  reportLiveStateLabels,
  type AssetLiveState,
  type ReportLiveState,
} from "@/server/types/live-state";
import { verificationStatusLabels, type VerificationStatus } from "@/server/types/report-envelope";

/**
 * Server report status.
 *
 * This component exists to make one thing impossible: mistaking the browser's
 * fixture cockpit for a live, verified, server-generated report. It states
 * which of the two you are looking at, how live it actually is per asset, and
 * whether its signature verifies.
 *
 * It imports only *types* and label maps from `@/server` — no runtime server
 * code and, critically, nothing that reads configuration. Everything it renders
 * comes from `/api/health` and `/api/report/latest`, which return presence
 * booleans and public key ids and never a credential.
 */

const TONE_CLASS: Record<"green" | "cyan" | "amber" | "red", string> = {
  green: "text-green",
  cyan: "text-cyan",
  amber: "text-amber",
  red: "text-red",
};

const REPORT_TONE: Record<ReportLiveState, "green" | "cyan" | "amber" | "red"> = {
  live_verified: "green",
  partial_live: "cyan",
  live_stale: "amber",
  manual_verified: "cyan",
  fixture: "amber",
  insufficient_evidence: "amber",
  failed: "red",
};

/** Verification outcomes that mean the numbers must not be treated as sound. */
const UNTRUSTWORTHY: VerificationStatus[] = ["signature_invalid", "content_modified", "key_unknown"];

interface HealthPayload {
  canRunLive: boolean;
  detail: string;
  missing: string[];
  signing: { configured: boolean; keyId: string };
  storage: { kind: string; durable: boolean; reachable: boolean; detail: string };
  providers: {
    providerId: string;
    providerName: string;
    mode: string;
    health: string;
    sourceTier: number;
    failureReason: string | null;
    legalNotes: string;
  }[];
}

interface LatestPayload {
  report: {
    content: {
      reportId: string;
      generatedAt: string;
      evidenceCutoff: string;
      liveState: ReportLiveState;
      executionContext: string;
      assetLiveStates: {
        assetId: string;
        state: AssetLiveState;
        reason: string;
        missingInputs: string[];
      }[];
    };
    signature: { keyId: string; signedAt: string } | null;
    verification: { status: VerificationStatus; detail: string };
  } | null;
  detail?: string;
}

export function ServerReportStatus() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [latest, setLatest] = useState<LatestPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const [h, l] = await Promise.all([fetch("/api/health"), fetch("/api/report/latest")]);
        if (cancelled) return;
        if (h.ok) setHealth((await h.json()) as HealthPayload);
        if (l.ok) setLatest((await l.json()) as LatestPayload);
      } catch {
        if (!cancelled) {
          // A status panel that cannot reach the server says so. Rendering
          // nothing would read as "no server issues", which is the opposite.
          setError("Could not reach the server status endpoints.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <SectionCard title="SERVER REPORT" meta="UNREACHABLE">
        <p className="text-[11px] leading-relaxed text-amber">{error}</p>
      </SectionCard>
    );
  }

  if (!health) return null;

  const report = latest?.report ?? null;
  const state = report?.content.liveState ?? null;
  const verification = report?.verification.status ?? null;
  const compromised = verification !== null && UNTRUSTWORTHY.includes(verification);

  return (
    <SectionCard
      title="SERVER REPORT"
      meta={state ? reportLiveStateLabels[state].toUpperCase() : "NONE STORED"}
    >
      {compromised ? (
        <p
          role="alert"
          data-testid="report-untrusted"
          className="mb-2.5 rounded-[10px] border border-red/40 bg-red/10 p-2.5 text-[11px] leading-relaxed text-red"
        >
          <strong>Do not act on these numbers.</strong> {report?.verification.detail}
        </p>
      ) : null}

      {report ? (
        <>
          <p className={`text-[12px] font-semibold ${TONE_CLASS[REPORT_TONE[report.content.liveState]]}`}>
            {reportLiveStateLabels[report.content.liveState]}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-faint">
            Report {report.content.reportId} · generated {report.content.generatedAt} · evidence cutoff{" "}
            {report.content.evidenceCutoff} · {report.content.executionContext}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            {verification ? verificationStatusLabels[verification] : "Not checked"}
            {report.signature ? ` · key ${report.signature.keyId}` : " · no signature"}
          </p>

          {report.content.assetLiveStates.length > 0 ? (
            <ul className="mt-2.5 grid gap-1.5" data-testid="asset-live-states">
              {report.content.assetLiveStates.map((asset) => (
                <li
                  key={asset.assetId}
                  className="rounded-[12px] border border-[#222d36] bg-panel2 p-2.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong className="text-[11px]">{asset.assetId}</strong>
                    <span className={`microlabel text-[8px] ${TONE_CLASS[assetLiveStateTones[asset.state]]}`}>
                      {assetLiveStateLabels[asset.state]}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-faint">{asset.reason}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-faint">
          {latest?.detail ??
            "No server-generated report has been stored. Everything shown elsewhere in this app is the browser cockpit and is labelled as such."}
        </p>
      )}

      <div className="mt-3 border-t border-[#1b242c] pt-2.5">
        <p className="text-[10px] leading-relaxed text-faint">{health.detail}</p>
        {health.missing.length > 0 ? (
          <ul className="mt-1.5 grid gap-0.5">
            {health.missing.map((item) => (
              <li key={item} className="text-[10px] text-amber">
                Not configured: {item}
              </li>
            ))}
          </ul>
        ) : null}
        {!health.storage.durable ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-amber">{health.storage.detail}</p>
        ) : null}
        {health.providers.length > 0 ? (
          <ul className="mt-2 grid gap-1">
            {health.providers.map((provider) => (
              <li key={provider.providerId} className="text-[10px] leading-snug text-faint">
                <span className="text-ink">{provider.providerName}</span> — tier {provider.sourceTier},{" "}
                {provider.mode}, {provider.health}
                {provider.failureReason ? ` · ${provider.failureReason}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionCard>
  );
}
