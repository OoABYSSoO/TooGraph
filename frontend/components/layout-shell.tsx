"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/providers/language-provider";

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/workspace", label: t("nav.workspace") },
    { href: "/editor/demo-graph", label: t("nav.editor") },
    { href: "/runs", label: t("nav.runs") },
    { href: "/knowledge", label: t("nav.knowledge") },
    { href: "/memories", label: t("nav.memories") },
    { href: "/settings", label: t("nav.settings") },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          GraphiteUI
        </Link>
        <div className="brand-note">{t("layout.note")}</div>
        <label className="language-switcher">
          <span>{t("lang.label")}</span>
          <select
            className="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as "zh" | "en")}
          >
            <option value="zh">{t("lang.zh")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
        </label>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
