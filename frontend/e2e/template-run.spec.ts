import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOCALE_STORAGE_KEY = "toograph:locale";
const EDITOR_WORKSPACE_STORAGE_KEY = "toograph:editor-workspace";
const EDITOR_DOCUMENT_DRAFTS_STORAGE_KEY = "toograph:editor-document-drafts";

test("editor run button executes a deterministic template draft", async ({ page, request }, testInfo) => {
  const problems = collectBrowserProblems(page);
  const graphName = `E2E Template Run Fixture ${testInfo.workerIndex}`;
  let runId = "";

  try {
    await seedEditorDraft(page, graphName);
    await expect(page.locator(".editor-workspace-shell__workspace")).toBeVisible();
    await expect(page.locator(".editor-tab-bar__tab-title").filter({ hasText: graphName })).toBeVisible();
    await expect(page.locator(".node-card")).toHaveCount(2);

    const runResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/graphs/run") && response.request().method() === "POST",
    );
    await page.locator('[data-virtual-affordance-id="editor.action.runActiveGraph"]').click();
    const runResponse = await runResponsePromise;
    expect(runResponse.ok()).toBeTruthy();
    const runPayload = await runResponse.json();
    runId = String(runPayload.run_id ?? "");
    expect(runId).toMatch(/^run_/);

    await expect
      .poll(async () => {
        const response = await request.get(`/api/runs/${encodeURIComponent(runId)}`);
        if (!response.ok()) {
          return `http_${response.status()}`;
        }
        const run = await response.json();
        return String(run.status ?? "");
      }, { timeout: 15000 })
      .toBe("completed");

    await page.goto(`/runs/${encodeURIComponent(runId)}`);
    await expect(page.getByRole("heading", { name: graphName })).toBeVisible();
    await expect(page.locator(".run-detail__panel--result")).toContainText("E2E template run output");
    await expect(page.locator('[data-virtual-affordance-id="runDetail.action.restoreEdit"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(problems).toEqual([]);
  } finally {
    if (runId) {
      cleanupRunRecord(runId);
    }
  }
});

async function seedEditorDraft(page: Page, graphName: string) {
  const tabId = `tab_e2e_template_run_${Date.now().toString(36)}`;
  await page.goto("/editor");
  await page.evaluate(
    ({ localeKey, workspaceKey, draftsKey, tabIdValue, draft }) => {
      window.localStorage.setItem(localeKey, "en-US");
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify({
          activeTabId: tabIdValue,
          tabs: [
            {
              tabId: tabIdValue,
              kind: "template",
              graphId: null,
              title: draft.name,
              dirty: false,
              templateId: "e2e_no_model_template",
              defaultTemplateId: "e2e_no_model_template",
              subgraphSource: null,
            },
          ],
        }),
      );
      window.localStorage.setItem(draftsKey, JSON.stringify({ [tabIdValue]: draft }));
    },
    {
      localeKey: LOCALE_STORAGE_KEY,
      workspaceKey: EDITOR_WORKSPACE_STORAGE_KEY,
      draftsKey: EDITOR_DOCUMENT_DRAFTS_STORAGE_KEY,
      tabIdValue: tabId,
      draft: buildNoModelGraph(graphName),
    },
  );
  await page.reload();
}

function buildNoModelGraph(graphName: string) {
  return {
    graph_id: null,
    name: graphName,
    state_schema: {
      answer: {
        name: "Answer",
        description: "Deterministic output for template-run E2E coverage.",
        type: "markdown",
        value: "E2E template run output",
        color: "#2563eb",
        binding: null,
      },
    },
    nodes: {
      input_answer: {
        kind: "input",
        name: "Input Answer",
        description: "Seeds a deterministic output value.",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {},
      },
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "Displays the deterministic output value.",
        ui: { position: { x: 320, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "input_answer", target: "output_answer" }],
    conditional_edges: [],
    metadata: { e2e_fixture: true },
  };
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
