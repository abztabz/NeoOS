"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnswerBlock } from "@/components/morpheus/Answer";
import { Composer } from "@/components/morpheus/Composer";
import { useConversation } from "@/data/conversation-store";

/**
 * Conversation inside a workspace.
 *
 * A workspace is where somebody goes to look at detail, and looking at detail
 * is exactly when a question occurs to them. Requiring a trip back to the home
 * screen to ask it would make the conversation a destination rather than a
 * medium.
 *
 * Only the turns raised *from this workspace* are shown, so the Gold page does
 * not replay a conversation about the reserve. The full thread stays intact and
 * stays on the home screen — this is a view of it, not a second copy.
 */

/** Routes that get the strip. The home screen has its own, fuller conversation. */
const WORKSPACES = ["/capital", "/markets", "/portfolio", "/gold", "/cash", "/timeline"];

export function WorkspaceThread() {
  const pathname = usePathname();
  const { thread } = useConversation();

  // Rendered once from the layout rather than per page. Placing it inside each
  // workspace made it a grid item in that page's own layout grid, which put it
  // in a column it was never meant to share.
  if (!WORKSPACES.includes(pathname)) return null;

  const local = thread.filter((turn) => turn.origin === pathname);

  return (
    <section
      data-testid="workspace-thread"
      aria-label="Ask Morpheus about this"
      className="mt-4 grid min-w-0 max-w-full gap-3 rounded-2xl border border-[#222d36] bg-panel2 p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-wider text-cyan">Ask Morpheus</p>
        {local.length > 0 ? (
          <Link
            href="/"
            className="font-mono text-[9px] uppercase tracking-wider text-[#8896a1] transition-colors hover:text-ink"
          >
            Full conversation
          </Link>
        ) : null}
      </div>

      {local.map((turn) =>
        turn.role === "user" ? (
          <p
            key={turn.id}
            data-testid="thread-question"
            className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-cyan/25 bg-cyan/[0.06] px-3.5 py-2.5 text-[13px] text-[#c8f3ff]"
          >
            {turn.text}
          </p>
        ) : turn.answer ? (
          <div key={turn.id} className="max-w-[95%]">
            <AnswerBlock answer={turn.answer} />
          </div>
        ) : null,
      )}

      <Composer />
    </section>
  );
}
