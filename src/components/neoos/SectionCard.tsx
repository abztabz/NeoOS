import type { ReactNode } from "react";

export function SectionCard({
  title,
  meta,
  demoFallback = false,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  /** Section content fell back to demo data inside a non-demo report. */
  demoFallback?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h3 className="text-[13px] font-semibold tracking-[0.04em]">{title}</h3>
        <span className="flex items-center gap-2">
          {demoFallback ? (
            <span
              data-testid="section-demo-badge"
              className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber"
            >
              Demo content
            </span>
          ) : null}
          {meta ? <span className="microlabel">{meta}</span> : null}
        </span>
      </div>
      {children}
    </section>
  );
}
