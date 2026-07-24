import type { ReactNode } from "react";

export function SectionCard({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h3 className="text-[13px] font-semibold tracking-[0.04em]">{title}</h3>
        {meta ? <span className="microlabel">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}
