"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/cn";

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const isEditorRoute = pathname === "/editor" || pathname.startsWith("/editor/");
  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/workspace", label: t("nav.workspace") },
    { href: "/editor", label: t("nav.editor") },
  ];
  const systemItems = [
    { href: "/skills", label: t("nav.skills") },
    { href: "/runs", label: t("nav.runs") },
    { href: "/knowledge", label: t("nav.knowledge") },
    { href: "/settings", label: t("nav.settings") },
  ];

  const currentContext = (() => {
    if (pathname === "/" || pathname === "") return { title: t("layout.current_home"), description: t("layout.current_home_desc") };
    if (pathname.startsWith("/workspace")) return { title: t("layout.current_workspace"), description: t("layout.current_workspace_desc") };
    if (pathname.startsWith("/editor")) return { title: t("layout.current_editor"), description: t("layout.current_editor_desc") };
    if (pathname.startsWith("/skills")) return { title: t("layout.current_skills"), description: t("layout.current_skills_desc") };
    if (pathname.startsWith("/runs")) return { title: t("layout.current_runs"), description: t("layout.current_runs_desc") };
    if (pathname.startsWith("/knowledge")) return { title: t("layout.current_knowledge"), description: t("layout.current_knowledge_desc") };
    return { title: t("layout.current_settings"), description: t("layout.current_settings_desc") };
  })();

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

  return (
    <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-r border-[var(--line)] bg-[rgba(255,250,241,0.88)] p-7 backdrop-blur-xl">
        <div className="mb-6">
          <Link className="mb-1 block text-[1.4rem] font-bold tracking-[0.04em]" href="/">
            GraphiteUI
          </Link>
          <div className="text-[0.92rem] leading-[1.5] text-[var(--muted)]">{t("layout.note")}</div>
        </div>

        <div className="mb-5 rounded-[22px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.62)] p-4 shadow-[0_10px_24px_rgba(154,52,18,0.06)]">
          <div className="mb-2 text-[0.78rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("layout.current")}</div>
          <div className="text-[1rem] font-semibold">{currentContext.title}</div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{currentContext.description}</p>
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
      <main className={isEditorRoute ? "min-h-screen overflow-hidden" : "p-8"}>{children}</main>
    </div>
  );
}
