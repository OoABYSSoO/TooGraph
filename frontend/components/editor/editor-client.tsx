"use client";

import { NodeSystemEditor } from "@/components/editor/node-system-editor";
import type { StateField } from "@/lib/node-system-schema";

export type EditorClientGraphPayload = {
  graph_family?: "node_system";
  graph_id?: string | null;
  name: string;
  template_id: string;
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
