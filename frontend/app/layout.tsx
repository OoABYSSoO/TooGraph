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
      <body>
        <LanguageProvider>
          <LayoutShell>{children}</LayoutShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
