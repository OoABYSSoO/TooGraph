import { createDraftFromTemplate } from "../lib/graph-document.ts";

import type { GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";

export type BuddyTemplateRunGraphInput = {
  inputText: string;
  operationRequestId: string;
  templateId: string;
  templateName: string;
};

export type BuddyTemplateRunGraphResult = {
  graph: GraphPayload;
  inputNodeId: string;
};

export function buildBuddyTemplateRunGraph(
  template: TemplateRecord,
  input: BuddyTemplateRunGraphInput,
): BuddyTemplateRunGraphResult {
  const graph = createDraftFromTemplate(template);
  const inputNodeId = resolveBuddyTemplateRunInputNodeId(graph);
  if (!inputNodeId) {
    throw new Error("目标图模板没有可写入目标的 input 节点。");
  }
  writeTemplateRunInputValue(graph, inputNodeId, input.inputText);
  graph.metadata = {
    ...graph.metadata,
    origin: "buddy_virtual_template_run",
    buddy_template_id: template.template_id,
    buddy_virtual_template_run: {
      operation_request_id: input.operationRequestId,
      template_id: input.templateId || template.template_id,
      template_name: input.templateName || template.label || template.default_graph_name,
      input_node_id: inputNodeId,
    },
  };
  return { graph, inputNodeId };
}

function resolveBuddyTemplateRunInputNodeId(graph: GraphPayload) {
  const inputEntries = Object.entries(graph.nodes).filter(([, node]) => node.kind === "input") as Array<
    [string, InputNode]
  >;
  const textInput = inputEntries.find(([, node]) => isTextTemplateInput(graph, node));
  return textInput?.[0] ?? inputEntries[0]?.[0] ?? "";
}

function isTextTemplateInput(graph: GraphPayload, node: InputNode) {
  const boundaryType = node.config.boundaryType?.trim();
  if (boundaryType === "text") {
    return true;
  }
  const stateKey = node.writes[0]?.state ?? "";
  const stateType = graph.state_schema[stateKey]?.type?.trim();
  return stateType === "text" || stateType === "markdown" || stateType === "json";
}

function writeTemplateRunInputValue(graph: GraphPayload, inputNodeId: string, inputText: string) {
  const node = graph.nodes[inputNodeId];
  if (!node || node.kind !== "input") {
    return;
  }
  node.config = {
    ...node.config,
    value: inputText,
  };
  for (const binding of node.writes) {
    const state = graph.state_schema[binding.state];
    if (!state) {
      continue;
    }
    graph.state_schema[binding.state] = {
      ...state,
      value: inputText,
    };
  }
}
