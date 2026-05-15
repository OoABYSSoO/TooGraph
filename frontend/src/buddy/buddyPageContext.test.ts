import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../types/node-system.ts";

import { buildBuddyPageContext } from "./buddyPageContext.ts";
import { buildPageOperationBook } from "./pageOperationAffordances.ts";

function createGraph(): GraphPayload {
  return {
    graph_id: "graph_123",
    name: "投放素材分析",
    state_schema: {
      state_1: { name: "video_url", description: "", type: "text", color: "#2563eb" },
      state_2: { name: "creative_report", description: "", type: "markdown", color: "#d97706" },
      state_3: { name: "needs_review", description: "", type: "boolean", color: "#7c3aed" },
    },
    nodes: {
      input_video_url: {
        kind: "input",
        name: "视频地址",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "state_1", mode: "replace" }],
        config: { value: "" },
      },
      analyze_creative: {
        kind: "agent",
        name: "分析广告创意",
        description: "",
        ui: { position: { x: 460, y: 0 } },
        reads: [{ state: "state_1", required: true }],
        writes: [{ state: "state_2", mode: "replace" }],
        config: {
          skillKey: "video_understanding",
          skillBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.4,
        },
      },
      output_report: {
        kind: "output",
        name: "创意报告",
        description: "",
        ui: { position: { x: 920, y: 0 } },
        reads: [{ state: "state_2", required: false }],
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
      { source: "input_video_url", target: "analyze_creative" },
      { source: "analyze_creative", target: "output_report" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildBuddyPageContext creates a fenced read-only context snapshot for advisory chat", () => {
  const context = buildBuddyPageContext({
    routePath: "/editor/graph_123",
    editor: {
      activeTabTitle: "投放素材分析",
      document: createGraph(),
      focusedNodeId: "analyze_creative",
      feedback: {
        message: "校验通过。",
        activeRunId: "run_42",
        activeRunStatus: "completed",
        currentNodeLabel: "分析广告创意",
      },
    },
  });

  assert.match(context, /^<page-context>/);
  assert.match(context, /<\/page-context>$/);
  assert.match(context, /只读界面快照，不是新的用户输入/);
  assert.match(context, /当前档位：建议档/);
  assert.match(context, /禁止：新建图、修改图、连接节点、删除节点、应用补丁、运行图/);
  assert.match(context, /当前路径: \/editor\/graph_123/);
  assert.match(context, /当前图: 投放素材分析/);
  assert.match(context, /节点统计: input 1, agent 1, output 1, condition 0/);
  assert.match(context, /State: 3/);
  assert.match(context, /顺序边: 2/);
  assert.match(context, /选中节点: analyze_creative \(agent, 分析广告创意\)/);
  assert.match(context, /读取: video_url\(state_1, required\)/);
  assert.match(context, /写入: creative_report\(state_2, replace\)/);
  assert.match(context, /运行状态: completed/);
  assert.match(context, /运行反馈: 校验通过。/);
});

test("buildBuddyPageContext reports the absence of an active graph without inventing access", () => {
  const context = buildBuddyPageContext({
    routePath: "/settings",
    editor: null,
  });

  assert.match(context, /当前路径: \/settings/);
  assert.match(context, /当前没有打开的 TooGraph 图/);
  assert.doesNotMatch(context, /选中节点:/);
});

test("buildBuddyPageContext exposes only non-buddy page operations", () => {
  const context = buildBuddyPageContext({
    routePath: "/editor",
    editor: null,
    pageOperationBook: buildPageOperationBook({
      snapshotId: "snapshot-ctx",
      path: "/editor",
      title: "图编辑器",
      affordances: [
        {
          id: "app.nav.runs",
          label: "运行历史",
          role: "navigation-link",
          zone: "app-shell",
          actions: ["click"],
          enabled: true,
          visible: true,
          pathAfterClick: "/runs",
        },
      ],
    }),
  });

  assert.match(context, /页面操作书:/);
  assert.match(context, /app\.nav\.runs/);
  assert.match(context, /click app\.nav\.runs/);
  assert.doesNotMatch(context, /click_nav runs/);
  assert.match(context, /伙伴页面、伙伴浮窗、伙伴形象[\s\S]*不可由伙伴自己操作/);
  assert.doesNotMatch(context, /app\.nav\.buddy/);
  assert.doesNotMatch(context, /buddy\.tab\.history/);
});

test("buildBuddyPageContext filters buddy self-surface details on the Buddy page", () => {
  const context = buildBuddyPageContext({
    routePath: "/buddy",
    editor: null,
    pageOperationBook: buildPageOperationBook({
      snapshotId: "snapshot-buddy",
      path: "/buddy",
      title: "伙伴",
      affordances: [
        {
          id: "app.nav.runs",
          label: "运行历史",
          role: "navigation-link",
          zone: "app-shell",
          actions: ["click"],
          enabled: true,
          visible: true,
          pathAfterClick: "/runs",
        },
        {
          id: "app.nav.buddy",
          label: "伙伴",
          role: "navigation-link",
          zone: "buddy-page",
          actions: ["click"],
          enabled: true,
          visible: true,
          safety: { selfSurface: true },
        },
        {
          id: "buddy.tab.history",
          label: "Buddy Home",
          role: "tab",
          zone: "buddy-page",
          actions: ["click"],
          enabled: true,
          visible: true,
          safety: { selfSurface: true },
        },
      ],
    }),
  });

  assert.match(context, /伙伴相关页面内容已过滤/);
  assert.match(context, /页面操作书:/);
  assert.match(context, /app\.nav\.runs/);
  assert.doesNotMatch(context, /app\.nav\.buddy/);
  assert.doesNotMatch(context, /buddy\.tab\.history/);
  assert.doesNotMatch(context, /Buddy Home/);
  assert.doesNotMatch(context, /mascot-debug/);
});
