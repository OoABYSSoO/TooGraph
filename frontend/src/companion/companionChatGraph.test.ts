import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { TemplateRecord } from "../types/node-system.ts";

import {
  COMPANION_REPLY_STATE_KEY,
  buildCompanionChatGraph,
  formatCompanionHistory,
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
      companion_reply_agent: {
        kind: "agent",
        name: "companion_reply_agent",
        description: "",
        ui: { position: { x: 640, y: 360 }, collapsed: false },
        reads: [
          { state: "state_1", required: true },
          { state: "state_2", required: false },
          { state: "state_3", required: false },
        ],
        writes: [{ state: "state_4", mode: "replace" }],
        config: {
          skills: [],
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
      { source: "companion_reply_agent", target: "output_companion_reply" },
    ],
    conditional_edges: [],
    metadata: {},
  };
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

test("buildCompanionChatGraph injects the current message, history, and page context", () => {
  const graph = buildCompanionChatGraph(createTemplate(), {
    userMessage: "帮我看当前页面",
    history: [{ role: "assistant", content: "我在。" }],
    pageContext: "当前路径: /editor",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "桌宠对话循环");
  assert.equal(graph.state_schema.state_1.value, "帮我看当前页面");
  assert.equal(graph.state_schema.state_2.value, "桌宠: 我在。");
  assert.equal(graph.state_schema.state_3.value, "当前路径: /editor");
  assert.equal(graph.state_schema[COMPANION_REPLY_STATE_KEY].value, "");
  assert.equal(graph.nodes.input_user_message.kind, "input");
  assert.equal(graph.nodes.input_user_message.config.value, "帮我看当前页面");
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
