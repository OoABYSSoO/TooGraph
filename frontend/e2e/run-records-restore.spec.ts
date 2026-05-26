import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOCALE_STORAGE_KEY = "toograph:locale";
const FIXTURE_GRAPH_NAME = "E2E Run Records Fixture";

test("run records open detail and restore a completed graph snapshot", async ({ page }, testInfo) => {
  const problems = collectBrowserProblems(page);
  const fixture = seedRunRecord(testInfo);

  try {
    await openWithLocale(page, "/runs", "en-US");
    await page.locator(".runs-page__search input").fill(FIXTURE_GRAPH_NAME);

    const row = page.locator(`[data-virtual-affordance-id="runs.run.${fixture.runId}.openDetail"]`);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(FIXTURE_GRAPH_NAME);
    await expect(row).toContainText("completed");
    await expect(row.locator(".runs-page__restore-link")).toBeVisible();

    await row.locator(".runs-page__detail-link").click();
    await expect(page).toHaveURL(new RegExp(`/runs/${fixture.runId}$`));
    await expect(page.getByRole("heading", { name: FIXTURE_GRAPH_NAME })).toBeVisible();
    await expect(page.locator(".run-detail__metric-value").filter({ hasText: "completed" })).toBeVisible();
    await expect(page.getByText("E2E run records fixture final output")).toBeVisible();

    const restoreLink = page.locator('[data-virtual-affordance-id="runDetail.action.restoreEdit"]');
    await expect(restoreLink).toBeVisible();
    await restoreLink.click();

    await expect(page).toHaveURL(/\/editor\/new$/);
    await expect(page.locator(".editor-workspace-shell__workspace")).toBeVisible();
    await expect(page.locator(".editor-tab-bar__tab-title").filter({ hasText: FIXTURE_GRAPH_NAME })).toBeVisible();
    await expect(page.locator(".node-card")).not.toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(problems).toEqual([]);
  } finally {
    cleanupRunRecord(fixture.runId);
  }
});

test("permission approval snapshots restore into the human review panel", async ({ page }, testInfo) => {
  const problems = collectBrowserProblems(page);
  const fixture = seedRunRecord(testInfo, {
    status: "awaiting_human",
    currentNodeId: "recall_policy_memory",
    pauseReason: "permission_approval",
    snapshotId: "pause_1",
    snapshotKind: "pause",
    snapshotLabel: "Approval required for Local Workspace Executor",
    metadata: {
      pending_permission_approval: {
        kind: "capability_permission_approval",
        capability_kind: "action",
        capability_key: "local_workspace_executor",
        capability_name: "Local Workspace Executor",
        permissions: ["file_write", "subprocess"],
        input_preview: '{\n  "path": "action/user/demo/ACTION.md"\n}',
        reason: "Action declares risky permissions.",
      },
    },
  });

  try {
    await openWithLocale(page, `/editor/new?restoreRun=${fixture.runId}&snapshot=pause_1`, "en-US");

    const panel = page.locator(".editor-human-review-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toContainText("Local Workspace Executor needs approval");
    await expect(panel).toContainText("Capability Operation Pending Approval");
    await expect(panel).toContainText("local_workspace_executor");
    await expect(panel).toContainText("file_write");
    await expect(panel).toContainText("subprocess");
    await expect(panel).toContainText("Action declares risky permissions.");
    await expect(panel).toContainText("Planned inputs");
    await expect(panel).toContainText("action/user/demo/ACTION.md");
    await expect(panel.getByRole("button", { name: "Continue Run" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(problems).toEqual([]);
  } finally {
    cleanupRunRecord(fixture.runId);
  }
});

async function openWithLocale(page: Page, targetPath: string, locale: string) {
  await page.goto(targetPath);
  await page.evaluate(
    ({ localeKey, localeValue }) => {
      window.localStorage.setItem(localeKey, localeValue);
    },
    { localeKey: LOCALE_STORAGE_KEY, localeValue: locale },
  );
  await page.reload();
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
}

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

type SeedRunOptions = {
  status?: "completed" | "awaiting_human";
  currentNodeId?: string | null;
  pauseReason?: string | null;
  snapshotId?: string;
  snapshotKind?: "completed" | "pause";
  snapshotLabel?: string;
  metadata?: Record<string, unknown>;
};

function seedRunRecord(testInfo: TestInfo, options: SeedRunOptions = {}) {
  const rootDir = path.resolve(process.cwd(), "..");
  const runId = `run_e2e_records_${Date.now().toString(36)}_${testInfo.workerIndex}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const graphId = `graph_${runId}`;
  const now = new Date().toISOString();
  const status = options.status ?? "completed";
  const currentNodeId = options.currentNodeId ?? null;
  const snapshotId = options.snapshotId ?? "completed";
  const snapshotKind = options.snapshotKind ?? "completed";
  const snapshotLabel = options.snapshotLabel ?? "Completed";
  const template = JSON.parse(
    fs.readFileSync(path.join(rootDir, "graph_template/official/policy_navigator_agent/template.json"), "utf8"),
  );
  const graphSnapshot = {
    state_schema: template.state_schema,
    nodes: template.nodes,
    edges: template.edges,
    conditional_edges: template.conditional_edges,
    metadata: template.metadata ?? {},
    graph_id: graphId,
    name: FIXTURE_GRAPH_NAME,
    status: "active",
  };
  const stateSnapshot = {
    values: {
      final_policy_package: "E2E run records fixture final output with restore-ready graph state.",
    },
    last_writers: {},
  };
  const artifacts = {
    action_outputs: [],
    output_previews: [
      {
        node_id: "final_policy_package_output",
        label: "Final policy package",
        source_kind: "state",
        source_key: "final_policy_package",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "E2E run records fixture final output with restore-ready graph state.",
      },
    ],
    saved_outputs: [],
    exported_outputs: [],
    node_outputs: {},
    active_edge_ids: [],
    state_events: [],
    state_stream_events: [],
    state_values: stateSnapshot.values,
    streaming_outputs: {},
    cycle_iterations: [],
    cycle_summary: {},
  };
  const nodeStatusMap = Object.fromEntries(
    Object.keys(template.nodes ?? {}).map((nodeId) => [nodeId, nodeId === currentNodeId ? "paused" : "success"]),
  );
  const run = {
    run_id: runId,
    graph_id: graphId,
    graph_name: FIXTURE_GRAPH_NAME,
    status,
    runtime_backend: "node_system",
    current_node_id: currentNodeId,
    metadata: { e2e_fixture: true, ...(options.metadata ?? {}) },
    lifecycle: {
      updated_at: now,
      paused_at: status === "awaiting_human" ? now : null,
      resumed_at: null,
      pause_reason: options.pauseReason ?? null,
      resume_count: 0,
      resumed_from_run_id: null,
    },
    checkpoint_metadata: {
      available: false,
      checkpoint_id: null,
      thread_id: runId,
      checkpoint_ns: null,
      saver: null,
      resume_source: null,
    },
    revision_round: 0,
    max_revision_round: 1,
    selected_actions: [],
    action_outputs: [],
    activity_events: [],
    selected_capabilities: [],
    capability_outputs: [],
    evaluation_result: {},
    memory_summary: "E2E memory summary",
    final_result: "E2E run records fixture final output with restore-ready graph state.",
    node_status_map: nodeStatusMap,
    subgraph_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: artifacts.output_previews,
    saved_outputs: [],
    state_values: stateSnapshot.values,
    state_last_writers: {},
    state_events: [],
    state_stream_events: [],
    started_at: now,
    completed_at: status === "completed" ? now : null,
    duration_ms: status === "completed" ? 642 : null,
    artifacts,
    state_snapshot: stateSnapshot,
    graph_snapshot: graphSnapshot,
    run_snapshots: [
      {
        snapshot_id: snapshotId,
        kind: snapshotKind,
        label: snapshotLabel,
        created_at: now,
        status,
        current_node_id: currentNodeId,
        checkpoint_metadata: {
          available: false,
          checkpoint_id: null,
          thread_id: runId,
          checkpoint_ns: null,
          saver: null,
          resume_source: null,
        },
        state_snapshot: stateSnapshot,
        graph_snapshot: graphSnapshot,
        artifacts,
        node_status_map: nodeStatusMap,
        subgraph_status_map: {},
        output_previews: artifacts.output_previews,
        final_result: "E2E run records fixture final output with restore-ready graph state.",
      },
    ],
    cycle_summary: {},
    cycle_iterations: [],
  };

  saveRunRecord(rootDir, run);
  return { runId };
}

function saveRunRecord(rootDir: string, run: Record<string, unknown>) {
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import json, sys",
        "sys.path.insert(0, 'backend')",
        "from app.core.storage.run_store import save_run",
        "save_run(json.load(sys.stdin))",
      ].join("\n"),
    ],
    {
      cwd: rootDir,
      input: JSON.stringify(run),
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to seed run record: ${result.stderr || result.stdout}`);
  }
}

function cleanupRunRecord(runId: string) {
  const rootDir = path.resolve(process.cwd(), "..");
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import sys",
        "sys.path.insert(0, 'backend')",
        "from app.core.storage.database import get_connection",
        "run_id = sys.argv[1]",
        "tables = ['graph_run_snapshots', 'graph_node_executions', 'graph_run_events', 'graph_state_events', 'graph_outputs', 'graph_artifacts', 'graph_capability_invocations', 'graph_model_calls']",
        "with get_connection() as connection:",
        "    for table in tables:",
        "        connection.execute(f'DELETE FROM {table} WHERE run_id = ?', (run_id,))",
        "    connection.execute('DELETE FROM graph_runs WHERE run_id = ?', (run_id,))",
      ].join("\n"),
      runId,
    ],
    { cwd: rootDir, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to clean up run record: ${result.stderr || result.stdout}`);
  }
}
