"use client";

import { NodeSystemEditor } from "@/components/editor/node-system-editor";
import type { NodeSystemGraphPayload, NodeSystemTemplateRecord } from "@/lib/node-system-schema";

export type EditorClientGraphPayload = NodeSystemGraphPayload;
export type EditorClientTemplateRecord = NodeSystemTemplateRecord;

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
