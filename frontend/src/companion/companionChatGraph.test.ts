import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { AgentNode, InputNode, TemplateRecord } from "../types/node-system.ts";

import {
  COMPANION_TEMPLATE_ID,
  COMPANION_MODE_OPTIONS,
  COMPANION_MODE_STATE_KEY,
  COMPANION_REPLY_STATE_KEY,
  buildCompanionChatGraph,
  formatCompanionHistory,
  resolveCompanionMode,
  resolveCompanionReplyText,
} from "./companionChatGraph.ts";
import type { SkillDefinition } from "../types/skills.ts";

function createTemplate(): TemplateRecord {
  return {
    template_id: "basic_companion_loop",
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

function createAgenticTemplate(): TemplateRecord {
  return {
    template_id: "companion_autonomous_loop",
    label: "桌宠自主工具循环",
    description: "Agentic companion loop",
    default_graph_name: "桌宠自主工具循环",
    state_schema: {
      state_1: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      state_2: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#0f766e" },
      state_3: { name: "page_context", description: "", type: "markdown", value: "", color: "#2563eb" },
      state_7: { name: "skill_catalog_snapshot", description: "", type: "json", value: [], color: "#1d4ed8" },
      state_16: { name: "approval_prompt", description: "", type: "markdown", value: "", color: "#ea580c" },
      state_25: { name: "direct_reply", description: "", type: "markdown", value: "", color: "#d97706" },
      state_26: { name: "denied_reply", description: "", type: "markdown", value: "", color: "#a16207" },
      state_27: { name: "final_reply", description: "", type: "markdown", value: "", color: "#4f46e5" },
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
      input_page_context: {
        kind: "input",
        name: "input_page_context",
        description: "",
        ui: { position: { x: 80, y: 920 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_3", mode: "replace" }],
        config: { value: "" },
      },
      input_skill_catalog_snapshot: {
        kind: "input",
        name: "input_skill_catalog_snapshot",
        description: "",
        ui: { position: { x: 80, y: 1340 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_7", mode: "replace" }],
        config: { value: [] },
      },
      request_approval_agent: {
        kind: "agent",
        name: "request_approval_agent",
        description: "",
        ui: { position: { x: 760, y: 80 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_16", mode: "replace" }],
        config: {
          skills: [],
          skillBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.2,
        },
      },
      output_final_reply: {
        kind: "output",
        name: "output_final_reply",
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

function createSkillDefinition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    skillKey: "web_search",
    name: "Web Search",
    description: "Search the public web.",
    agentInstruction: "Choose the query and run the bound web search skill.",
    schemaVersion: "graphite.skill/v1",
    version: "1.0.0",
    runPolicies: {
      default: { discoverable: true, autoSelectable: false, requiresApproval: false },
      origins: {
        companion: { discoverable: true, autoSelectable: true, requiresApproval: false },
      },
    },
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: ["network", "secret_read"],
    runtime: { type: "python", entrypoint: "run.py", timeoutSeconds: 10 },
    health: { type: "none" },
    inputSchema: [{ key: "query", name: "Query", valueType: "text", required: true, description: "" }],
    outputSchema: [{ key: "citations", name: "Citations", valueType: "json", required: false, description: "" }],
    supportedValueTypes: ["text", "json", "markdown"],
    sideEffects: ["network", "secret_read"],
    agentNodeEligibility: "ready",
    agentNodeBlockers: [],
    sourceFormat: "native",
    sourceScope: "installed",
    sourcePath: "skill/web_search/skill.json",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
    ...overrides,
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

test("companion mode options expose advisory and approval as selectable", () => {
  assert.deepEqual(
    COMPANION_MODE_OPTIONS.map((option) => ({ value: option.value, disabled: option.disabled })),
    [
      { value: "advisory", disabled: false },
      { value: "approval", disabled: false },
      { value: "unrestricted", disabled: true },
    ],
  );
});

test("resolveCompanionMode accepts approval and falls back from unavailable tiers", () => {
  assert.equal(resolveCompanionMode("advisory"), "advisory");
  assert.equal(resolveCompanionMode("approval"), "approval");
  assert.equal(resolveCompanionMode("unrestricted"), "advisory");
  assert.equal(resolveCompanionMode("unknown"), "advisory");
});

test("companion pet defaults to the autonomous loop template id", () => {
  assert.equal(COMPANION_TEMPLATE_ID, "companion_autonomous_loop");
});

test("buildCompanionChatGraph keeps no-approval web search auto-selectable in advisory mode", () => {
  const graph = buildCompanionChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    companionMode: "advisory",
    skillCatalog: [
      createSkillDefinition(),
      createSkillDefinition({
        skillKey: "restricted_media_fetcher",
        name: "Restricted Media Fetcher",
        description: "Fetch authorized media with approval.",
        runPolicies: {
          default: { discoverable: true, autoSelectable: false, requiresApproval: true },
          origins: {
            companion: { discoverable: true, autoSelectable: true, requiresApproval: true },
          },
        },
        permissions: ["network", "file_write"],
        sideEffects: ["network", "file_write"],
      }),
    ],
  });

  const catalog = graph.state_schema.state_7.value as SkillDefinition[];
  assert.equal(graph.name, "桌宠自主工具循环");
  assert.equal(catalog[0].skillKey, "web_search");
  assert.equal(catalog[0].runPolicies.origins.companion.autoSelectable, true);
  assert.equal(catalog[0].runPolicies.origins.companion.requiresApproval, false);
  assert.equal(catalog[1].runPolicies.origins.companion.autoSelectable, false);
  assert.equal(catalog[1].runPolicies.origins.companion.requiresApproval, true);
  assertInputNode(graph.nodes.input_skill_catalog_snapshot);
  assert.deepEqual(graph.nodes.input_skill_catalog_snapshot.config.value, catalog);
});

test("buildCompanionChatGraph keeps companion auto-select policy in approval mode and uses the approval breakpoint", () => {
  const graph = buildCompanionChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    companionMode: "approval",
    skillCatalog: [createSkillDefinition()],
  });

  const catalog = graph.state_schema.state_7.value as SkillDefinition[];
  assert.equal(catalog[0].runPolicies.origins.companion.autoSelectable, true);
  assert.deepEqual(graph.metadata.interrupt_after, ["request_approval_agent"]);
  assert.deepEqual(graph.metadata.agent_breakpoint_timing, { request_approval_agent: "after" });
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

test("buildCompanionChatGraph marks approval mode with a reply breakpoint", () => {
  const graph = buildCompanionChatGraph(createTemplate(), {
    userMessage: "请帮我生成一个图修改草案",
    history: [],
    pageContext: "当前路径: /editor",
    companionMode: "approval",
  });

  assert.equal(graph.state_schema[COMPANION_MODE_STATE_KEY].value, "approval");
  assert.equal(graph.metadata.companion_mode, "approval");
  assert.equal(graph.metadata.companion_permission_tier, 2);
  assert.equal(graph.metadata.companion_can_execute_actions, false);
  assert.equal(graph.metadata.companion_requires_approval, true);
  assert.deepEqual(graph.metadata.interrupt_after, ["companion_reply_agent"]);
  assert.deepEqual(graph.metadata.agent_breakpoint_timing, { companion_reply_agent: "after" });
});

test("buildCompanionChatGraph overrides template agent models with the companion model", () => {
  const template = createTemplate();
  const templateAgent = template.nodes.companion_reply_agent;
  assertAgentNode(templateAgent);
  templateAgent.config.modelSource = "override";
  templateAgent.config.model = "template-selected-model";

  const graph = buildCompanionChatGraph(template, {
    userMessage: "你好",
    history: [],
    pageContext: "当前路径: /companion",
    companionMode: "advisory",
    companionModel: "openai/gpt-4.1",
  });

  assertAgentNode(graph.nodes.companion_reply_agent);
  assert.equal(graph.nodes.companion_reply_agent.config.modelSource, "override");
  assert.equal(graph.nodes.companion_reply_agent.config.model, "openai/gpt-4.1");
  assert.equal(graph.metadata.companion_model_ref, "openai/gpt-4.1");
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
