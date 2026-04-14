import { EditorClient, type EditorClientTemplateRecord } from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";
import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";

type EditorNewPageProps = {
  searchParams?: Promise<{ template?: string }>;
};

async function loadTemplates() {
  try {
    return await apiGet<CanonicalTemplateRecord[]>("/api/templates");
  } catch {
    return [] as EditorClientTemplateRecord[];
  }
}

export default async function EditorNewPage({ searchParams }: EditorNewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const templates = await loadTemplates();

  return <EditorClient mode="new" templates={templates} defaultTemplateId={resolvedSearchParams?.template} />;
}
