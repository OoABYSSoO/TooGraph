import { EditorWorkbench } from "@/components/editor/editor-workbench";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ graphId: string }>;
}) {
  const { graphId } = await params;

  return <EditorWorkbench graphId={graphId} />;
}
