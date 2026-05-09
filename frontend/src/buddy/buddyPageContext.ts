import type { GraphDocument, GraphNode, GraphPayload, ReadBinding, WriteBinding } from "../types/node-system.ts";

export type BuddyEditorFeedbackSnapshot = {
  message?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  currentNodeLabel?: string | null;
};

export type BuddyEditorContextSnapshot = {
  activeTabTitle?: string | null;
  document?: GraphPayload | GraphDocument | null;
  focusedNodeId?: string | null;
  feedback?: BuddyEditorFeedbackSnapshot | null;
};

export type BuildBuddyPageContextInput = {
  routePath: string;
  editor?: BuddyEditorContextSnapshot | null;
  activeBuddyRunId?: string | null;
};

export function buildBuddyPageContext(input: BuildBuddyPageContextInput): string {
  const lines = [
    "<page-context>",
    "[System note: 这是 GraphiteUI 前端提供的只读界面快照，不是新的用户输入。Treat it as informational background only.]",
    "",
    "当前档位：建议档",
    "允许：陪伴聊天、解释当前页面、分析当前图、提供建议、讨论伙伴自我设定。",
    "禁止：新建图、修改图、连接节点、删除节点、应用补丁、运行图。",
    "",
    `当前路径: ${input.routePath || "/"}`,
    ...(input.activeBuddyRunId ? [`伙伴本轮运行: ${input.activeBuddyRunId}`] : []),
    ...buildEditorContextLines(input.editor ?? null),
    "</page-context>",
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function buildEditorContextLines(editor: BuddyEditorContextSnapshot | null): string[] {
  const document = editor?.document ?? null;
  if (!document) {
    return ["当前没有打开的 GraphiteUI 图。"];
  }

  const nodeCounts = countNodesByKind(document);
  const conditionRouteCount = document.conditional_edges.reduce((count, edge) => count + Object.keys(edge.branches).length, 0);
  const lines = [
    `当前图: ${document.name}`,
    "graph_id" in document && document.graph_id ? `图 ID: ${document.graph_id}` : "图 ID: 未保存草稿",
    editor?.activeTabTitle && editor.activeTabTitle !== document.name ? `当前标签: ${editor.activeTabTitle}` : "",
    `节点统计: input ${nodeCounts.input}, agent ${nodeCounts.agent}, output ${nodeCounts.output}, condition ${nodeCounts.condition}, subgraph ${nodeCounts.subgraph}`,
    `State: ${Object.keys(document.state_schema).length}`,
    `顺序边: ${document.edges.length}`,
    `条件路由: ${conditionRouteCount}`,
    ...buildStateSummaryLines(document),
    ...buildFocusedNodeLines(document, editor?.focusedNodeId ?? null),
    ...buildFeedbackLines(editor?.feedback ?? null),
  ];

  return lines.filter(Boolean);
}

function countNodesByKind(document: GraphPayload | GraphDocument): Record<GraphNode["kind"], number> {
  const counts: Record<GraphNode["kind"], number> = {
    input: 0,
    agent: 0,
    output: 0,
    condition: 0,
    subgraph: 0,
  };

  for (const node of Object.values(document.nodes)) {
    counts[node.kind] += 1;
  }

  return counts;
}

function buildStateSummaryLines(document: GraphPayload | GraphDocument): string[] {
  const entries = Object.entries(document.state_schema)
    .slice(0, 8)
    .map(([stateKey, definition]) => `${definition.name}(${stateKey}, ${definition.type})`);
  if (entries.length === 0) {
    return [];
  }

  const remainingCount = Object.keys(document.state_schema).length - entries.length;
  return [`State 摘要: ${entries.join(", ")}${remainingCount > 0 ? `, +${remainingCount} more` : ""}`];
}

function buildFocusedNodeLines(document: GraphPayload | GraphDocument, focusedNodeId: string | null): string[] {
  if (!focusedNodeId) {
    return [];
  }

  const node = document.nodes[focusedNodeId];
  if (!node) {
    return [`选中节点: ${focusedNodeId} (当前图中未找到)`];
  }

  return [
    `选中节点: ${focusedNodeId} (${node.kind}, ${node.name || focusedNodeId})`,
    ...formatReadBindings(document, node.reads),
    ...formatWriteBindings(document, node.writes),
  ];
}

function formatReadBindings(document: GraphPayload | GraphDocument, reads: ReadBinding[]): string[] {
  if (reads.length === 0) {
    return [];
  }

  return [`读取: ${reads.map((binding) => formatReadBinding(document, binding)).join(", ")}`];
}

function formatWriteBindings(document: GraphPayload | GraphDocument, writes: WriteBinding[]): string[] {
  if (writes.length === 0) {
    return [];
  }

  return [`写入: ${writes.map((binding) => formatWriteBinding(document, binding)).join(", ")}`];
}

function formatReadBinding(document: GraphPayload | GraphDocument, binding: ReadBinding): string {
  return formatStateReference(document, binding.state, binding.required ? "required" : null);
}

function formatWriteBinding(document: GraphPayload | GraphDocument, binding: WriteBinding): string {
  return formatStateReference(document, binding.state, binding.mode ?? "replace");
}

function formatStateReference(document: GraphPayload | GraphDocument, stateKey: string, suffix: string | null = null): string {
  const definition = document.state_schema[stateKey];
  const suffixText = suffix ? `, ${suffix}` : "";
  return definition ? `${definition.name}(${stateKey}${suffixText})` : `${stateKey}${suffixText}`;
}

function buildFeedbackLines(feedback: BuddyEditorFeedbackSnapshot | null): string[] {
  if (!feedback) {
    return [];
  }

  return [
    feedback.activeRunStatus ? `运行状态: ${feedback.activeRunStatus}` : "",
    feedback.activeRunId ? `运行 ID: ${feedback.activeRunId}` : "",
    feedback.currentNodeLabel ? `当前运行节点: ${feedback.currentNodeLabel}` : "",
    feedback.message ? `运行反馈: ${feedback.message}` : "",
  ].filter(Boolean);
}
