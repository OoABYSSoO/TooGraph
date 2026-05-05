import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { AgentNode, InputNode, TemplateRecord } from "../types/node-system.ts";

import {
  COMPANION_MODE_OPTIONS,
  COMPANION_MODE_STATE_KEY,
  COMPANION_REPLY_STATE_KEY,
  buildCompanionChatGraph,
  formatCompanionHistory,
  resolveCompanionMode,
  resolveCompanionReplyText,
} from "./companionChatGraph.ts";

function createTemplate(): TemplateRecord {
  return {
    template_id: "companion_chat_loop",
    label: "桌宠对话循环",
    description: "Companion chat",
    default_graph_name: "桌宠对话循环",
    state_schema: {
      state_1: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      state_2: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#0f766e" },
      state_3: { name: "page_context", description: "", type: "markdown", value: "", color: "#2563eb" },
      state_4: { name: "companion_reply", description: "", type: "markdown", value: "", color: "#d97706" },
      state_5: { name: "companion_mode", description: "", type: "text", value: "advisory", color: "#7c3aed" },
      state_6: { name: "companion_profile", description: "", type: "markdown", value: "", color: "#a855f7" },
      state_7: { name: "companion_policy", description: "", type: "markdown", value: "", color: "#dc2626" },
      state_8: { name: "companion_memory_context", description: "", type: "markdown", value: "", color: "#059669" },
      state_9: { name: "companion_session_summary", description: "", type: "markdown", value: "", color: "#4f46e5" },
    },
    nodes: {
      input_user_message: {
        kind: "input",
        name: "input_user_message",
        description: "",
        ui: { position: { x: 80, y: 80 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_1", mode: "replace" }],
        config: { value: "" },
      },
      input_conversation_history: {
        kind: "input",
        name: "input_conversation_history",
        description: "",
        ui: { position: { x: 80, y: 480 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_2", mode: "replace" }],
        config: { value: "" },
      },
      input_page_context: {
        kind: "input",
        name: "input_page_context",
        description: "",
        ui: { position: { x: 80, y: 880 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_3", mode: "replace" }],
        config: { value: "" },
      },
      input_companion_mode: {
        kind: "input",
        name: "input_companion_mode",
        description: "",
        ui: { position: { x: 80, y: 1280 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_5", mode: "replace" }],
        config: { value: "" },
      },
      input_companion_profile: {
        kind: "input",
        name: "input_companion_profile",
        description: "",
        ui: { position: { x: 80, y: 1680 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_6", mode: "replace" }],
        config: { value: "" },
      },
      input_companion_policy: {
        kind: "input",
        name: "input_companion_policy",
        description: "",
        ui: { position: { x: 80, y: 2080 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_7", mode: "replace" }],
        config: { value: "" },
      },
      input_companion_memory_context: {
        kind: "input",
        name: "input_companion_memory_context",
        description: "",
        ui: { position: { x: 80, y: 2480 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_8", mode: "replace" }],
        config: { value: "" },
      },
      input_companion_session_summary: {
        kind: "input",
        name: "input_companion_session_summary",
        description: "",
        ui: { position: { x: 80, y: 2880 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_9", mode: "replace" }],
        config: { value: "" },
      },
      companion_reply_agent: {
        kind: "agent",
        name: "companion_reply_agent",
        description: "",
        ui: { position: { x: 640, y: 360 }, collapsed: false },
        reads: [
          { state: "state_1", required: true },
          { state: "state_2", required: false },
          { state: "state_3", required: false },
          { state: "state_5", required: true },
          { state: "state_6", required: false },
          { state: "state_7", required: false },
          { state: "state_8", required: false },
          { state: "state_9", required: false },
        ],
        writes: [{ state: "state_4", mode: "replace" }],
        config: {
          skills: ["graph_editor"],
          skillBindings: [{ skillKey: "graph_editor", enabled: true }],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.4,
        },
      },
      output_companion_reply: {
        kind: "output",
        name: "output_companion_reply",
        description: "",
        ui: { position: { x: 1200, y: 360 }, collapsed: false },
        reads: [{ state: "state_4", required: false }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_user_message", target: "companion_reply_agent" },
      { source: "input_conversation_history", target: "companion_reply_agent" },
      { source: "input_page_context", target: "companion_reply_agent" },
      { source: "input_companion_mode", target: "companion_reply_agent" },
      { source: "input_companion_profile", target: "companion_reply_agent" },
      { source: "input_companion_policy", target: "companion_reply_agent" },
      { source: "input_companion_memory_context", target: "companion_reply_agent" },
      { source: "input_companion_session_summary", target: "companion_reply_agent" },
      { source: "companion_reply_agent", target: "output_companion_reply" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

function assertInputNode(node: TemplateRecord["nodes"][string]): asserts node is InputNode {
  assert.equal(node.kind, "input");
}

function assertAgentNode(node: TemplateRecord["nodes"][string]): asserts node is AgentNode {
  assert.equal(node.kind, "agent");
}

test("formatCompanionHistory keeps a compact readable transcript", () => {
  assert.equal(
    formatCompanionHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: "我在。" },
    ]),
    "用户: 你好\n桌宠: 我在。",
  );
});

test("formatCompanionHistory ignores messages marked outside the model context", () => {
  assert.equal(
    formatCompanionHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: "运行失败：GET /api/runs/run_1 failed with status 500", includeInContext: false },
      { role: "user", content: "继续" },
    ]),
    "用户: 你好\n用户: 继续",
  );
});

test("companion mode options expose only advisory as selectable", () => {
  assert.deepEqual(
    COMPANION_MODE_OPTIONS.map((option) => ({ value: option.value, disabled: option.disabled })),
    [
      { value: "advisory", disabled: false },
      { value: "approval", disabled: true },
      { value: "unrestricted", disabled: true },
    ],
  );
});

test("resolveCompanionMode falls back to advisory for unavailable tiers", () => {
  assert.equal(resolveCompanionMode("advisory"), "advisory");
  assert.equal(resolveCompanionMode("approval"), "advisory");
  assert.equal(resolveCompanionMode("unrestricted"), "advisory");
  assert.equal(resolveCompanionMode("unknown"), "advisory");
});

test("buildCompanionChatGraph injects the current message, history, and page context", () => {
  const graph = buildCompanionChatGraph(createTemplate(), {
    userMessage: "帮我看当前页面",
    history: [{ role: "assistant", content: "我在。" }],
    pageContext: "当前路径: /editor",
    companionMode: "unrestricted",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "桌宠对话循环");
  assert.equal(graph.state_schema.state_1.value, "帮我看当前页面");
  assert.equal(graph.state_schema.state_2.value, "桌宠: 我在。");
  assert.equal(graph.state_schema.state_3.value, "当前路径: /editor");
  assert.equal(graph.state_schema[COMPANION_MODE_STATE_KEY].value, "advisory");
  assert.equal(graph.state_schema[COMPANION_REPLY_STATE_KEY].value, "");
  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_companion_mode);
  assert.equal(graph.nodes.input_user_message.config.value, "帮我看当前页面");
  assert.equal(graph.nodes.input_companion_mode.config.value, "advisory");
  assert.equal(graph.metadata.companion_mode, "advisory");
  assert.equal(graph.metadata.companion_permission_tier, 1);
  assert.equal(graph.metadata.companion_can_execute_actions, false);
  assertAgentNode(graph.nodes.companion_reply_agent);
  assert.deepEqual(graph.nodes.companion_reply_agent.config.skills, []);
  assert.deepEqual(graph.nodes.companion_reply_agent.config.skillBindings, []);
});

test("buildCompanionChatGraph leaves companion self config states for graph template skills", () => {
  const graph = buildCompanionChatGraph(createTemplate(), {
    userMessage: "你好",
    history: [],
    pageContext: "当前路径: /editor/new",
    companionMode: "advisory",
  });

  assert.equal(graph.state_schema.state_6.value, "");
  assert.equal(graph.state_schema.state_7.value, "");
  assert.equal(graph.state_schema.state_8.value, "");
  assert.equal(graph.state_schema.state_9.value, "");
});

test("resolveCompanionReplyText prefers the companion reply state over fallback text", () => {
  const run = {
    final_result: "fallback",
    state_snapshot: {
      values: {
        [COMPANION_REPLY_STATE_KEY]: "我看到了。",
      },
      last_writers: {},
    },
    artifacts: {
      state_values: {},
    },
    output_previews: [],
  } as unknown as RunDetail;

  assert.equal(resolveCompanionReplyText(run), "我看到了。");
});
