"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { SkillsPageClient } from "@/components/skills/skills-page-client";
import { SectionHeader } from "@/components/ui/section-header";

export default function SkillsPage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow={t("skills.eyebrow")} title={t("skills.title")} description={t("skills.desc")} />
      <SkillsPageClient />
    </div>
  );
}
