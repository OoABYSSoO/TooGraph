import assert from "node:assert/strict";
import test from "node:test";

import { buildBuddyTemplateRunGraph } from "./buddyTemplateRunGraph.ts";

import type { TemplateRecord } from "../types/node-system.ts";

function createTemplate(): TemplateRecord {
  return {
    template_id: "research_loop",
    label: "Research Loop",
    description: "Research template",
    default_graph_name: "Research Loop Draft",
    source: "official",
    status: "active",
    capabilityDiscoverable: true,
    state_schema: {
      user_goal: {
        name: "user_goal",
        description: "Goal",
        type: "text",
        value: "",
        color: "#d97706",
      },
      answer: {
        name: "answer",
        description: "Answer",
        type: "markdown",
        value: "",
        color: "#10b981",
      },
    },
    nodes: {
      input_goal: {
        kind: "input",
        name: "目标",
        description: "User goal",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "user_goal", mode: "replace" }],
        config: { value: "", boundaryType: "text" },
      },
      output_answer: {
        kind: "output",
        name: "答案",
        description: "Answer",
        ui: { position: { x: 300, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "input_goal", target: "output_answer" }],
    conditional_edges: [],
    metadata: { source: "fixture" },
  };
}

test("buildBuddyTemplateRunGraph clones a template and writes the operation goal into the template input state", () => {
  const template = createTemplate();

  const result = buildBuddyTemplateRunGraph(template, {
    inputText: "鸣潮最新查询",
    operationRequestId: "operation_1",
    templateId: "research_loop",
    templateName: "Research Loop",
  });

  assert.equal(result.inputNodeId, "input_goal");
  assert.equal(result.graph.graph_id, null);
  assert.equal(result.graph.name, "Research Loop Draft");
  assert.equal(result.graph.nodes.input_goal?.kind, "input");
  if (result.graph.nodes.input_goal?.kind === "input") {
    assert.equal(result.graph.nodes.input_goal.config.value, "鸣潮最新查询");
  }
  assert.equal(result.graph.state_schema.user_goal?.value, "鸣潮最新查询");
  assert.deepEqual(result.graph.metadata.buddy_virtual_template_run, {
    operation_request_id: "operation_1",
    template_id: "research_loop",
    template_name: "Research Loop",
    input_node_id: "input_goal",
  });
  assert.equal(template.state_schema.user_goal?.value, "");
});

test("buildBuddyTemplateRunGraph rejects templates without a text input node", () => {
  const template = createTemplate();
  delete template.nodes.input_goal;

  assert.throws(
    () =>
      buildBuddyTemplateRunGraph(template, {
        inputText: "鸣潮最新查询",
        operationRequestId: "operation_1",
        templateId: "research_loop",
        templateName: "Research Loop",
      }),
    /没有可写入目标的 input 节点/,
  );
});
