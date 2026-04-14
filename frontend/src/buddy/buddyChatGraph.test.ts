import test from "node:test";
import assert from "node:assert/strict";

import type { RunDetail } from "../types/run.ts";
import type { AgentNode, InputNode, TemplateRecord } from "../types/node-system.ts";

import {
  BUDDY_REVIEW_TEMPLATE_ID,
  BUDDY_TEMPLATE_ID,
  BUDDY_MODE_OPTIONS,
  BUDDY_MODE_STATE_KEY,
  BUDDY_REPLY_STATE_KEY,
  buildBuddyChatGraph,
  buildBuddyReviewGraph,
  formatBuddyHistory,
  resolveBuddyReplyFromRunEvent,
  resolveBuddyRunActivityFromRunEvent,
  resolveBuddyRunTraceFromRunEvent,
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
      state_5: { name: "buddy_mode", description: "", type: "text", value: "ask_first", color: "#7c3aed" },
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

function createReviewTemplate(): TemplateRecord {
  return {
    template_id: "buddy_self_review",
    label: "伙伴后台复盘",
    description: "Review buddy turns after the visible reply.",
    default_graph_name: "伙伴后台复盘",
    status: "active",
    state_schema: {
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#d97706" },
      conversation_history: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#64748b" },
      page_context: { name: "page_context", description: "", type: "markdown", value: "", color: "#0891b2" },
      buddy_context: { name: "buddy_context", description: "", type: "file", value: "", color: "#0f766e" },
      request_understanding: { name: "request_understanding", description: "", type: "json", value: {}, color: "#16a34a" },
      capability_result: { name: "capability_result", description: "", type: "result_package", value: {}, color: "#0284c7" },
      capability_review: { name: "capability_review", description: "", type: "json", value: {}, color: "#0f766e" },
      final_reply: { name: "final_reply", description: "", type: "markdown", value: "", color: "#16a34a" },
      memory_update_plan: { name: "memory_update_plan", description: "", type: "json", value: {}, color: "#22c55e" },
      buddy_evolution_plan: { name: "buddy_evolution_plan", description: "", type: "json", value: {}, color: "#a855f7" },
    },
    nodes: {
      input_user_message: {
        kind: "input",
        name: "用户消息",
        description: "",
        ui: { position: { x: 80, y: 80 }, collapsed: false },
        reads: [],
        writes: [{ state: "user_message", mode: "replace" }],
        config: { value: "" },
      },
      input_final_reply: {
        kind: "input",
        name: "最终回复",
        description: "",
        ui: { position: { x: 80, y: 280 }, collapsed: false },
        reads: [],
        writes: [{ state: "final_reply", mode: "replace" }],
        config: { value: "" },
      },
      decide_memory_update: {
        kind: "agent",
        name: "判断记忆更新",
        description: "",
        ui: { position: { x: 640, y: 160 }, collapsed: false },
        reads: [
          { state: "user_message", required: true },
          { state: "final_reply", required: true },
        ],
        writes: [
          { state: "memory_update_plan", mode: "replace" },
          { state: "buddy_evolution_plan", mode: "replace" },
        ],
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
    },
    edges: [
      { source: "input_user_message", target: "decide_memory_update" },
      { source: "input_final_reply", target: "decide_memory_update" },
    ],
    conditional_edges: [],
    metadata: { internal: true },
  };
}

function createSkillDefinition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    skillKey: "web_search",
    name: "Web Search",
    description: "Search the public web.",
    llmInstruction: "Choose the query and run the bound web search skill.",
    schemaVersion: "toograph.skill/v1",
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
    sourcePath: "skill/official/web_search/skill.json",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
    ...overrides,
  };
}

function createActivityGraph() {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "你好",
    history: [],
    pageContext: "当前路径: /",
    buddyMode: "advisory",
  });
  graph.state_schema.state_10 = { name: "request_understanding", description: "", type: "json", value: {}, color: "#16a34a" };
  graph.state_schema.state_27 = { name: "final_reply", description: "", type: "markdown", value: "", color: "#4f46e5" };
  graph.nodes.intake_request = {
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
              skillKey: "",
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
  graph.nodes.run_capability_cycle = {
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
              skillKey: "toograph_capability_selector",
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

test("buddy widget defaults to the autonomous loop template id", () => {
  assert.equal(BUDDY_TEMPLATE_ID, "buddy_autonomous_loop");
});

test("buildBuddyChatGraph clears visible and final reply states before each run", () => {
  const graph = buildBuddyChatGraph(
    {
      ...createAgenticTemplate(),
      state_schema: {
        visible_reply: { name: "visible_reply", description: "", type: "markdown", value: "旧的即时回复", color: "#0f766e" },
        final_reply: { name: "final_reply", description: "", type: "markdown", value: "旧的最终回复", color: "#4f46e5" },
      },
    },
    {
      userMessage: "继续",
      history: [],
      pageContext: "当前路径: /",
      buddyMode: "ask_first",
    },
  );

  assert.equal(graph.state_schema.visible_reply.value, "");
  assert.equal(graph.state_schema.final_reply.value, "");
});

test("buddy review uses a separate internal template id", () => {
  assert.equal(BUDDY_REVIEW_TEMPLATE_ID, "buddy_self_review");
});

test("buildBuddyReviewGraph hydrates an internal background review run from the visible chat run", () => {
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
      selected_skills: [],
      skill_outputs: [],
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
          final_reply: "你好，我在。",
        },
      },
      state_snapshot: {
        values: {
          user_message: "你好",
          final_reply: "你好，我在。",
        },
        last_writers: {},
      },
      graph_snapshot: {
        state_schema: {
          user_message: { name: "user_message" },
          final_reply: { name: "final_reply" },
        },
      },
    } as RunDetail,
    buddyModel: "openai/gpt-4.1",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "伙伴后台复盘");
  assert.equal(graph.metadata.buddy_review_run, true);
  assert.equal(graph.metadata.buddy_parent_run_id, "run_visible_1");
  assert.equal(graph.metadata.internal, true);
  assert.equal(graph.state_schema.user_message.value, "你好");
  assert.equal(graph.state_schema.final_reply.value, "你好，我在。");
  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_final_reply);
  assert.equal(graph.nodes.input_user_message.config.value, "你好");
  assert.equal(graph.nodes.input_final_reply.config.value, "你好，我在。");
  assertAgentNode(graph.nodes.decide_memory_update);
  assert.equal(graph.nodes.decide_memory_update.config.modelSource, "override");
  assert.equal(graph.nodes.decide_memory_update.config.model, "openai/gpt-4.1");
});

test("buildBuddyChatGraph keeps enabled skills visible in ask-first mode", () => {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "ask_first",
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
  assert.equal(catalog[1].capabilityPolicy.origins.buddy.selectable, true);
  assert.equal(catalog[1].capabilityPolicy.origins.buddy.requiresApproval, true);
  assertInputNode(graph.nodes.input_skill_catalog_snapshot);
  assert.deepEqual(graph.nodes.input_skill_catalog_snapshot.config.value, catalog);
});

test("buildBuddyChatGraph records ask-first mode without adding a generic approval breakpoint", () => {
  const graph = buildBuddyChatGraph(createAgenticTemplate(), {
    userMessage: "帮我搜索最新资料",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "ask_first",
    skillCatalog: [createSkillDefinition()],
  });

  const catalog = graph.state_schema.state_7.value as SkillDefinition[];
  assert.equal(catalog[0].capabilityPolicy.origins.buddy.selectable, true);
  assert.deepEqual(graph.metadata.interrupt_after, ["request_approval_agent"]);
  assert.equal(graph.metadata.buddy_mode, "ask_first");
  assert.equal(graph.metadata.buddy_requires_approval, true);
  assert.equal(graph.metadata.agent_breakpoint_timing, undefined);
});

test("buildBuddyChatGraph injects the current message, history, and page context", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "帮我看当前页面",
    history: [{ role: "assistant", content: "我在。" }],
    pageContext: "当前路径: /editor",
    buddyMode: "full_access",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "伙伴对话循环");
  assert.equal(graph.state_schema.state_1.value, "帮我看当前页面");
  assert.equal(graph.state_schema.state_2.value, "伙伴: 我在。");
  assert.equal(graph.state_schema.state_3.value, "当前路径: /editor");
  assert.equal(graph.state_schema[BUDDY_MODE_STATE_KEY].value, "full_access");
  assert.equal(graph.state_schema[BUDDY_REPLY_STATE_KEY].value, "");
  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_buddy_mode);
  assert.equal(graph.nodes.input_user_message.config.value, "帮我看当前页面");
  assert.equal(graph.nodes.input_buddy_mode.config.value, "full_access");
  assert.equal(graph.metadata.origin, "buddy");
  assert.equal(graph.metadata.buddy_mode, "full_access");
  assert.equal(graph.metadata.buddy_can_execute_actions, true);
  assert.equal(graph.metadata.buddy_run, undefined);
  assert.equal(graph.metadata.buddy_permission_tier, undefined);
  assert.equal(graph.metadata.buddy_graph_patch_drafts_enabled, undefined);
  assertAgentNode(graph.nodes.buddy_reply_agent);
  assert.equal(graph.nodes.buddy_reply_agent.config.skillKey, "graph_editor");
  assert.deepEqual(graph.nodes.buddy_reply_agent.config.skillBindings, [{ skillKey: "graph_editor", enabled: true }]);
});

test("buildBuddyChatGraph marks ask-first mode without a blanket reply breakpoint", () => {
  const graph = buildBuddyChatGraph(createTemplate(), {
    userMessage: "请帮我生成一个图修改草案",
    history: [],
    pageContext: "当前路径: /editor",
    buddyMode: "ask_first",
  });

  assert.equal(graph.state_schema[BUDDY_MODE_STATE_KEY].value, "ask_first");
  assert.equal(graph.metadata.origin, "buddy");
  assert.equal(graph.metadata.buddy_mode, "ask_first");
  assert.equal(graph.metadata.buddy_can_execute_actions, false);
  assert.equal(graph.metadata.buddy_requires_approval, true);
  assert.equal(graph.metadata.buddy_run, undefined);
  assert.equal(graph.metadata.buddy_permission_tier, undefined);
  assert.equal(graph.metadata.buddy_graph_patch_drafts_enabled, undefined);
  assert.equal(graph.metadata.interrupt_after, undefined);
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

test("resolveBuddyReplyFromRunEvent recognizes reply states by graph state name", () => {
  const graph = buildBuddyChatGraph(
    {
      ...createAgenticTemplate(),
      state_schema: {
        user_message: { name: "user_message", description: "", type: "text", value: "", color: "#9a3412" },
        visible_reply: { name: "visible_reply", description: "", type: "markdown", value: "", color: "#0f766e" },
        final_reply: { name: "final_reply", description: "", type: "markdown", value: "", color: "#4f46e5" },
      },
    },
    {
      userMessage: "你好",
      history: [],
      pageContext: "当前路径: /",
      buddyMode: "advisory",
    },
  );

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
        state_key: "final_reply",
        value: "你好，我是 Buddy。",
      },
      graph,
    ),
    "你好，我是 Buddy。",
  );
});

test("resolveBuddyReplyFromRunEvent reads completed output values for named reply states", () => {
  const graph = buildBuddyChatGraph(
    {
      ...createAgenticTemplate(),
      state_schema: {
        final_reply: { name: "final_reply", description: "", type: "markdown", value: "", color: "#4f46e5" },
      },
    },
    {
      userMessage: "你好",
      history: [],
      pageContext: "当前路径: /",
      buddyMode: "advisory",
    },
  );

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "node.output.completed",
        output_keys: ["final_reply"],
        output_values: {
          final_reply: "已经组织好的回复。",
        },
      },
      graph,
    ),
    "已经组织好的回复。",
  );
});

test("resolveBuddyReplyFromRunEvent streams partial markdown from a structured reply field", () => {
  const graph = buildBuddyChatGraph(
    {
      ...createAgenticTemplate(),
      state_schema: {
        final_reply: { name: "final_reply", description: "", type: "markdown", value: "", color: "#4f46e5" },
      },
    },
    {
      userMessage: "你好",
      history: [],
      pageContext: "当前路径: /",
      buddyMode: "advisory",
    },
  );

  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "node.output.delta",
        node_id: "draft_final_reply",
        output_keys: ["final_reply"],
        stream_state_keys: ["final_reply"],
        text: '{"final_reply":"# 你好\\n我正在',
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
        subgraph_node_id: "intake_request",
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
      replaceKey: "node:intake_request:understand_request",
      timingKey: "stage:intake_request:understand_request",
    },
  );
});

test("resolveBuddyRunTraceFromRunEvent hides aggregate subgraph containers from buddy progress", () => {
  const graph = createActivityGraph();

  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.completed",
      {
        node_id: "intake_request",
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
        node_id: "intake_request",
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
        subgraph_node_id: "intake_request",
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
      replaceKey: "node:intake_request:understand_request",
      timingKey: "stage:intake_request:understand_request",
      durationMs: 1534,
    },
  );
  assert.equal(
    resolveBuddyRunTraceFromRunEvent(
      "node.started",
      {
        node_id: "understand_request",
        node_type: "agent",
        subgraph_node_id: "intake_request",
      },
      graph,
    )?.replaceKey,
    "node:intake_request:understand_request",
  );
});

test("resolveBuddyRunTraceFromRunEvent renders low-level activity events", () => {
  const graph = createActivityGraph();

  assert.deepEqual(
    resolveBuddyRunTraceFromRunEvent(
      "activity.event",
      {
        sequence: 2,
        kind: "skill_invocation",
        node_id: "select_capability",
        subgraph_node_id: "run_capability_cycle",
        summary: "Skill 'capability_selector' succeeded.",
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
      preview: "Skill 'capability_selector' succeeded.",
      tone: "success",
      replaceKey: "activity:run_capability_cycle:select_capability:2",
      timingKey: "stage:run_capability_cycle:select_capability",
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
        subgraph_node_id: "intake_request",
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
        node_id: "output_final_reply",
        node_type: "output",
        subgraph_node_id: "draft_final_response",
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
        subgraph_node_id: "intake_request",
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
      subgraph_node_id: "intake_request",
      subgraph_path: ["intake_request"],
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
      node_id: "intake_request",
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
        subgraph_node_id: "run_capability_cycle",
        subgraph_path: ["run_capability_cycle"],
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
        subgraph_node_id: "intake_request",
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
        subgraph_node_id: "intake_request",
      },
      graph,
    ),
    null,
  );
});
