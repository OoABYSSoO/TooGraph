"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { SettingsPanelClient } from "@/components/settings/settings-panel-client";

export default function SettingsPage() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("settings.eyebrow")}</div>
        <h1 className="page-title">{t("settings.title")}</h1>
        <p className="page-subtitle">{t("settings.desc")}</p>
      </section>

      <SettingsPanelClient />
    </div>
  );
}
