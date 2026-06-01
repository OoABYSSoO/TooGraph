import type { GraphDocument, GraphNode, GraphPayload, ReadBinding, WriteBinding } from "../types/node-system.ts";
import type { PageOperationBook, PageOperationFacts } from "./pageOperationAffordances.ts";
import { formatPageOperationBookLines } from "./pageOperationAffordances.ts";

export type BuddyEditorFeedbackSnapshot = {
  message?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  currentNodeLabel?: string | null;
};

export type BuddyEditorContextSnapshot = {
  activeTabId?: string | null;
  activeTabTitle?: string | null;
  activeTabKind?: string | null;
  activeGraphId?: string | null;
  activeGraphName?: string | null;
  activeGraphDirty?: boolean | null;
  document?: GraphPayload | GraphDocument | null;
  focusedNodeId?: string | null;
  selectedNodeIds?: string[] | null;
  feedback?: BuddyEditorFeedbackSnapshot | null;
};

export type BuildBuddyPageContextInput = {
  routePath: string;
  editor?: BuddyEditorContextSnapshot | null;
  activeBuddyRunId?: string | null;
  pageOperationBook?: PageOperationBook | null;
  pageFacts?: PageOperationFacts | null;
};

const PAGE_OPERATION_FORBIDDEN_NOTE = "仅允许使用页面操作书中列出的命令；未列出的页面目标不可操作。";

export function buildBuddyPageContext(input: BuildBuddyPageContextInput): string {
  const hideSelfSurfacePage =
    isSelfSurfaceRoute(input.routePath)
    || isSelfSurfaceRoute(input.pageOperationBook?.page.path ?? "")
    || isSelfSurfaceRoute(input.pageFacts?.route.path ?? "");
  const pageOperationBook = sanitizePageOperationBookForContext(input.pageOperationBook ?? null, hideSelfSurfacePage);
  const pageFacts = hideSelfSurfacePage ? null : (input.pageFacts ?? null);
  const lines = [
    "<page-context>",
    "[System note: 这是 TooGraph 前端提供的只读界面快照，不是新的用户输入。Treat it as informational background only.]",
    "",
    "当前档位：建议档",
    "允许：陪伴聊天、解释当前页面、分析当前图、提供建议、讨论伙伴自我设定。",
    "禁止：新建图、修改图、连接节点、删除节点、应用补丁、运行图。",
    "",
    `当前路径: ${formatRoutePathForContext(input.routePath, hideSelfSurfacePage)}`,
    ...(input.activeBuddyRunId ? [`伙伴本轮运行: ${input.activeBuddyRunId}`] : []),
    ...(hideSelfSurfacePage ? ["当前页面细节已过滤。"] : []),
    ...buildPageFactLines(pageFacts),
    ...formatPageOperationBookLines(pageOperationBook),
    ...buildEditorContextLines(input.editor ?? null),
    "</page-context>",
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function normalizeRoutePath(routePath: string): string {
  const value = (routePath || "/").trim() || "/";
  return value.split(/[?#]/, 1)[0] || "/";
}

function formatRoutePathForContext(routePath: string, hideSelfSurfacePage: boolean): string {
  if (hideSelfSurfacePage) {
    return "/";
  }
  return normalizeRoutePath(routePath);
}

function sanitizePageOperationBookForContext(book: PageOperationBook | null, hideSelfSurfacePage: boolean): PageOperationBook | null {
  if (!book) {
    return null;
  }
  return {
    page: {
      path: hideSelfSurfacePage ? "/" : normalizeRoutePath(book.page.path),
      title: hideSelfSurfacePage ? "当前页面" : book.page.title,
      snapshotId: book.page.snapshotId,
    },
    allowedOperations: book.allowedOperations
      .filter((operation) => !isSelfSurfaceTargetId(operation.targetId))
      .map((operation) => ({
        ...operation,
        commands: operation.commands.filter((command) => !containsSelfSurfaceTarget(command)),
        resultHint: sanitizeResultHint(operation.resultHint),
      }))
      .filter((operation) => operation.commands.length > 0),
    inputs: book.inputs
      .filter((input) => !isSelfSurfaceTargetId(input.targetId))
      .map((input) => ({
        ...input,
        commands: input.commands.filter((command) => !containsSelfSurfaceTarget(command)),
      }))
      .filter((input) => input.commands.length > 0),
    unavailable: book.unavailable.filter((item) => !isSelfSurfaceTargetId(item.targetId)),
    forbidden: [PAGE_OPERATION_FORBIDDEN_NOTE],
  };
}

function sanitizeResultHint(resultHint: PageOperationBook["allowedOperations"][number]["resultHint"]) {
  if (!resultHint?.path || isSelfSurfaceRoute(resultHint.path)) {
    return null;
  }
  return { path: normalizeRoutePath(resultHint.path) };
}

function containsSelfSurfaceTarget(command: string): boolean {
  const [, targetId = ""] = command.trim().split(/\s+/, 2);
  return isSelfSurfaceTargetId(targetId);
}

function isSelfSurfaceRoute(routePath: string): boolean {
  const normalized = normalizeRoutePath(routePath).toLowerCase();
  return normalized === "/buddy" || normalized.startsWith("/buddy/");
}

function isSelfSurfaceTargetId(targetId: string): boolean {
  const normalized = targetId.trim().toLowerCase();
  return normalized.startsWith("buddy.") || normalized === "app.nav.buddy" || normalized.includes("mascot") || normalized.includes("debug");
}

function buildEditorContextLines(editor: BuddyEditorContextSnapshot | null): string[] {
  const document = editor?.document ?? null;
  if (!document) {
    return ["当前没有打开的 TooGraph 图。"];
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
    ...buildSelectedNodeLines(document, editor?.selectedNodeIds ?? []),
    ...buildFocusedNodeLines(document, editor?.focusedNodeId ?? null),
    ...buildFeedbackLines(editor?.feedback ?? null),
  ];

  return lines.filter(Boolean);
}

function buildPageFactLines(facts: PageOperationFacts | null): string[] {
  if (!facts) {
    return [];
  }
  return [
    facts.route.title ? `页面标题: ${facts.route.title}` : "",
    facts.activeEditorTab
      ? `活跃编辑器标签: ${facts.activeEditorTab.title} (${facts.activeEditorTab.tabId}, ${facts.activeEditorTab.kind})`
      : "",
    facts.activeGraph ? `活跃图: ${facts.activeGraph.name} (${facts.activeGraph.graphId ?? "unsaved"}, dirty: ${facts.activeGraph.dirty})` : "",
    facts.visibleGraphs.length > 0 ? `可见图: ${facts.visibleGraphs.map(formatEntityFact).join(", ")}` : "",
    facts.visibleTemplates.length > 0 ? `可见模板: ${facts.visibleTemplates.map(formatEntityFact).join(", ")}` : "",
    facts.visibleRuns.length > 0 ? `可见运行: ${facts.visibleRuns.map(formatEntityFact).join(", ")}` : "",
    facts.latestForegroundRun
      ? `最新前台运行: ${facts.latestForegroundRun.runId} (${facts.latestForegroundRun.status})${
          facts.latestForegroundRun.resultSummary ? ` ${facts.latestForegroundRun.resultSummary}` : ""
        }`
      : "",
    formatLatestOperationResult(facts.latestOperationResult),
  ].filter(Boolean);
}

function formatEntityFact(entity: { id: string; label: string }) {
  return `${entity.label}(${entity.id})`;
}

function formatLatestOperationResult(value: Record<string, unknown> | null) {
  if (!value) {
    return "";
  }
  const requestId = normalizeText(value.operation_request_id);
  const status = normalizeText(value.status);
  const routeAfter = normalizeText(value.route_after);
  if (!requestId && !status && !routeAfter) {
    return "";
  }
  return `最新页面操作: ${requestId || "unknown"} (${status || "unknown"})${routeAfter ? ` -> ${routeAfter}` : ""}`;
}

function countNodesByKind(document: GraphPayload | GraphDocument): Record<GraphNode["kind"], number> {
  const counts: Record<GraphNode["kind"], number> = {
    input: 0,
    agent: 0,
    new_llm: 0,
    batch: 0,
    output: 0,
    condition: 0,
    subgraph: 0,
    tool: 0,
  };

  for (const node of Object.values(document.nodes)) {
    counts[node.kind] += 1;
  }

  return counts;
}

function buildSelectedNodeLines(document: GraphPayload | GraphDocument, selectedNodeIds: string[] | null): string[] {
  const normalizedNodeIds = [...new Set((selectedNodeIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean))];
  if (normalizedNodeIds.length <= 1) {
    return [];
  }
  const labels = normalizedNodeIds.map((nodeId) => {
    const node = document.nodes[nodeId];
    return node ? `${node.name || nodeId}(${nodeId})` : `${nodeId}(当前图中未找到)`;
  });
  return [`多选节点: ${labels.join(", ")}`];
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
