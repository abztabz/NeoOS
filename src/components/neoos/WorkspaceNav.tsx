"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Capital" },
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/gold", label: "Gold" },
  { href: "/cash", label: "Cash" },
  { href: "/timeline", label: "Timeline" },
] as const;

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspaces" className="mb-4 hidden gap-2 md:flex">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 items-center rounded-full border px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors inline-flex ${
              active
                ? "border-transparent bg-gradient-to-r from-cyan to-green text-[#071015]"
                : "border-line text-[#8896a1] hover:border-line-strong hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Workspaces"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[#27323b] bg-[#070a0c]/[0.98] px-1 pt-1 pb-[max(env(safe-area-inset-bottom),4px)] md:hidden"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-center font-mono text-[9px] uppercase tracking-wide ${
              active ? "font-bold text-cyan" : "text-[#77848e]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-0.5 w-5 rounded-full ${active ? "bg-cyan" : "bg-transparent"}`}
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
