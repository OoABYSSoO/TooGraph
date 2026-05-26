import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { AgentNode, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { BuddyMemoryReviewTemplateBinding, BuddyRunTemplateBinding } from "../types/buddy.ts";

import {
  BUDDY_REVIEW_TEMPLATE_ID,
  BUDDY_MODE_OPTIONS,
  BUDDY_REPLY_STATE_KEY,
  buildBuddyChatGraph as buildBuddyChatGraphPayload,
  buildBuddyReviewGraph,
  formatBuddyHistory,
  resolveBuddyReplyFromRunEvent,
  resolveBuddyRunActivityFromRunEvent,
  resolveBuddyRunTraceFromRunEvent,
  resolveBuddyMode,
  resolveBuddyReplyText,
} from "./buddyChatGraph.ts";

function createTemplate(): TemplateRecord {
  return {
    template_id: "basic_buddy_loop",
    label: "伙伴对话循环",
    description: "Buddy chat",
    default_graph_name: "伙伴对话循环",
    state_schema: {
      state_1: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      state_2: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#0f766e" },
      state_4: { name: "buddy_reply", description: "", type: "markdown", value: "", color: "#d97706" },
      state_6: { name: "buddy_identity", description: "", type: "markdown", value: "", color: "#a855f7" },
      state_7: { name: "buddy_policy", description: "", type: "markdown", value: "", color: "#dc2626" },
      state_8: { name: "buddy_memory_context", description: "", type: "markdown", value: "", color: "#059669" },
      state_9: { name: "buddy_session_summary", description: "", type: "markdown", value: "", color: "#4f46e5" },
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
      input_buddy_identity: {
        kind: "input",
        name: "input_buddy_identity",
        description: "",
        ui: { position: { x: 80, y: 1680 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_6", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_policy: {
        kind: "input",
        name: "input_buddy_policy",
        description: "",
        ui: { position: { x: 80, y: 2080 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_7", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_memory_context: {
        kind: "input",
        name: "input_buddy_memory_context",
        description: "",
        ui: { position: { x: 80, y: 2480 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_8", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_session_summary: {
        kind: "input",
        name: "input_buddy_session_summary",
        description: "",
        ui: { position: { x: 80, y: 2880 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_9", mode: "replace" }],
        config: { value: "" },
      },
      buddy_reply_agent: {
        kind: "agent",
        name: "buddy_reply_agent",
        description: "",
        ui: { position: { x: 640, y: 360 }, collapsed: false },
        reads: [
          { state: "state_1", required: true },
          { state: "state_2", required: false },
          { state: "state_6", required: false },
          { state: "state_7", required: false },
          { state: "state_8", required: false },
          { state: "state_9", required: false },
        ],
        writes: [{ state: "state_4", mode: "replace" }],
        config: {
          actionKey: "graph_editor",
          actionBindings: [{ actionKey: "graph_editor", enabled: true }],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.4,
        },
      },
      output_buddy_reply: {
        kind: "output",
        name: "output_buddy_reply",
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
      { source: "input_user_message", target: "buddy_reply_agent" },
      { source: "input_conversation_history", target: "buddy_reply_agent" },
      { source: "input_buddy_identity", target: "buddy_reply_agent" },
      { source: "input_buddy_policy", target: "buddy_reply_agent" },
      { source: "input_buddy_memory_context", target: "buddy_reply_agent" },
      { source: "input_buddy_session_summary", target: "buddy_reply_agent" },
      { source: "buddy_reply_agent", target: "output_buddy_reply" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

function createAgenticTemplate(): TemplateRecord {
  return {
    template_id: "buddy_autonomous_loop",
    label: "伙伴自主工具循环",
    description: "Agentic buddy loop",
    default_graph_name: "伙伴自主工具循环",
    state_schema: {
      state_1: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      state_2: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#0f766e" },
      state_16: { name: "approval_prompt", description: "", type: "markdown", value: "", color: "#ea580c" },
      state_25: { name: "direct_reply", description: "", type: "markdown", value: "", color: "#d97706" },
      state_26: { name: "denied_reply", description: "", type: "markdown", value: "", color: "#a16207" },
      state_27: { name: "public_response", description: "", type: "markdown", value: "", color: "#4f46e5" },
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
        ui: { position: { x: 80, y: 500 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_2", mode: "replace" }],
        config: { value: "" },
      },
      request_approval_agent: {
        kind: "agent",
        name: "request_approval_agent",
        description: "",
        ui: { position: { x: 760, y: 80 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_16", mode: "replace" }],
        config: {
          actionKey: "",
          actionBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.2,
        },
      },
      output_public_response: {
        kind: "output",
        name: "output_public_response",
        description: "",
        ui: { position: { x: 1440, y: 80 }, collapsed: false },
        reads: [{ state: "state_27", required: false }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      interrupt_after: ["request_approval_agent"],
    },
  };
}

function createRuntimeBoundTemplate(): TemplateRecord {
  return {
    template_id: "buddy_autonomous_loop",
    label: "伙伴自主循环",
    description: "Runtime-bound Buddy loop",
    default_graph_name: "伙伴自主循环",
    status: "active",
    state_schema: {
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#d97706" },
      buddy_context: {
        name: "buddy_context",
        description: "",
        type: "file",
        value: {
          kind: "local_folder",
          root: "buddy_home",
          selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
        },
        color: "#0f766e",
      },
    },
    nodes: {
      input_user_message: {
        kind: "input",
        name: "用户消息",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "user_message", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_context: {
        kind: "input",
        name: "Buddy Home",
        description: "",
        ui: { position: { x: 0, y: 160 } },
        reads: [],
        writes: [{ state: "buddy_context", mode: "replace" }],
        config: {
          boundaryType: "file",
          value: {
            kind: "local_folder",
            root: "buddy_home",
            selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      buddyRuntimeInputBindings: {
        input_user_message: "current_message",
      },
    },
  };
}

function createReviewTemplate(): TemplateRecord {
  return {
    template_id: "buddy_autonomous_review",
    label: "自主复盘",
    description: "Review buddy turns after the visible reply and produce reviewable improvement candidates.",
    default_graph_name: "自主复盘",
    status: "active",
    state_schema: {
      source_run_id: { name: "source_run_id", description: "", type: "text", value: "", color: "#475569" },
      current_session_id: { name: "current_session_id", description: "", type: "text", value: "", color: "#475569" },
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#d97706" },
      conversation_history: { name: "conversation_history", description: "", type: "json", value: {}, color: "#64748b" },
      buddy_context: {
        name: "buddy_context",
        description: "",
        type: "file",
        value: {
          kind: "local_folder",
          root: "buddy_home",
          selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
        },
        color: "#0f766e",
      },
      request_understanding: { name: "request_understanding", description: "", type: "json", value: {}, color: "#16a34a" },
      capability_result: { name: "capability_result", description: "", type: "result_package", value: {}, color: "#0284c7" },
      capability_review: { name: "capability_review", description: "", type: "json", value: {}, color: "#0f766e" },
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#16a34a" },
      autonomous_review: { name: "autonomous_review", description: "", type: "json", value: {}, color: "#9333ea" },
      improvement_candidates: { name: "improvement_candidates", description: "", type: "json", value: [], color: "#7c3aed" },
      memory_update_plan: { name: "memory_update_plan", description: "", type: "json", value: { has_updates: true, commands: [{ action: "stale" }] }, color: "#22c55e" },
      user_context_update_plan: { name: "user_context_update_plan", description: "", type: "json", value: { has_updates: true, commands: [{ action: "stale" }] }, color: "#2563eb" },
      structured_memory_update_plan: { name: "structured_memory_update_plan", description: "", type: "json", value: { has_updates: true, commands: [{ action: "stale" }] }, color: "#14b8a6" },
      memory_review_result: { name: "memory_review_result", description: "", type: "markdown", value: "stale", color: "#0369a1" },
      user_context_review_result: { name: "user_context_review_result", description: "", type: "markdown", value: "stale", color: "#1d4ed8" },
      memory_write_success: { name: "memory_write_success", description: "", type: "boolean", value: true, color: "#16a34a" },
      applied_memory_commands: { name: "applied_memory_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#059669" },
      skipped_memory_commands: { name: "skipped_memory_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#dc2626" },
      memory_write_result: { name: "memory_write_result", description: "", type: "markdown", value: "stale", color: "#15803d" },
      user_context_write_success: { name: "user_context_write_success", description: "", type: "boolean", value: true, color: "#2563eb" },
      applied_user_context_commands: { name: "applied_user_context_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#1d4ed8" },
      skipped_user_context_commands: { name: "skipped_user_context_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#dc2626" },
      user_context_write_result: { name: "user_context_write_result", description: "", type: "markdown", value: "stale", color: "#1d4ed8" },
      structured_memory_write_success: { name: "structured_memory_write_success", description: "", type: "boolean", value: true, color: "#0d9488" },
      applied_structured_memory_commands: { name: "applied_structured_memory_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#0f766e" },
      skipped_structured_memory_commands: { name: "skipped_structured_memory_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#b91c1c" },
      written_structured_memories: { name: "written_structured_memories", description: "", type: "json", value: [{ memory_id: "stale" }], color: "#0f766e" },
      structured_memory_write_result: { name: "structured_memory_write_result", description: "", type: "markdown", value: "stale", color: "#0d9488" },
      buddy_identity_update_plan: { name: "buddy_identity_update_plan", description: "", type: "json", value: { has_updates: true, commands: [{ action: "stale" }], requires_confirmation: true }, color: "#f97316" },
      buddy_identity_review_result: { name: "buddy_identity_review_result", description: "", type: "markdown", value: "stale", color: "#c2410c" },
      buddy_identity_write_success: { name: "buddy_identity_write_success", description: "", type: "boolean", value: true, color: "#ea580c" },
      applied_buddy_identity_commands: { name: "applied_buddy_identity_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#f97316" },
      skipped_buddy_identity_commands: { name: "skipped_buddy_identity_commands", description: "", type: "json", value: [{ action: "stale" }], color: "#dc2626" },
      buddy_identity_write_result: { name: "buddy_identity_write_result", description: "", type: "markdown", value: "stale", color: "#ea580c" },
    },
    nodes: {
      input_source_run_id: {
        kind: "input",
        name: "源运行 ID",
        description: "",
        ui: { position: { x: 80, y: -120 }, collapsed: false },
        reads: [],
        writes: [{ state: "source_run_id", mode: "replace" }],
        config: { value: "" },
      },
      input_current_session_id: {
        kind: "input",
        name: "当前会话 ID",
        description: "",
        ui: { position: { x: 80, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "current_session_id", mode: "replace" }],
        config: { value: "" },
      },
      input_user_message: {
        kind: "input",
        name: "用户消息",
        description: "",
        ui: { position: { x: 80, y: 80 }, collapsed: false },
        reads: [],
        writes: [{ state: "user_message", mode: "replace" }],
        config: { value: "" },
      },
      input_public_response: {
        kind: "input",
        name: "最终回复",
        description: "",
        ui: { position: { x: 80, y: 280 }, collapsed: false },
        reads: [],
        writes: [{ state: "public_response", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_context: {
        kind: "input",
        name: "伙伴 Home",
        description: "",
        ui: { position: { x: 80, y: 360 }, collapsed: false },
        reads: [],
        writes: [{ state: "buddy_context", mode: "replace" }],
        config: {
          boundaryType: "file",
          value: {
            kind: "local_folder",
            root: "buddy_home",
            selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
          },
        },
      },
      decide_autonomous_review: {
        kind: "agent",
        name: "判断自主复盘",
        description: "",
        ui: { position: { x: 640, y: 160 }, collapsed: false },
        reads: [
          { state: "user_message", required: true },
          { state: "public_response", required: true },
        ],
        writes: [
          { state: "autonomous_review", mode: "replace" },
          { state: "improvement_candidates", mode: "replace" },
          { state: "memory_update_plan", mode: "replace" },
          { state: "structured_memory_update_plan", mode: "replace" },
        ],
        config: {
          actionKey: "",
          actionBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.2,
        },
      },
      write_memory_updates: {
        kind: "agent",
        name: "写入 MEMORY.md 更新",
        description: "",
        ui: { position: { x: 1160, y: 160 }, collapsed: false },
        reads: [
          { state: "source_run_id", required: false },
          { state: "memory_update_plan", required: true },
        ],
        writes: [
          { state: "memory_write_success", mode: "replace" },
          { state: "applied_memory_commands", mode: "replace" },
          { state: "skipped_memory_commands", mode: "replace" },
          { state: "memory_write_result", mode: "replace" },
        ],
        config: {
          actionKey: "buddy_home_writer",
          actionBindings: [
            {
              actionKey: "buddy_home_writer",
              outputMapping: {
                success: "memory_write_success",
                applied_commands: "applied_memory_commands",
                skipped_commands: "skipped_memory_commands",
                result: "memory_write_result",
              },
            },
          ],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "low",
          temperature: 0,
        },
      },
    },
    edges: [
      { source: "input_user_message", target: "decide_autonomous_review" },
      { source: "input_public_response", target: "decide_autonomous_review" },
    ],
    conditional_edges: [],
    metadata: {
      internal: true,
      role: "buddy_autonomous_review",
      buddyMemoryReviewRuntimeInputBindings: {
        input_source_run_id: "source_run_id",
      },
    },
  };
}

function createMemoryReviewBinding(): BuddyMemoryReviewTemplateBinding {
  return {
    template_id: "buddy_autonomous_review",
    input_bindings: {
      input_source_run_id: "source_run_id",
    },
  };
}

function createActivityGraph() {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "你好",
    history: [],
    buddyMode: "advisory",
  });
  graph.state_schema.state_10 = { name: "request_understanding", description: "", type: "json", value: {}, color: "#16a34a" };
  graph.state_schema.state_27 = { name: "public_response", description: "", type: "markdown", value: "", color: "#4f46e5" };
  graph.nodes.buddy_turn_intake = {
    kind: "subgraph",
    name: "理解请求",
    description: "",
    ui: { position: { x: 360, y: 120 }, collapsed: false },
    reads: [],
    writes: [],
    config: {
      graph: {
        state_schema: graph.state_schema,
        nodes: {
          understand_request: {
            kind: "agent",
            name: "识别意图",
            description: "",
            ui: { position: { x: 0, y: 0 }, collapsed: false },
            reads: [],
            writes: [{ state: "state_10", mode: "replace" }],
            config: {
              actionKey: "",
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "medium",
              temperature: 0.2,
            },
          },
        },
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
    },
  };
  graph.nodes.buddy_capability_loop = {
    kind: "subgraph",
    name: "能力循环",
    description: "",
    ui: { position: { x: 680, y: 120 }, collapsed: false },
    reads: [],
    writes: [],
    config: {
      graph: {
        state_schema: graph.state_schema,
        nodes: {
          select_capability: {
            kind: "agent",
            name: "选择能力",
            description: "",
            ui: { position: { x: 0, y: 0 }, collapsed: false },
            reads: [],
            writes: [],
            config: {
              actionKey: "toograph_capability_selector",
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "medium",
              temperature: 0.2,
            },
          },
        },
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
    },
  };
  return graph;
}

function buildBuddyChatGraph(
  template: TemplateRecord,
  input: Parameters<typeof buildBuddyChatGraphPayload>[1],
  binding: BuddyRunTemplateBinding = createBuddyRunTemplateBinding(template),
) {
  return buildBuddyChatGraphPayload(template, input, binding);
}

function createBuddyRunTemplateBinding(
  template: TemplateRecord,
  inputBindings: Record<string, BuddyRunTemplateBinding["input_bindings"][string]> = {},
): BuddyRunTemplateBinding {
  const bindings = { ...inputBindings };
  if (!Object.values(bindings).includes("current_message")) {
    const currentMessageNodeId = isBindableInputNodeId(template, "input_user_message")
      ? "input_user_message"
      : findBindableInputNodeId(template);
    if (currentMessageNodeId) {
      bindings[currentMessageNodeId] = "current_message";
    }
  }
  if (!Object.values(bindings).includes("conversation_history")) {
    if (isBindableInputNodeId(template, "input_conversation_history")) {
      bindings.input_conversation_history = "conversation_history";
    }
  }
  if (!Object.values(bindings).includes("buddy_home_context")) {
    if (isBindableInputNodeId(template, "input_buddy_context")) {
      bindings.input_buddy_context = "buddy_home_context";
    }
  }
  if (!Object.values(bindings).includes("current_session_id")) {
    if (isBindableInputNodeId(template, "input_current_session_id")) {
      bindings.input_current_session_id = "current_session_id";
    }
  }
  return {
    template_id: template.template_id,
    input_bindings: bindings,
  };
}

function findBindableInputNodeId(template: TemplateRecord) {
  return Object.entries(template.nodes).find(([, node]) => node.kind === "input" && isBindableInput(template, node))?.[0] ?? "";
}

function isBindableInputNodeId(template: TemplateRecord, nodeId: string) {
  const node = template.nodes[nodeId];
  return Boolean(node && isBindableInput(template, node));
}

function isBindableInput(template: TemplateRecord, node: TemplateRecord["nodes"][string]) {
  return node.kind === "input" && node.writes.length === 1 && Boolean(template.state_schema[node.writes[0].state]);
}

function assertInputNode(node: TemplateRecord["nodes"][string]): asserts node is InputNode {
  assert.equal(node.kind, "input");
}

function assertAgentNode(node: TemplateRecord["nodes"][string]): asserts node is AgentNode {
  assert.equal(node.kind, "agent");
}

function assertContextPackage(value: unknown) {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  const packageValue = value as Record<string, unknown>;
  assert.equal(packageValue.kind, "context_package");
  assert.equal(packageValue.source_kind, "session");
  assert.equal(packageValue.authority, "history");
  assert.equal(typeof packageValue.package_id, "string");
  assert.equal(Array.isArray(packageValue.items), true);
  assert.equal(Array.isArray(packageValue.source_refs), true);
  assert.equal("rendered_text" in packageValue, false);
  assert.equal("text" in packageValue, false);
  const ref = packageValue.context_ref as Record<string, unknown>;
  assert.equal(typeof ref, "object");
  assert.notEqual(ref, null);
  assert.equal(Array.isArray(ref), false);
  assert.equal(ref.kind, "context_assembly_ref");
  assert.equal(ref.target_state_key, "conversation_history");
  assert.equal(ref.renderer_key, "buddy_history");
  assert.equal(ref.renderer_version, "1");
  assert.equal(typeof ref.assembly_id, "string");
  assert.equal(typeof ref.source_count, "number");
  assert.equal("rendered_text" in ref, false);
  assert.equal("text" in ref, false);
  return packageValue;
}

test("formatBuddyHistory keeps a compact readable transcript", () => {
  assert.equal(
    formatBuddyHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: "我在。" },
    ]),
    "用户: 你好\n伙伴: 我在。",
  );
});

test("formatBuddyHistory budgets long history and keeps compact omitted entries", () => {
  const history = formatBuddyHistory(
    [
      { role: "user", content: "old user detail " + "A".repeat(80) },
      { role: "assistant", content: "old assistant detail " + "B".repeat(80) },
      { role: "user", content: "recent user detail " + "C".repeat(30) },
      { role: "assistant", content: "recent assistant detail " + "D".repeat(30) },
    ],
    12,
    120,
  );

  assert.match(history, /省略的历史对话/);
  assert.match(history, /omitted_count: 2/);
  assert.match(history, /用户: old user detail/);
  assert.doesNotMatch(history, /A{40}/);
  assert.match(history, /用户: recent user detail/);
  assert.match(history, /伙伴: recent assistant detail/);
});

test("formatBuddyHistory ignores messages marked outside the model context", () => {
  assert.equal(
    formatBuddyHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: "运行失败：GET /api/runs/run_1 failed with status 500", includeInContext: false },
      { role: "user", content: "继续" },
    ]),
    "用户: 你好\n用户: 继续",
  );
});

test("buddy mode options expose ask-first and full-access tiers", () => {
  assert.deepEqual(
    BUDDY_MODE_OPTIONS.map((option) => ({ value: option.value, disabled: option.disabled })),
    [
      { value: "ask_first", disabled: false },
      { value: "full_access", disabled: false },
    ],
  );
});

test("resolveBuddyMode accepts current tiers and migrates legacy values", () => {
  assert.equal(resolveBuddyMode("ask_first"), "ask_first");
  assert.equal(resolveBuddyMode("full_access"), "full_access");
  assert.equal(resolveBuddyMode("advisory"), "ask_first");
  assert.equal(resolveBuddyMode("approval"), "ask_first");
  assert.equal(resolveBuddyMode("unrestricted"), "full_access");
  assert.equal(resolveBuddyMode("unknown"), "ask_first");
});

test("buddy review uses a separate internal autonomous review template id", () => {
  assert.equal(BUDDY_REVIEW_TEMPLATE_ID, "buddy_autonomous_review");
});

test("buildBuddyReviewGraph hydrates an internal autonomous review run from the visible chat run", () => {
  const graph = buildBuddyReviewGraph(createReviewTemplate(), {
    mainRun: {
      run_id: "run_visible_1",
      graph_id: null,
      graph_name: "伙伴自主循环",
      status: "completed",
      runtime_backend: "langgraph",
      lifecycle: { updated_at: "", resume_count: 0 },
      checkpoint_metadata: { available: false },
      revision_round: 1,
      started_at: "",
      metadata: {},
      selected_actions: [],
      action_outputs: [],
      evaluation_result: {},
      memory_summary: "",
      final_result: "",
      node_status_map: {},
      node_executions: [],
      warnings: [],
      errors: [],
      output_previews: [],
      artifacts: {
        state_values: {
          public_response: "你好，我在。",
        },
      },
      state_snapshot: {
        values: {
          user_message: "你好",
          public_response: "你好，我在。",
        },
        last_writers: {},
      },
      graph_snapshot: {
        state_schema: {
          user_message: { name: "user_message" },
          public_response: { name: "public_response" },
        },
      },
    } as RunDetail,
    binding: createMemoryReviewBinding(),
    currentSessionId: "session_live_1",
    buddyModel: "openai/gpt-4.1",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "自主复盘");
  assert.equal(graph.metadata.buddy_review_run, true);
  assert.equal(graph.metadata.buddy_parent_run_id, "run_visible_1");
  assert.equal(graph.metadata.internal, true);
  assert.equal(graph.state_schema.source_run_id.value, "run_visible_1");
  assert.equal(graph.state_schema.current_session_id.value, "");
  assert.equal(graph.state_schema.user_message.value, "");
  assert.equal(graph.state_schema.public_response.value, "");
  assert.deepEqual(graph.state_schema.buddy_context.value, {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
  });
  assert.deepEqual(graph.state_schema.autonomous_review.value, {});
  assert.deepEqual(graph.state_schema.improvement_candidates.value, []);
  assert.deepEqual(graph.state_schema.memory_update_plan.value, { has_updates: false, commands: [] });
  assert.deepEqual(graph.state_schema.user_context_update_plan.value, { has_updates: false, commands: [] });
  assert.deepEqual(graph.state_schema.structured_memory_update_plan.value, { has_updates: false, commands: [] });
  assert.equal(graph.state_schema.memory_review_result.value, "");
  assert.equal(graph.state_schema.user_context_review_result.value, "");
  assert.equal(graph.state_schema.memory_write_success.value, false);
  assert.deepEqual(graph.state_schema.applied_memory_commands.value, []);
  assert.deepEqual(graph.state_schema.skipped_memory_commands.value, []);
  assert.equal(graph.state_schema.memory_write_result.value, "");
  assert.equal(graph.state_schema.user_context_write_success.value, false);
  assert.deepEqual(graph.state_schema.applied_user_context_commands.value, []);
  assert.deepEqual(graph.state_schema.skipped_user_context_commands.value, []);
  assert.equal(graph.state_schema.user_context_write_result.value, "");
  assert.equal(graph.state_schema.structured_memory_write_success.value, false);
  assert.deepEqual(graph.state_schema.applied_structured_memory_commands.value, []);
  assert.deepEqual(graph.state_schema.skipped_structured_memory_commands.value, []);
  assert.deepEqual(graph.state_schema.written_structured_memories.value, []);
  assert.equal(graph.state_schema.structured_memory_write_result.value, "");
  assert.deepEqual(graph.state_schema.buddy_identity_update_plan.value, { has_updates: false, requires_confirmation: false, commands: [] });
  assert.equal(graph.state_schema.buddy_identity_review_result.value, "");
  assert.equal(graph.state_schema.buddy_identity_write_success.value, false);
  assert.deepEqual(graph.state_schema.applied_buddy_identity_commands.value, []);
  assert.deepEqual(graph.state_schema.skipped_buddy_identity_commands.value, []);
  assert.equal(graph.state_schema.buddy_identity_write_result.value, "");
  assert.equal(graph.state_schema.writeback_commands, undefined);
  assertInputNode(graph.nodes.input_source_run_id);
  assert.equal(graph.nodes.input_source_run_id.config.value, "run_visible_1");
  assertAgentNode(graph.nodes.decide_autonomous_review);
  assert.equal(graph.nodes.decide_autonomous_review.config.modelSource, "override");
  assert.equal(graph.nodes.decide_autonomous_review.config.model, "openai/gpt-4.1");
});

test("buildBuddyChatGraph records ask-first mode without injecting permission or catalog inputs", () => {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    buddyMode: "ask_first",
  });

  assert.equal(graph.state_schema.buddy_mode, undefined);
  assert.equal(graph.state_schema.action_catalog_snapshot, undefined);
  assert.equal(graph.nodes.input_buddy_mode, undefined);
  assert.equal(graph.nodes.input_action_catalog_snapshot, undefined);
  assert.deepEqual(graph.metadata.interrupt_after, ["request_approval_agent"]);
  assert.equal(graph.metadata.buddy_mode, "ask_first");
  assert.equal(graph.metadata.buddy_requires_approval, true);
  assert.equal(graph.metadata.agent_breakpoint_timing, undefined);
});

test("buildBuddyChatGraph injects only configured input-node bindings", () => {
  const graph = buildBuddyChatGraph(
    createTemplate(),
    {
      userMessage: "帮我看当前页面",
      history: [{ id: "msg_assistant_1", role: "assistant", content: "我在。" }],
      buddyMode: "full_access",
    },
    {
      template_id: "basic_buddy_loop",
      input_bindings: {
        input_user_message: "current_message",
        input_conversation_history: "conversation_history",
      },
    },
  );

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "伙伴对话循环");
  assert.equal(graph.state_schema.state_1.value, "帮我看当前页面");
  const stateHistoryPackage = assertContextPackage(graph.state_schema.state_2.value);
  assert.equal(stateHistoryPackage.source_count, 1);
  assert.equal(graph.state_schema[BUDDY_REPLY_STATE_KEY].value, "");
  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_conversation_history);
  assert.equal(graph.nodes.input_user_message.config.value, "帮我看当前页面");
  const nodeHistoryPackage = assertContextPackage(graph.nodes.input_conversation_history.config.value);
  assert.equal(nodeHistoryPackage.source_count, 1);
  assert.deepEqual(nodeHistoryPackage.source_refs, [
    {
      source_kind: "buddy_message",
      source_id: "msg_assistant_1",
      role: "assistant",
      ordinal: 0,
    },
  ]);
  assert.equal(graph.metadata.origin, "buddy");
  assert.equal(graph.metadata.buddy_mode, "full_access");
  assert.equal(graph.metadata.buddy_can_execute_actions, true);
  assert.deepEqual(graph.metadata.buddy_template_binding, {
    template_id: "basic_buddy_loop",
    input_bindings: {
      input_user_message: "current_message",
      input_conversation_history: "conversation_history",
    },
  });
  assert.equal(graph.metadata.buddy_run, undefined);
  assert.equal(graph.metadata.buddy_permission_tier, undefined);
  assert.equal(graph.metadata.buddy_graph_patch_drafts_enabled, undefined);
  assertAgentNode(graph.nodes.buddy_reply_agent);
  assert.equal(graph.nodes.buddy_reply_agent.config.actionKey, "graph_editor");
  assert.deepEqual(graph.nodes.buddy_reply_agent.config.actionBindings, [{ actionKey: "graph_editor", enabled: true }]);
});

test("buildBuddyChatGraph applies template runtime input bindings and leaves fixed input values intact", () => {
  const graph = buildBuddyChatGraph(
    createRuntimeBoundTemplate(),
    {
      userMessage: "检查绑定页规则",
      history: [],
      currentSessionId: "session_live_1",
    },
    {
      template_id: "buddy_autonomous_loop",
      input_bindings: {},
    },
  );

  assert.equal(graph.state_schema.user_message.value, "检查绑定页规则");
  assertInputNode(graph.nodes.input_user_message);
  assert.equal(graph.nodes.input_user_message.config.value, "检查绑定页规则");
  assertInputNode(graph.nodes.input_buddy_context);
  assert.deepEqual(graph.nodes.input_buddy_context.config.value, {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
  });
  assert.deepEqual(graph.state_schema.buddy_context.value, {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
  });
});

test("buildBuddyChatGraph injects the current session id when the template binds it", () => {
  const template = createTemplate();
  template.state_schema.current_session_id = {
    name: "current_session_id",
    description: "",
    type: "text",
    value: "",
    color: "#475569",
  };
  template.nodes.input_current_session_id = {
    kind: "input",
    name: "input_current_session_id",
    description: "",
    ui: { position: { x: 80, y: 1280 }, collapsed: false },
    reads: [],
    writes: [{ state: "current_session_id", mode: "replace" }],
    config: { value: "" },
  };

  const graph = buildBuddyChatGraph(
    template,
    {
      userMessage: "帮我找上次聊过的记忆策略",
      history: [],
      currentSessionId: "session_live_1",
    },
    {
      template_id: "basic_buddy_loop",
      input_bindings: {
        input_user_message: "current_message",
        input_current_session_id: "current_session_id",
      },
    },
  );

  assert.equal(graph.state_schema.current_session_id.value, "session_live_1");
  assertInputNode(graph.nodes.input_current_session_id);
  assert.equal(graph.nodes.input_current_session_id.config.value, "session_live_1");
});

test("buildBuddyChatGraph feeds official loop conversation history and session summary inputs", () => {
  const template = createTemplate();
  template.state_schema.existing_session_summary = {
    name: "existing_session_summary",
    description: "",
    type: "markdown",
    value: "",
    color: "#4f46e5",
  };
  template.nodes.input_existing_session_summary = {
    kind: "input",
    name: "input_existing_session_summary",
    description: "",
    ui: { position: { x: 80, y: 1920 }, collapsed: false },
    reads: [],
    writes: [{ state: "existing_session_summary", mode: "replace" }],
    config: { value: "" },
  };
  const history = Array.from({ length: 18 }, (_, index) => ({
    id: `msg_${index}`,
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `turn-${index}`,
  }));

  const graph = buildBuddyChatGraph(
    template,
    {
      userMessage: "continue",
      history,
      sessionSummary: "summary-so-far",
    },
    {
      template_id: "basic_buddy_loop",
      input_bindings: {
        input_user_message: "current_message",
        input_conversation_history: "conversation_history",
        input_existing_session_summary: "session_summary",
      },
    },
  );

  assert.equal(graph.state_schema.existing_session_summary.value, "summary-so-far");
  const historyPackage = assertContextPackage(graph.nodes.input_conversation_history.config.value);
  const sourceRefs = historyPackage.source_refs as Array<Record<string, unknown>>;
  assert.equal(historyPackage.source_count, 13);
  assert.equal((historyPackage.context_ref as Record<string, unknown>).source_count, 13);
  assert.deepEqual(sourceRefs[0], {
    source_kind: "buddy_session_summary",
    source_id: "session_summary",
    role: "summary",
    ordinal: 0,
  });
  assert.equal(sourceRefs.at(-1)?.source_id, "msg_17");
  assert.equal(
    sourceRefs.some((source) => source.source_id === "msg_0"),
    false,
  );
});

test("buildBuddyChatGraph marks ask-first mode without a blanket reply breakpoint", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "请帮我生成一个图修改草案",
    history: [],
    buddyMode: "ask_first",
  });

  assert.equal(graph.metadata.origin, "buddy");
  assert.equal(graph.metadata.buddy_mode, "ask_first");
  assert.equal(graph.metadata.buddy_can_execute_actions, false);
  assert.equal(graph.metadata.buddy_requires_approval, true);
  assert.equal(graph.metadata.buddy_run, undefined);
  assert.equal(graph.metadata.buddy_permission_tier, undefined);
  assert.equal(graph.metadata.buddy_graph_patch_drafts_enabled, undefined);
  assert.equal(graph.metadata.interrupt_after, undefined);
  assert.equal(graph.metadata.agent_breakpoint_timing, undefined);
  assert.deepEqual(graph.metadata.capability_permission_policy, {
    allowed_permission_tiers: ["none", "guarded", "external", "risky"],
    approval_required_permission_tiers: ["risky"],
  });
});

test("buildBuddyChatGraph records full-access capability policy without approval-required tiers", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "请直接执行可用能力",
    history: [],
    buddyMode: "full_access",
  });

  assert.equal(graph.metadata.buddy_mode, "full_access");
  assert.deepEqual(graph.metadata.capability_permission_policy, {
    allowed_permission_tiers: ["none", "guarded", "external", "risky"],
    approval_required_permission_tiers: [],
  });
});

test("buildBuddyChatGraph carries page operation context for action runtime", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "打开运行历史",
    history: [],
    pageOperationContext: {
      page_path: "/editor",
      page_operation_book: {
        page: { path: "/editor", title: "图编辑器", snapshotId: "snapshot-graph" },
        allowedOperations: [
          {
            targetId: "app.nav.runs",
            label: "运行历史",
            role: "navigation-link",
            commands: ["click app.nav.runs"],
            resultHint: { path: "/runs" },
          },
        ],
        inputs: [],
        unavailable: [],
        forbidden: ["伙伴自身区域不可操作"],
      },
    },
    buddyMode: "ask_first",
  });

  assert.deepEqual(graph.metadata.action_runtime_context, {
    page_path: "/editor",
    page_operation_book: {
      page: { path: "/editor", title: "图编辑器", snapshotId: "snapshot-graph" },
      allowedOperations: [
        {
          targetId: "app.nav.runs",
          label: "运行历史",
          role: "navigation-link",
          commands: ["click app.nav.runs"],
          resultHint: { path: "/runs" },
        },
      ],
      inputs: [],
      unavailable: [],
      forbidden: ["伙伴自身区域不可操作"],
    },
  });
});

test("buildBuddyChatGraph overrides template agent models with the buddy model", () => {
  const template = createTemplate();
  const templateAgent = template.nodes.buddy_reply_agent;
  assertAgentNode(templateAgent);
  templateAgent.config.modelSource = "override";
  templateAgent.config.model = "template-selected-model";

  const graph = buildBuddyChatGraph(template, {
    userMessage: "你好",
    history: [],
    buddyMode: "advisory",
    buddyModel: "openai/gpt-4.1",
  });

  assertAgentNode(graph.nodes.buddy_reply_agent);
  assert.equal(graph.nodes.buddy_reply_agent.config.modelSource, "override");
  assert.equal(graph.nodes.buddy_reply_agent.config.model, "openai/gpt-4.1");
  assert.equal(graph.metadata.buddy_model_ref, "openai/gpt-4.1");
});

test("buildBuddyChatGraph stores buddy session ids as runtime context metadata", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "继续",
    history: [],
    currentSessionId: "session_123",
    currentMessageId: "msg_current",
    buddyMode: "advisory",
  });

  assert.deepEqual(graph.metadata.runtime_context, {
    invocation_source: "buddy_chat",
    buddy_session_id: "session_123",
    buddy_current_message_id: "msg_current",
  });
});

test("buildBuddyChatGraph leaves unbound durable context states for graph template actions", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "你好",
    history: [],
    buddyMode: "advisory",
  });

  assert.equal(graph.state_schema.state_6.value, "");
  assert.equal(graph.state_schema.state_7.value, "");
  assert.equal(graph.state_schema.state_8.value, "");
  assert.equal(graph.state_schema.state_9.value, "");
});

test("resolveBuddyReplyText prefers the buddy reply state over fallback text", () => {
  const run = {
    final_result: "fallback",
    state_snapshot: {
      values: {
        [BUDDY_REPLY_STATE_KEY]: "我看到了。",
      },
      last_writers: {},
    },
    artifacts: {
      state_values: {},
    },
    output_previews: [],
  } as unknown as RunDetail;

  assert.equal(resolveBuddyReplyText(run), "我看到了。");
});

test("resolveBuddyReplyFromRunEvent recognizes reply states by graph state name", () => {
  const graph = {
    state_schema: {
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      visible_reply: { name: "visible_reply", description: "", type: "markdown", value: "", color: "#0f766e" },
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#4f46e5" },
    },
  };

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "state.updated",
        state_key: "visible_reply",
        value: "我先检查项目结构，然后把动作过程放在这里。",
      },
      graph,
    ),
    "我先检查项目结构，然后把动作过程放在这里。",
  );

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "state.updated",
        state_key: "public_response",
        value: "你好，我是 Buddy。",
      },
      graph,
    ),
    "你好，我是 Buddy。",
  );
});

test("resolveBuddyReplyFromRunEvent reads completed output values for named reply states", () => {
  const graph = {
    state_schema: {
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#4f46e5" },
    },
  };

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "node.output.completed",
        output_keys: ["public_response"],
        output_values: {
          public_response: "已经组织好的回复。",
        },
      },
      graph,
    ),
    "已经组织好的回复。",
  );
});

test("resolveBuddyReplyFromRunEvent does not treat request_understanding as visible chat text", () => {
  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "state.updated",
        state_key: "request_understanding",
        value: { intent: "greeting" },
      },
      createAgenticTemplate() as never,
    ),
    "",
  );
});

test("resolveBuddyReplyFromRunEvent streams partial markdown from a structured reply field", () => {
  const graph = {
    state_schema: {
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#4f46e5" },
    },
  };

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "node.output.delta",
        node_id: "draft_public_response",
        output_keys: ["public_response"],
        stream_state_keys: ["public_response"],
        text: '{"public_response":"# 你好\\n我正在',
      },
      graph,
    ),
    "# 你好\n我正在",
  );
});

test("resolveBuddyRunTraceFromRunEvent summarizes streaming output from non-output LLM nodes", () => {
  const graph = createActivityGraph();

  assert.deepEqual(
    resolveBuddyRunTraceFromRunEvent(
      "node.output.delta",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "buddy_turn_intake",
        output_keys: ["state_10"],
        stream_state_keys: ["state_10"],
        text: '{"state_10":"正在识别：这是一个简单问候，不需要调用能力',
      },
      graph,
    ),
    {
      labelKey: "buddy.activity.generatingOutput",
      params: {
        node: "识别意图",
        stage: "理解请求",
      },
      preview: "正在识别：这是一个简单问候，不需要调用能力",
      tone: "stream",
      replaceKey: "node:buddy_turn_intake:understand_request",
      timingKey: "stage:buddy_turn_intake:understand_request",
    },
  );
});

test("resolveBuddyRunTraceFromRunEvent hides aggregate subgraph containers from buddy progress", () => {
  const graph = createActivityGraph();

  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.completed",
      {
        node_id: "buddy_turn_intake",
        node_type: "subgraph",
        status: "success",
        duration_ms: 1534,
      },
      graph,
    ),
    null,
  );
  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.started",
      {
        node_id: "buddy_turn_intake",
        node_type: "subgraph",
      },
      graph,
    ),
    null,
  );
});

test("resolveBuddyRunTraceFromRunEvent keeps real inner node progress visible", () => {
  const graph = createActivityGraph();

  assert.deepEqual(
    resolveBuddyRunTraceFromRunEvent(
      "node.completed",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "buddy_turn_intake",
        status: "success",
        duration_ms: 1534,
      },
      graph,
    ),
    {
      labelKey: "buddy.activity.completed",
      params: {
        node: "识别意图",
        stage: "理解请求",
      },
      preview: "",
      tone: "success",
      replaceKey: "node:buddy_turn_intake:understand_request",
      timingKey: "stage:buddy_turn_intake:understand_request",
      durationMs: 1534,
    },
  );
  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.started",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "buddy_turn_intake",
      },
      graph,
    )?.replaceKey,
    "node:buddy_turn_intake:understand_request",
  );
});

test("resolveBuddyRunTraceFromRunEvent renders low-level activity events", () => {
  const graph = createActivityGraph();

  assert.deepEqual(
    resolveBuddyRunTraceFromRunEvent(
      "activity.event",
      {
        sequence: 2,
        kind: "action_invocation",
        node_id: "select_capability",
        subgraph_node_id: "buddy_capability_loop",
        summary: "Action 'capability_selector' succeeded.",
        status: "succeeded",
        duration_ms: 42,
      },
      graph,
    ),
    {
      labelKey: "buddy.activity.completed",
      params: {
        node: "选择能力",
        stage: "能力循环",
      },
      preview: "Action 'capability_selector' succeeded.",
      tone: "success",
      replaceKey: "activity:buddy_capability_loop:select_capability:2",
      timingKey: "stage:buddy_capability_loop:select_capability",
      durationMs: 42,
    },
  );
});

test("resolveBuddyRunTraceFromRunEvent hides subgraph plumbing from buddy progress", () => {
  const graph = createActivityGraph();

  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.completed",
      {
        node_id: "input_user_message",
        node_type: "input",
        subgraph_node_id: "buddy_turn_intake",
        status: "success",
      },
      graph,
    ),
    null,
  );
  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.completed",
      {
        node_id: "output_public_response",
        node_type: "output",
        subgraph_node_id: "buddy_public_response",
        status: "success",
      },
      graph,
    ),
    null,
  );
  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.output.completed",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "buddy_turn_intake",
        output_keys: ["state_10"],
        stream_state_keys: ["state_10"],
        output_values: {
          state_10: {
            intent: "chat",
          },
        },
      },
      graph,
    ),
    null,
  );
});

test("resolveBuddyRunActivityFromRunEvent describes inner buddy subgraph activity", () => {
  const activity = resolveBuddyRunActivityFromRunEvent(
    "node.started",
    {
      node_id: "understand_request",
      node_type: "agent",
      subgraph_node_id: "buddy_turn_intake",
      subgraph_path: ["buddy_turn_intake"],
    },
    createActivityGraph(),
  );

  assert.deepEqual(activity, {
    labelKey: "buddy.activity.understanding",
    params: {
      node: "识别意图",
      stage: "理解请求",
    },
  });
});

test("resolveBuddyRunActivityFromRunEvent names subgraph containers without duplicating inner phases", () => {
  const activity = resolveBuddyRunActivityFromRunEvent(
    "node.started",
    {
      node_id: "buddy_turn_intake",
      node_type: "subgraph",
    },
    createActivityGraph(),
  );

  assert.deepEqual(activity, {
    labelKey: "buddy.activity.running",
    params: {
      node: "理解请求",
    },
  });
});

test("resolveBuddyRunActivityFromRunEvent reports capability selection and node failures", () => {
  const graph = createActivityGraph();

  assert.deepEqual(
    resolveBuddyRunActivityFromRunEvent(
      "node.started",
      {
        node_id: "select_capability",
        node_type: "agent",
        subgraph_node_id: "buddy_capability_loop",
        subgraph_path: ["buddy_capability_loop"],
      },
      graph,
    ),
    {
      labelKey: "buddy.activity.selectingCapability",
      params: {
        node: "选择能力",
        stage: "能力循环",
      },
    },
  );
  assert.deepEqual(
    resolveBuddyRunActivityFromRunEvent(
      "node.failed",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "buddy_turn_intake",
      },
      graph,
    ),
    {
      labelKey: "buddy.activity.failed",
      params: {
        node: "识别意图",
      },
    },
  );
  assert.equal(
    resolveBuddyRunActivityFromRunEvent(
      "state.updated",
      {
        node_id: "understand_request",
        node_type: "agent",
        state_key: "state_10",
        subgraph_node_id: "buddy_turn_intake",
      },
      graph,
    ),
    null,
  );
});
