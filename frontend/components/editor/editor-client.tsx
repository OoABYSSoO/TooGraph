"use client";

import { NodeSystemEditor } from "@/components/editor/node-system-editor";

type ThemeConfig = {
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

type StateField = {
  key: string;
  type: string;
  title: string;
  description: string;
};

export type EditorClientGraphPayload = {
  graph_family?: "node_system";
  graph_id?: string | null;
  name: string;
  template_id: string;
  theme_config: ThemeConfig;
  state_schema: StateField[];
  nodes: unknown[];
  edges: unknown[];
  metadata: Record<string, unknown>;
};

export type EditorClientTemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  supported_node_types: string[];
  state_schema: StateField[];
  default_node_system_graph: Omit<EditorClientGraphPayload, "graph_id">;
};

type EditorClientProps = {
  mode: "new" | "existing";
  initialGraph?: EditorClientGraphPayload | null;
  graphId?: string;
  templates: EditorClientTemplateRecord[];
  defaultTemplateId?: string;
};

export function EditorClient({ mode, initialGraph, graphId, templates, defaultTemplateId }: EditorClientProps) {
  return (
    <NodeSystemEditor
      mode={mode}
      initialGraph={initialGraph}
      graphId={graphId}
      templates={templates}
      defaultTemplateId={defaultTemplateId}
    />
  );
}
