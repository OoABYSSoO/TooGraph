import { SettingsPanelClient } from "@/components/settings/settings-panel-client";

export default function SettingsPage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Readonly runtime and model settings.</h1>
        <p className="page-subtitle">
          Current delivery only requires visibility into model, revision, and evaluator
          configuration.
        </p>
      </section>

      <SettingsPanelClient />
    </div>
  );
}
