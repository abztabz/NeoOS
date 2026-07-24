import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cash",
  description: "Cash operating system — reserves, deployable capital, cash score, and liquidity posture.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
