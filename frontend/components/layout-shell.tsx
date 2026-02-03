"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/cn";

const SIDEBAR_STORAGE_KEY = "graphiteui:sidebar-collapsed";

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isEditorCanvasRoute = pathname === "/editor" || pathname.startsWith("/editor/");
  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/editor", label: t("nav.editor") },
  ];
  const systemItems = [
    { href: "/skills", label: t("nav.skills") },
    { href: "/runs", label: t("nav.runs") },
    { href: "/knowledge", label: t("nav.knowledge") },
    { href: "/settings", label: t("nav.settings") },
  ];

  const renderNavLink = (item: { href: string; label: string }) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group flex cursor-pointer items-center justify-between rounded-2xl border px-3.5 py-3 text-[0.95rem] transition-all duration-200 ease-out",
          isActive
            ? "border-[rgba(154,52,18,0.2)] bg-[rgba(255,255,255,0.88)] text-[var(--text)] shadow-[0_10px_24px_rgba(154,52,18,0.08)]"
            : "border-transparent text-[var(--muted)] hover:border-[rgba(154,52,18,0.14)] hover:bg-[rgba(255,255,255,0.72)] hover:text-[var(--text)]",
        )}
      >
        <span>{item.label}</span>
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full transition-all duration-200 ease-out",
            isActive ? "bg-[var(--accent)]" : "bg-[rgba(154,52,18,0.12)] group-hover:bg-[rgba(154,52,18,0.28)]",
          )}
        />
      </Link>
    );
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === "true") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, isSidebarCollapsed ? "true" : "false");
  }, [isSidebarCollapsed]);

  return (
    <div
      className={cn(
        "grid min-h-screen transition-[grid-template-columns] duration-200 ease-out",
        isSidebarCollapsed ? "grid-cols-[0_minmax(0,1fr)]" : "grid-cols-[240px_minmax(0,1fr)]",
      )}
    >
      <aside
        className={cn(
          "relative border-r border-[var(--line)] bg-[rgba(255,250,241,0.88)] backdrop-blur-xl transition-all duration-200 ease-out",
          isSidebarCollapsed
            ? "pointer-events-none w-0 overflow-hidden border-r-0 p-0 opacity-0"
            : "w-[240px] p-7 opacity-100",
        )}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <Link className="mb-1 block text-[1.4rem] font-bold tracking-[0.04em]" href="/">
              GraphiteUI
            </Link>
            <div className="text-[0.92rem] leading-[1.5] text-[var(--muted)]">{t("layout.note")}</div>
          </div>
          <button
            type="button"
            aria-label={t("layout.collapse_sidebar")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.74)] text-[var(--accent-strong)] transition-all duration-200 hover:-translate-y-px hover:border-[rgba(154,52,18,0.22)] hover:bg-white"
            onClick={() => setIsSidebarCollapsed(true)}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
              <path d="M10.5 3.5 5.5 8l5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <label className="mb-[18px] grid gap-1.5 text-[0.9rem] text-[var(--muted)]">
          <span>{t("lang.label")}</span>
          <select
            className="rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-2.5 text-[var(--text)] transition-colors duration-200 ease-out hover:border-[rgba(154,52,18,0.18)] focus:border-[rgba(154,52,18,0.28)] focus:outline-none"
            value={language}
            onChange={(event) => setLanguage(event.target.value as "zh" | "en")}
          >
            <option value="zh">{t("lang.zh")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
        </label>

        <div className="mb-3 text-[0.78rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("layout.navigation")}</div>
        <nav aria-label="Main navigation" className="grid gap-2.5">
          {navItems.map(renderNavLink)}
        </nav>

        <div className="mb-3 mt-6 text-[0.78rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("layout.system")}</div>
        <nav aria-label="System navigation" className="grid gap-2.5">
          {systemItems.map(renderNavLink)}
        </nav>
      </aside>
      <main className={cn("relative", isEditorCanvasRoute ? "h-screen overflow-hidden" : "p-8")}>
        {isSidebarCollapsed ? (
          <button
            type="button"
            aria-label={t("layout.expand_sidebar")}
            className="absolute left-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] text-[var(--accent-strong)] shadow-[0_10px_24px_rgba(154,52,18,0.08)] transition-all duration-200 hover:-translate-y-px hover:border-[rgba(154,52,18,0.22)] hover:bg-white"
            onClick={() => setIsSidebarCollapsed(false)}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
              <path d="M5.5 3.5 10.5 8l-5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        {children}
      </main>
    </div>
  );
}
