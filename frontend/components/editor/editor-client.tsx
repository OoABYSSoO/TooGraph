"use client";

import { NodeSystemEditor } from "@/components/editor/node-system-editor";
import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";

export type EditorClientGraphPayload = CanonicalGraphPayload;
export type EditorClientTemplateRecord = CanonicalTemplateRecord;

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
