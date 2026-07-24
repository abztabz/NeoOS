import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ReportProvider } from "@/data/report-store";
import { AppHeader } from "@/components/neoos/AppHeader";
import { DesktopNav, MobileNav } from "@/components/neoos/WorkspaceNav";

export const metadata: Metadata = {
  title: "NeoOS CIO",
  description:
    "Capital Allocation Operating System — should capital be deployed today, and how aggressively?",
  applicationName: "NeoOS CIO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NeoOS CIO",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050607",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden">
        <ReportProvider>
          <div className="mx-auto max-w-[1320px] px-4 pt-4 pb-24 md:pb-10">
            <AppHeader />
            <DesktopNav />
            <main>{children}</main>
            <footer className="mt-8 px-0.5 text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-[#61707d]">
              NeoOS Investment Constitution v1.0 · Demonstration data only · Not financial advice
            </footer>
          </div>
          <MobileNav />
        </ReportProvider>
      </body>
    </html>
  );
}
