import { notFound } from "next/navigation";

import {
  EditorClient,
  type EditorClientGraphPayload,
  type EditorClientTemplateRecord,
} from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";

type EditorGraphPageProps = {
  params: Promise<{ graphId: string }>;
};

async function loadTemplates() {
  try {
    return await apiGet<EditorClientTemplateRecord[]>("/api/templates");
  } catch {
    return [] as EditorClientTemplateRecord[];
  }
}

async function loadGraph(graphId: string) {
  try {
    return await apiGet<EditorClientGraphPayload>(`/api/graphs/${graphId}`);
  } catch {
    return null;
  }
}

export default async function EditorGraphPage({ params }: EditorGraphPageProps) {
  const { graphId } = await params;
  const [graph, templates] = await Promise.all([loadGraph(graphId), loadTemplates()]);

  if (!graph) {
    notFound();
  }

  return <EditorClient mode="existing" graphId={graphId} initialGraph={graph} templates={templates} />;
}
