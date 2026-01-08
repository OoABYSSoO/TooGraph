import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LayoutShell } from "@/components/layout-shell";
import { LanguageProvider } from "@/components/providers/language-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "GraphiteUI",
  description: "Visual node-based editor and runtime workspace for LangGraph workflows.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(154,52,18,0.08),transparent_28%),linear-gradient(180deg,#f8f4ec_0%,#efe7d8_100%)] text-[var(--text)] antialiased">
        <LanguageProvider>
          <LayoutShell>{children}</LayoutShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
