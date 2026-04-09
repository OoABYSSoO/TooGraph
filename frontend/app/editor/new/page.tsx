import { EditorClient, type EditorClientTemplateRecord } from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";

async function loadTemplates() {
  try {
    return await apiGet<EditorClientTemplateRecord[]>("/api/templates");
  } catch {
    return [] as EditorClientTemplateRecord[];
  }
}

export default async function EditorNewPage() {
  const templates = await loadTemplates();

  return <EditorClient mode="new" templates={templates} />;
}
