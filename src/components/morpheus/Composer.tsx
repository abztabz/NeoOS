"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useConversation } from "@/data/conversation-store";
import { suggestFor } from "@/domain/morpheus/intents";

/**
 * The persistent conversational input.
 *
 * Present on every surface, including the six workspaces, because a question
 * that occurs to somebody while looking at their gold position should be
 * askable there rather than requiring a trip home. The thread is shared, so the
 * answer arrives in the same conversation either way.
 *
 * On mobile it sits above the bottom navigation rather than replacing it: the
 * workspaces stay reachable, they simply stop being the first thing.
 */

export function Composer({ variant = "inline" }: { variant?: "inline" | "docked" }) {
  const pathname = usePathname();
  const { ask, calculations } = useConversation();
  const [text, setText] = useState("");

  const suggestions = suggestFor(pathname, calculations);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = text.trim();
    if (question.length === 0) return;
    ask(question, pathname);
    setText("");
  };

  return (
    <div
      data-testid="composer"
      // `min-w-0` on every level: a flex or grid child defaults to a minimum
      // width of its content, so a long suggestion chip would otherwise push
      // the whole page wider than the viewport at 320px rather than scrolling
      // inside its own row.
      className={`min-w-0 max-w-full ${
        variant === "docked"
          ? "sticky bottom-[calc(env(safe-area-inset-bottom)+62px)] z-20 rounded-2xl border border-[#27323b] bg-[#070a0c]/95 p-2.5 backdrop-blur md:bottom-4"
          : ""
      }`}
    >
      {suggestions.length > 0 ? (
        <ul
          data-testid="suggested-questions"
          className="mb-2 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.text} className="shrink-0">
              <button
                type="button"
                onClick={() => ask(suggestion.text, pathname)}
                title={suggestion.because}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-line px-3.5 text-[12px] text-[#a9b6c1] transition-colors hover:border-cyan/40 hover:text-cyan"
              >
                {suggestion.text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={submit} className="flex min-w-0 items-center gap-2">
        <label htmlFor="morpheus-input" className="sr-only">
          Ask Morpheus a question about your position
        </label>
        <input
          id="morpheus-input"
          data-testid="composer-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask about your position…"
          autoComplete="off"
          className="min-h-11 w-full min-w-0 flex-1 rounded-full border border-line bg-panel2 px-4 text-[14px] text-ink placeholder:text-muted focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/25"
        />
        <button
          type="submit"
          data-testid="composer-submit"
          disabled={text.trim().length === 0}
          className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-cyan to-green px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#071015] transition-opacity disabled:opacity-35"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
