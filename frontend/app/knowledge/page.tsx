"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { KnowledgeListClient } from "@/components/knowledge/knowledge-list-client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function KnowledgePage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow={t("knowledge.eyebrow")} title={t("knowledge.title")} description={t("knowledge.desc")} />

      <Card>
        <div className="flex flex-wrap gap-2.5">
          <Badge>{t("common.search_docs")}</Badge>
          <Badge>{t("common.open_detail")}</Badge>
        </div>
      </Card>

      <Card>
        <KnowledgeListClient />
      </Card>
    </div>
  );
}
