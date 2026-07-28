"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { IntakeForm } from "@/components/intake/IntakeForm";
import { GuidedIntake } from "@/components/intake/GuidedIntake";
import type { GuidedSession } from "@/domain/intake/guided";
import { toSubmission, type IntakeSubmission } from "@/domain/intake/submission";
import type { IntakeProfile } from "@/domain/intake/types";

/**
 * The intake surface.
 *
 * Reads and writes go through `/api/intake`, which requires the operator token —
 * this is the household's entire financial position, so it is not readable
 * without it either. The token is held in `sessionStorage` and never persisted:
 * it survives a page reload and does not survive closing the tab.
 *
 * Stated plainly because it matters: this is a shared secret typed into a
 * browser, not an account. Anyone holding the token has the position. It is the
 * same single-operator model the rest of NeoOS uses, and it is the right size
 * for one person's own tool — it is not what a client-facing deployment would
 * need. See docs/SECURITY.md.
 */

const TOKEN_KEY = "neoos.operator-token";

export default function IntakePage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [initial, setInitial] = useState<IntakeSubmission | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"form" | "guided">("form");
  const [guided, setGuided] = useState<GuidedSession | null>(null);

  const load = useCallback(async (operatorToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/intake", {
        headers: { authorization: `Bearer ${operatorToken}` },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setError("That token was not accepted.");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          remedy?: string | null;
        };
        // The remedy is shown with the fault rather than behind it. An operator
        // reading "the database rejected the request" needs the next step in the
        // same breath, not in a document they have to go and find.
        setError(
          [body.error ?? `Could not load the profile (${response.status}).`, body.remedy]
            .filter(Boolean)
            .join(" "),
        );
        return;
      }
      const body = (await response.json()) as { profile: IntakeProfile | null };
      setToken(operatorToken);
      setInitial(body.profile ? toSubmission(body.profile) : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // One async effect rather than a chain of synchronous ones. Reading the stored
  // token and fetching with it are a single operation, and splitting them across
  // renders only creates an intermediate state where the token is held but the
  // profile is not loaded.
  useEffect(() => {
    void (async () => {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) await load(stored);
      else setLoaded(true);
    })();
  }, [load]);

  const save = useCallback(
    async (draft: IntakeSubmission) => {
      if (!token) return;
      setSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/intake", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(draft),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? `Could not save (${response.status}).`);
          return;
        }
        setSavedAt(new Date().toISOString());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not reach the server.");
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  if (!loaded || loading) {
    return (
      <SectionCard title="YOUR POSITION" meta="LOADING">
        <p className="text-[12px] text-[#8896a1]">Loading…</p>
      </SectionCard>
    );
  }

  if (!token) {
    return (
      <SectionCard title="YOUR POSITION" meta="OPERATOR TOKEN REQUIRED">
        <p className="mb-3 text-[12px] leading-relaxed text-[#c6d0d8]">
          This page holds your entire financial position, so it is not readable without the operator
          token. The token is kept for this tab only and is never written to disk.
        </p>
        {error ? (
          <p data-testid="intake-error" role="alert" className="mb-3 text-[12px] text-[#e39ba5]">
            {error}
          </p>
        ) : null}
        <form
          className="grid gap-3 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = tokenInput.trim();
            if (!trimmed) return;
            sessionStorage.setItem(TOKEN_KEY, trimmed);
            void load(trimmed);
          }}
        >
          <label htmlFor="operator-token" className="text-[11px] font-semibold text-[#c6d0d8]">
            Operator token
          </label>
          <input
            id="operator-token"
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            className="min-h-11 rounded-lg border border-[#27323b] bg-[#0b1014] px-3 py-2 text-[13px] text-ink focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-gradient-to-r from-cyan to-green px-4 text-[13px] font-bold text-[#071015]"
          >
            Unlock
          </button>
        </form>
      </SectionCard>
    );
  }

  // Two doors, one schema. The guided flow is offered first to somebody with
  // nothing recorded, because a blank forty-field form is where people stop;
  // anyone with a position already loaded goes straight to the form, because
  // correcting one figure through eleven questions would be absurd.
  if (mode === "guided") {
    return (
      <div className="mx-auto max-w-[680px]">
        <GuidedIntake
          onSwitchToForm={() => setMode("form")}
          onComplete={(session) => {
            setGuided(session);
            setMode("form");
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {guided ? (
        <p
          data-testid="guided-handoff"
          className="rounded-xl border border-cyan/25 bg-cyan/[0.04] px-3.5 py-3 text-[12px] leading-relaxed text-[#c8f3ff]"
        >
          I&apos;ve carried across what you told me. Holdings, debts and dependants are below —
          those need entering row by row, because splitting an estimate into holdings you never
          stated is exactly the guess I won&apos;t make.
        </p>
      ) : null}

      {!guided && initial === null ? (
        <button
          type="button"
          data-testid="start-guided"
          onClick={() => setMode("guided")}
          className="inline-flex min-h-11 w-fit items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
        >
          Rather answer questions instead?
        </button>
      ) : null}

      <IntakeForm initial={initial} onSave={save} saving={saving} error={error} savedAt={savedAt} />
    </div>
  );
}
