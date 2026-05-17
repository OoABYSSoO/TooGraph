import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBuddyConversationalPausePrompt,
  buildBuddyConversationalPauseResumePayload,
} from "./buddyConversationalPause.ts";

function createPausedRun(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run_paused",
    status: "awaiting_human",
    current_node_id: "ask_more",
    graph_snapshot: null,
    metadata: {},
    artifacts: {
      state_values: {},
    },
    state_snapshot: {
      values: {},
    },
    node_executions: [],
    node_status_map: {},
    lifecycle: {},
    output_previews: [],
    errors: [],
    ...overrides,
  } as never;
}

const graph = {
  graph_id: "graph_pause",
  name: "会话式暂停测试",
  state_schema: {
    clarification_answer: {
      name: "澄清回答",
      description: "用户对澄清问题的回答。",
      type: "markdown",
      value: "",
      color: "#d97706",
    },
  },
  nodes: {
    ask_more: {
      kind: "agent",
      name: "询问澄清",
      reads: [],
      writes: [{ state: "clarification_prompt", mode: "replace" }],
      config: {},
    },
    merge_more: {
      kind: "agent",
      name: "合并澄清",
      reads: [{ state: "clarification_answer", required: true }],
      writes: [],
      config: {},
    },
  },
  edges: [{ source: "ask_more", target: "merge_more" }],
  conditional_edges: [],
  metadata: { interrupt_after: ["ask_more"] },
} as never;

test("buildBuddyConversationalPausePrompt asks through normal reply text", () => {
  const run = createPausedRun();

  assert.match(buildBuddyConversationalPausePrompt(run, graph), /我需要你补充/);
  assert.match(buildBuddyConversationalPausePrompt(run, graph), /澄清回答/);
});

test("buildBuddyConversationalPauseResumePayload fills the required breakpoint state from the next chat reply", () => {
  const run = createPausedRun();

  assert.deepEqual(
    buildBuddyConversationalPauseResumePayload(run, graph, "我选择第二个方案，并且需要保留上下文。"),
    { clarification_answer: "我选择第二个方案，并且需要保留上下文。" },
  );
});

test("buildBuddyConversationalPauseResumePayload maps explicit permission replies", () => {
  const run = createPausedRun({
    metadata: {
      pending_permission_approval: {
        kind: "skill_permission_approval",
        skill_key: "local_workspace_executor",
        skill_name: "Local Workspace Executor",
        permissions: ["file_write"],
      },
    },
  });

  assert.deepEqual(buildBuddyConversationalPauseResumePayload(run, graph, "同意继续"), {
    permission_approval: { decision: "approved", reason: "同意继续" },
  });
  assert.deepEqual(buildBuddyConversationalPauseResumePayload(run, graph, "拒绝，先不要写文件"), {
    permission_approval: { decision: "denied", reason: "拒绝，先不要写文件" },
  });
});
