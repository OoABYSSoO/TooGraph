import { EditorClient } from "@/components/editor/editor-client";
import { apiGet } from "@/lib/api";

type TemplateRecord = {
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
};

async function loadTemplates() {
  try {
    return await apiGet<TemplateRecord[]>("/api/templates");
  } catch {
    return [] as TemplateRecord[];
  }
}

export default async function EditorNewPage() {
  const templates = await loadTemplates();

  return <EditorClient mode="new" templates={templates} />;
}
