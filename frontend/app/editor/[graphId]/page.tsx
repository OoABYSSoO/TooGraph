"use client";

import { useParams } from "next/navigation";

import { EditorWorkbench } from "@/components/editor/editor-workbench";

export default function EditorPage() {
  const params = useParams<{ graphId: string }>();

  return <EditorWorkbench graphId={params.graphId} />;
}
