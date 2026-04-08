"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { RunsListClient } from "@/components/runs/runs-list-client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function RunsPage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow={t("runs.eyebrow")} title={t("runs.title")} description={t("runs.desc")} />

      <Card>
        <div className="flex flex-wrap gap-2.5">
          <Badge>{t("runs.search")}</Badge>
          <Badge>{t("runs.filter")}</Badge>
        </div>
      </Card>

      <Card>
        <RunsListClient />
      </Card>
    </div>
  );
}
