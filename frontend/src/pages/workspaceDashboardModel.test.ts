import assert from "node:assert/strict";
import test from "node:test";

import type { GraphDocument } from "../types/node-system.ts";

import { countGraphEdgeTotal, paginateWorkspacePanelItems, resolveWorkspaceCardDetail, resolveWorkspaceEmptyAction } from "./workspaceDashboardModel.ts";

test("countGraphEdgeTotal includes both control-flow and conditional branch edges", () => {
  const graph: GraphDocument = {
    graph_id: "graph_1",
    name: "Hello World",
    state_schema: {},
    nodes: {},
    edges: [
      { source: "input", target: "agent" },
      { source: "agent", target: "output" },
    ],
    conditional_edges: [
      {
        source: "route",
        branches: {
          retry: "agent",
          continue: "output",
        },
      },
    ],
    metadata: {},
  };

  assert.equal(countGraphEdgeTotal(graph), 4);
});

test("resolveWorkspaceEmptyAction returns the expected CTA for each empty dashboard bucket", () => {
  assert.deepEqual(resolveWorkspaceEmptyAction("runs"), {
    href: "/editor",
    label: "打开编排器",
  });
  assert.deepEqual(resolveWorkspaceEmptyAction("templates"), {
    href: "/editor",
    label: "更多模板",
  });
  assert.deepEqual(resolveWorkspaceEmptyAction("graphs"), {
    href: "/editor/new",
    label: "新建图",
  });
});

test("resolveWorkspaceCardDetail keeps run and graph cards on the same detail cue", () => {
  assert.equal(resolveWorkspaceCardDetail("runs"), "查看详情");
  assert.equal(resolveWorkspaceCardDetail("graphs"), "查看详情");
});

test("paginateWorkspacePanelItems keeps home panels bounded while preserving page metadata", () => {
  const page = paginateWorkspacePanelItems(["a", "b", "c", "d", "e", "f"], 8, 5);

  assert.deepEqual(page.items, ["f"]);
  assert.equal(page.page, 1);
  assert.equal(page.pageCount, 2);
  assert.equal(page.hasPagination, true);
});
