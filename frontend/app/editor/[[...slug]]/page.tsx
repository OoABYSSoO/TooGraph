import { notFound } from "next/navigation";

import {
  EditorClient,
  type EditorClientGraphPayload,
  type EditorClientTemplateRecord,
} from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";
import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

type EditorPageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams?: Promise<{ template?: string }>;
};

async function loadTemplates() {
  try {
    return await apiGet<CanonicalTemplateRecord[]>("/api/templates");
  } catch {
    return [] as EditorClientTemplateRecord[];
  }
}

async function loadGraphs() {
  try {
    const graphs = await apiGet<CanonicalGraphPayload[]>("/api/graphs");
    return graphs.map((graph) => ({
      graph_id: graph.graph_id ?? "",
      name: graph.name,
      node_count: Object.keys(graph.nodes).length,
      edge_count: graph.edges.length + graph.conditional_edges.reduce((count, entry) => count + Object.keys(entry.branches).length, 0),
    })) satisfies GraphSummary[];
  } catch {
    return [] as GraphSummary[];
  }
}

async function loadGraph(graphId: string) {
  try {
    return await apiGet<CanonicalGraphPayload>(`/api/graphs/${graphId}`);
  } catch {
    return null;
  }
}

export default async function EditorPage({ params, searchParams }: EditorPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const slug = resolvedParams.slug ?? [];

  if (slug.length > 1) {
    notFound();
  }

  const [templates, graphs] = await Promise.all([loadTemplates(), loadGraphs()]);

  if (slug.length === 0) {
    return <EditorClient routeMode="root" templates={templates} graphs={graphs} />;
  }

  if (slug[0] === "new") {
    return (
      <EditorClient
        routeMode="new"
        templates={templates}
        graphs={graphs}
        defaultTemplateId={resolvedSearchParams?.template ?? null}
      />
    );
  }

  const graphId = slug[0];
  const graph = await loadGraph(graphId);

  if (!graph) {
    notFound();
  }

  return (
    <EditorClient
      routeMode="existing"
      routeGraphId={graphId}
      routeGraph={graph as EditorClientGraphPayload}
      templates={templates}
      graphs={graphs}
    />
  );
}
