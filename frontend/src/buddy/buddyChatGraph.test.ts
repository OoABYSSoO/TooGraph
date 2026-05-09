import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { AgentNode, InputNode, TemplateRecord } from "../types/node-system.ts";

import {
  BUDDY_TEMPLATE_ID,
  BUDDY_MODE_OPTIONS,
  BUDDY_MODE_STATE_KEY,
  BUDDY_REPLY_STATE_KEY,
  buildBuddyChatGraph,
  formatBuddyHistory,
  resolveBuddyMode,
  resolveBuddyReplyText,
} from "./buddyChatGraph.ts";
import type { SkillDefinition } from "../types/skills.ts";

function createTemplate(): TemplateRecord {
  return {
    template_id: "basic_buddy_loop",
    label: "伙伴对话循环",
    description: "Buddy chat",
    default_graph_name: "伙伴对话循环",
    state_schema: {
      state_1: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
      state_2: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#0f766e" },
      state_3: { name: "page_context", description: "", type: "markdown", value: "", color: "#2563eb" },
      state_4: { name: "buddy_reply", description: "", type: "markdown", value: "", color: "#d97706" },
      state_5: { name: "buddy_mode", description: "", type: "text", value: "advisory", color: "#7c3aed" },
      state_6: { name: "buddy_profile", description: "", type: "markdown", value: "", color: "#a855f7" },
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
      input_page_context: {
        kind: "input",
        name: "input_page_context",
        description: "",
        ui: { position: { x: 80, y: 880 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_3", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_mode: {
        kind: "input",
        name: "input_buddy_mode",
        description: "",
        ui: { position: { x: 80, y: 1280 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_5", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_profile: {
        kind: "input",
        name: "input_buddy_profile",
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
          { state: "state_3", required: false },
          { state: "state_5", required: true },
          { state: "state_6", required: false },
          { state: "state_7", required: false },
          { state: "state_8", required: false },
          { state: "state_9", required: false },
        ],
        writes: [{ state: "state_4", mode: "replace" }],
        config: {
          skillKey: "graph_editor",
          skillBindings: [{ skillKey: "graph_editor", enabled: true }],
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
      { source: "input_page_context", target: "buddy_reply_agent" },
      { source: "input_buddy_mode", target: "buddy_reply_agent" },
      { source: "input_buddy_profile", target: "buddy_reply_agent" },
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
          skillKey: "",
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
    llmInstruction: "Choose the query and run the bound web search skill.",
    schemaVersion: "graphite.skill/v1",
    version: "1.0.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {
        buddy: { selectable: true, requiresApproval: false },
      },
    },
    permissions: ["network", "secret_read"],
    runtime: { type: "python", entrypoint: "run.py", timeoutSeconds: 10 },
    inputSchema: [{ key: "query", name: "Query", valueType: "text", required: true, description: "" }],
    outputSchema: [{ key: "citations", name: "Citations", valueType: "json", required: false, description: "" }],
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    sourceScope: "installed",
    sourcePath: "skill/web_search/skill.json",
    runtimeReady: true,
    runtimeRegistered: true,
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

test("formatBuddyHistory keeps a compact readable transcript", () => {
  assert.equal(
    formatBuddyHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: "我在。" },
    ]),
    "用户: 你好\n伙伴: 我在。",
  );
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

test("buddy mode options expose advisory and approval as selectable", () => {
  assert.deepEqual(
    BUDDY_MODE_OPTIONS.map((option) => ({ value: option.value, disabled: option.disabled })),
    [
      { value: "advisory", disabled: false },
      { value: "approval", disabled: false },
      { value: "unrestricted", disabled: true },
    ],
  );
});

test("resolveBuddyMode accepts approval and falls back from unavailable tiers", () => {
  assert.equal(resolveBuddyMode("advisory"), "advisory");
  assert.equal(resolveBuddyMode("approval"), "approval");
  assert.equal(resolveBuddyMode("unrestricted"), "advisory");
  assert.equal(resolveBuddyMode("unknown"), "advisory");
});

test("buddy widget defaults to the autonomous loop template id", () => {
  assert.equal(BUDDY_TEMPLATE_ID, "buddy_autonomous_loop");
});

test("buildBuddyChatGraph keeps no-approval web search auto-selectable in advisory mode", () => {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "advisory",
    skillCatalog: [
      createSkillDefinition(),
      createSkillDefinition({
        skillKey: "restricted_media_fetcher",
        name: "Restricted Media Fetcher",
        description: "Fetch authorized media with approval.",
        capabilityPolicy: {
          default: { selectable: true, requiresApproval: true },
          origins: {
            buddy: { selectable: true, requiresApproval: true },
          },
        },
        permissions: ["network", "file_write"],
      }),
    ],
  });

  const catalog = graph.state_schema.state_7.value as SkillDefinition[];
  assert.equal(graph.name, "伙伴自主工具循环");
  assert.equal(catalog[0].skillKey, "web_search");
  assert.equal(catalog[0].capabilityPolicy.origins.buddy.selectable, true);
  assert.equal(catalog[0].capabilityPolicy.origins.buddy.requiresApproval, false);
  assert.equal(catalog[1].capabilityPolicy.origins.buddy.selectable, false);
  assert.equal(catalog[1].capabilityPolicy.origins.buddy.requiresApproval, true);
  assertInputNode(graph.nodes.input_skill_catalog_snapshot);
  assert.deepEqual(graph.nodes.input_skill_catalog_snapshot.config.value, catalog);
});

test("buildBuddyChatGraph keeps buddy auto-select policy in approval mode and uses the approval breakpoint", () => {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "approval",
    skillCatalog: [createSkillDefinition()],
  });

  const catalog = graph.state_schema.state_7.value as SkillDefinition[];
  assert.equal(catalog[0].capabilityPolicy.origins.buddy.selectable, true);
  assert.deepEqual(graph.metadata.interrupt_after, ["request_approval_agent"]);
  assert.equal(graph.metadata.agent_breakpoint_timing, undefined);
});

test("buildBuddyChatGraph injects the current message, history, and page context", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "帮我看当前页面",
    history: [{ role: "assistant", content: "我在。" }],
    pageContext: "当前路径: /editor",
    buddyMode: "unrestricted",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "伙伴对话循环");
  assert.equal(graph.state_schema.state_1.value, "帮我看当前页面");
  assert.equal(graph.state_schema.state_2.value, "伙伴: 我在。");
  assert.equal(graph.state_schema.state_3.value, "当前路径: /editor");
  assert.equal(graph.state_schema[BUDDY_MODE_STATE_KEY].value, "advisory");
  assert.equal(graph.state_schema[BUDDY_REPLY_STATE_KEY].value, "");
  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_buddy_mode);
  assert.equal(graph.nodes.input_user_message.config.value, "帮我看当前页面");
  assert.equal(graph.nodes.input_buddy_mode.config.value, "advisory");
  assert.equal(graph.metadata.buddy_mode, "advisory");
  assert.equal(graph.metadata.buddy_permission_tier, 1);
  assert.equal(graph.metadata.buddy_can_execute_actions, false);
  assertAgentNode(graph.nodes.buddy_reply_agent);
  assert.equal(graph.nodes.buddy_reply_agent.config.skillKey, "");
  assert.deepEqual(graph.nodes.buddy_reply_agent.config.skillBindings, []);
});

test("buildBuddyChatGraph marks approval mode with a reply breakpoint", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "请帮我生成一个图修改草案",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "approval",
  });

  assert.equal(graph.state_schema[BUDDY_MODE_STATE_KEY].value, "approval");
  assert.equal(graph.metadata.buddy_mode, "approval");
  assert.equal(graph.metadata.buddy_permission_tier, 2);
  assert.equal(graph.metadata.buddy_can_execute_actions, false);
  assert.equal(graph.metadata.buddy_requires_approval, true);
  assert.deepEqual(graph.metadata.interrupt_after, ["buddy_reply_agent"]);
  assert.equal(graph.metadata.agent_breakpoint_timing, undefined);
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
    pageContext: "当前路径: /buddy",
    buddyMode: "advisory",
    buddyModel: "openai/gpt-4.1",
  });

  assertAgentNode(graph.nodes.buddy_reply_agent);
  assert.equal(graph.nodes.buddy_reply_agent.config.modelSource, "override");
  assert.equal(graph.nodes.buddy_reply_agent.config.model, "openai/gpt-4.1");
  assert.equal(graph.metadata.buddy_model_ref, "openai/gpt-4.1");
});

test("buildBuddyChatGraph leaves buddy self config states for graph template skills", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "你好",
    history: [],
    pageContext: "当前路径: /editor/new",
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
