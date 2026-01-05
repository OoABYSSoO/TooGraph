import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LayoutShell } from "@/components/layout-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "GraphiteUI",
  description: "Visual node-based editor and runtime workspace for LangGraph workflows.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
