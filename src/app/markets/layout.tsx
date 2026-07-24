import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Markets",
  description: "Global market regime, regional opportunity heat map, and the ranked asset opportunity set.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
