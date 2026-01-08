"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { SettingsPanelClient } from "@/components/settings/settings-panel-client";
import { SectionHeader } from "@/components/ui/section-header";

export default function SettingsPage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow={t("settings.eyebrow")} title={t("settings.title")} description={t("settings.desc")} />

      <SettingsPanelClient />
    </div>
  );
}
