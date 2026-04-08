"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { MemoryListClient } from "@/components/memories/memory-list-client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function MemoriesPage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow={t("memories.eyebrow")} title={t("memories.title")} description={t("memories.desc")} />

      <Card>
        <div className="flex flex-wrap gap-2.5">
          <Badge>{t("common.filter_memory")}</Badge>
          <Badge>{t("common.open_detail")}</Badge>
        </div>
      </Card>

      <Card>
        <MemoryListClient />
      </Card>
    </div>
  );
}
