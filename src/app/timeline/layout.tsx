import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Timeline",
  description: "Decision record — score changes, deployment changes, and the cash-score trend over time.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
