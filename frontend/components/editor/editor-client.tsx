"use client";

import { EditorWorkspaceShell } from "@/components/editor/editor-workspace-shell";
import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

export type EditorClientGraphPayload = CanonicalGraphPayload;
export type EditorClientTemplateRecord = CanonicalTemplateRecord;
export type EditorClientRouteMode = "root" | "new" | "existing";

type EditorClientProps = {
  routeMode: EditorClientRouteMode;
  routeGraph?: EditorClientGraphPayload | null;
  routeGraphId?: string;
  templates: EditorClientTemplateRecord[];
  graphs: GraphSummary[];
  defaultTemplateId?: string | null;
};

export function EditorClient(props: EditorClientProps) {
  return <EditorWorkspaceShell {...props} />;
}
