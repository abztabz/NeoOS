import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Holdings drill-down — allocation, thesis status, key risks, and review triggers per position.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
