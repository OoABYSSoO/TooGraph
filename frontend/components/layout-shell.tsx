"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/providers/language-provider";

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const isEditorRoute = pathname === "/editor" || pathname.startsWith("/editor/");
  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/workspace", label: t("nav.workspace") },
    { href: "/editor", label: t("nav.editor") },
    { href: "/runs", label: t("nav.runs") },
    { href: "/knowledge", label: t("nav.knowledge") },
    { href: "/memories", label: t("nav.memories") },
    { href: "/settings", label: t("nav.settings") },
  ];

  return (
    <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-r border-[var(--line)] bg-[rgba(255,250,241,0.88)] p-7 backdrop-blur-xl">
        <Link className="mb-1 block text-[1.4rem] font-bold tracking-[0.04em]" href="/">
          GraphiteUI
        </Link>
        <div className="mb-7 text-[0.92rem] leading-[1.5] text-[var(--muted)]">{t("layout.note")}</div>
        <label className="mb-[18px] grid gap-1.5 text-[0.9rem] text-[var(--muted)]">
          <span>{t("lang.label")}</span>
          <select
            className="rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-2.5 text-[var(--text)]"
            value={language}
            onChange={(event) => setLanguage(event.target.value as "zh" | "en")}
          >
            <option value="zh">{t("lang.zh")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
        </label>
        <nav aria-label="Main navigation" className="grid gap-2.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text)] data-[active=true]:bg-[var(--surface-strong)] data-[active=true]:text-[var(--text)]"
              data-active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className={isEditorRoute ? "min-h-screen overflow-hidden" : "p-8"}>{children}</main>
    </div>
  );
}
