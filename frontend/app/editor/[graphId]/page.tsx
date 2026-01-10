import { notFound } from "next/navigation";

import { EditorClient } from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";

type EditorGraphPageProps = {
  params: Promise<{ graphId: string }>;
};

async function loadTemplates() {
  try {
    return await apiGet<
      Array<{
        template_id: string;
        label: string;
        description: string;
        default_graph_name: string;
        supported_node_types: string[];
        state_schema: Array<{
          key: string;
          type: string;
          title: string;
          description: string;
        }>;
        default_graph: {
          name: string;
          template_id: string;
          theme_config: {
            theme_preset: string;
            domain: string;
            genre: string;
            market: string;
            platform: string;
            language: string;
            creative_style: string;
            tone: string;
            language_constraints: string[];
            evaluation_policy: Record<string, unknown>;
            asset_source_policy: Record<string, unknown>;
            strategy_profile: Record<string, unknown>;
          };
          state_schema: Array<{
            key: string;
            type: string;
            title: string;
            description: string;
          }>;
          nodes: Array<{
            id: string;
            type: string;
            label: string;
            position: { x: number; y: number };
            reads: string[];
            writes: string[];
            params: Record<string, unknown>;
          }>;
          edges: Array<{
            id: string;
            source: string;
            target: string;
            flow_keys: string[];
            edge_kind: "normal" | "branch";
            branch_label?: "pass" | "revise" | "fail" | null;
          }>;
          metadata: Record<string, unknown>;
        };
      }>
    >("/api/templates");
  } catch {
    return [];
  }
}

async function loadGraph(graphId: string) {
  try {
    return await apiGet<{
      graph_id: string;
      name: string;
      template_id: string;
      theme_config: {
        theme_preset: string;
        domain: string;
        genre: string;
        market: string;
        platform: string;
        language: string;
        creative_style: string;
        tone: string;
        language_constraints: string[];
        evaluation_policy: Record<string, unknown>;
        asset_source_policy: Record<string, unknown>;
        strategy_profile: Record<string, unknown>;
      };
      state_schema: Array<{
        key: string;
        type: string;
        title: string;
        description: string;
      }>;
      nodes: Array<{
        id: string;
        type: string;
        label: string;
        position: { x: number; y: number };
        reads: string[];
        writes: string[];
        params: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        flow_keys: string[];
        edge_kind: "normal" | "branch";
        branch_label?: "pass" | "revise" | "fail" | null;
      }>;
      metadata: Record<string, unknown>;
    }>(`/api/graphs/${graphId}`);
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
