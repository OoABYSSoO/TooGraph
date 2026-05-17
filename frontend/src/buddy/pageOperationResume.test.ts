import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPageOperationResult,
  buildPageOperationResumePayload,
  canAutoResumePageOperationRun,
} from "./pageOperationResume.ts";

const expectedContinuation = {
  mode: "auto_resume_after_ui_operation" as const,
  operationRequestId: "vop_1234567890abcdef",
  resumeStateKeys: ["page_operation_context", "page_context", "operation_result", "operation_report"],
};

const pageOperationContextBefore = {
  page_path: "/",
  page_snapshot: {
    snapshotId: "before",
    path: "/",
    title: "首页",
    affordances: [],
  },
  page_operation_book: {
    page: { path: "/", title: "首页", snapshotId: "before" },
    allowedOperations: [],
    inputs: [],
    unavailable: [],
    forbidden: [],
  },
};

const pageOperationContextAfter = {
  page_path: "/runs",
  page_snapshot: {
    snapshotId: "after",
    path: "/runs",
    title: "运行历史",
    affordances: [],
  },
  page_operation_book: {
    page: { path: "/runs", title: "运行历史", snapshotId: "after" },
    allowedOperations: [],
    inputs: [],
    unavailable: [],
    forbidden: [],
  },
};

test("buildPageOperationResult captures route, snapshots, commands, and target id", () => {
  const result = buildPageOperationResult({
    operationPlan: {
      version: 1,
      operationRequestId: "vop_1234567890abcdef",
      runId: "run_page",
      commands: ["click app.nav.runs"],
      operations: [{ kind: "click", targetId: "app.nav.runs" }],
      cursorLifecycle: "return_after_step",
      expectedContinuation,
      reason: "打开运行历史。",
    },
    status: "succeeded",
    routeBefore: "/",
    routeAfter: "/runs",
    pageOperationContextBefore,
    pageOperationContextAfter,
    triggeredRunId: "run_123",
    triggeredGraphId: "graph_1",
    triggeredRunInitialStatus: "queued",
    triggeredRunStatus: "completed",
  });

  assert.deepEqual(result, {
    operation_request_id: "vop_1234567890abcdef",
    status: "succeeded",
    target_id: "app.nav.runs",
    commands: ["click app.nav.runs"],
    route_before: "/",
    route_after: "/runs",
    page_snapshot_before: pageOperationContextBefore.page_snapshot,
    page_snapshot_after: pageOperationContextAfter.page_snapshot,
    triggered_run_id: "run_123",
    triggered_graph_id: "graph_1",
    triggered_run_initial_status: "queued",
    triggered_run_status: "completed",
    triggered_run_result_summary: null,
    triggered_run_final_result: null,
    input_text: null,
    graph_edit_summary: null,
    operation_report: {
      operation_request_id: "vop_1234567890abcdef",
      status: "succeeded",
      target_id: "app.nav.runs",
      commands: ["click app.nav.runs"],
      route_before: "/",
      route_after: "/runs",
      triggered_run_id: "run_123",
      triggered_graph_id: "graph_1",
      triggered_run_initial_status: "queued",
      triggered_run_status: "completed",
      triggered_run_result_summary: null,
      triggered_run_final_result: null,
      input_text: null,
      graph_edit_summary: null,
      error: null,
    },
    error: null,
  });
});

test("buildPageOperationResult records template run input text", () => {
  const result = buildPageOperationResult({
    operationPlan: {
      version: 1,
      operationRequestId: "vop_template1234",
      commands: ["run_template planning_summary_template"],
      operations: [
        {
          kind: "run_template",
          targetId: "library.template.planning_summary_template.open",
          templateId: "planning_summary_template",
          templateName: "规划摘要模板",
          searchText: "planning_summary_template",
          inputText: "把最新产品路线整理成三条可执行任务。",
          runTargetId: "editor.action.runActiveGraph",
        },
      ],
      cursorLifecycle: "return_at_end",
      expectedContinuation,
      reason: "运行模板。",
    },
    status: "succeeded",
    routeBefore: "/library",
    routeAfter: "/editor",
    pageOperationContextBefore,
    pageOperationContextAfter,
  });

  assert.equal(result.input_text, "把最新产品路线整理成三条可执行任务。");
  assert.equal(result.operation_report.input_text, "把最新产品路线整理成三条可执行任务。");
});

test("buildPageOperationResult records compact triggered run outputs in the report", () => {
  const result = buildPageOperationResult({
    operationPlan: {
      version: 1,
      operationRequestId: "vop_template5678",
      commands: ["run_template advanced_web_research_loop"],
      operations: [
        {
          kind: "run_template",
          targetId: "library.template.advanced_web_research_loop.open",
          templateId: "advanced_web_research_loop",
          templateName: "高级联网搜索",
          searchText: "高级联网搜索",
          inputText: "鸣潮最新资讯",
          runTargetId: "editor.action.runActiveGraph",
        },
      ],
      cursorLifecycle: "return_at_end",
      expectedContinuation,
      reason: "运行模板。",
    },
    status: "succeeded",
    routeBefore: "/library",
    routeAfter: "/editor",
    pageOperationContextBefore,
    pageOperationContextAfter: {
      ...pageOperationContextAfter,
      page_facts: {
        route: { path: "/editor", title: "编辑器", snapshotId: "after" },
        activeEditorTab: null,
        activeGraph: null,
        visibleGraphs: [],
        visibleTemplates: [],
        visibleRuns: [],
        latestForegroundRun: {
          runId: "run_search",
          status: "completed",
          resultSummary: "已拿到《鸣潮》最新资讯摘要。",
        },
        latestOperationResult: null,
      },
      operation_report: null,
    },
    triggeredRunId: "run_search",
    triggeredGraphId: "advanced_web_research_loop",
    triggeredRunInitialStatus: "queued",
    triggeredRunStatus: "completed",
    triggeredRunFinalResult: "# 《鸣潮》最新资讯汇总\n\n完整结果正文。",
  });

  assert.equal(result.triggered_run_result_summary, "已拿到《鸣潮》最新资讯摘要。");
  assert.equal(result.triggered_run_final_result, "# 《鸣潮》最新资讯汇总\n\n完整结果正文。");
  assert.equal(result.operation_report.triggered_run_result_summary, "已拿到《鸣潮》最新资讯摘要。");
  assert.equal(result.operation_report.triggered_run_final_result, "# 《鸣潮》最新资讯汇总\n\n完整结果正文。");
  assert.equal("page_snapshot_after" in result.operation_report, false);
});

test("buildPageOperationResumePayload writes the required resume state keys", () => {
  const operationResult = buildPageOperationResult({
    operationPlan: {
      version: 1,
      operationRequestId: "vop_1234567890abcdef",
      commands: ["click app.nav.runs"],
      operations: [{ kind: "click", targetId: "app.nav.runs" }],
      cursorLifecycle: "return_after_step",
      expectedContinuation,
      reason: "打开运行历史。",
    },
    status: "succeeded",
    routeBefore: "/",
    routeAfter: "/runs",
    pageOperationContextBefore,
    pageOperationContextAfter,
  });

  assert.deepEqual(
    buildPageOperationResumePayload({
      operationResult,
      pageContext: "当前路径: /runs",
      pageOperationContext: pageOperationContextAfter,
    }),
    {
      operation_result: operationResult,
      operation_report: operationResult.operation_report,
      page_context: "当前路径: /runs",
      page_operation_context: pageOperationContextAfter,
    },
  );
});

test("canAutoResumePageOperationRun detects nested subgraph page-operation checkpoints", () => {
  assert.equal(
    canAutoResumePageOperationRun(
      {
        status: "awaiting_human",
        metadata: {
          pending_subgraph_breakpoint: {
            metadata: {
              pending_page_operation_continuation: {
                mode: "auto_resume_after_ui_operation",
                operation_request_id: "vop_nested",
              },
            },
          },
        },
      },
      "vop_nested",
    ),
    true,
  );
});

test("canAutoResumePageOperationRun requires matching awaiting_human metadata", () => {
  assert.equal(
    canAutoResumePageOperationRun(
      {
        status: "awaiting_human",
        metadata: {
          pending_page_operation_continuation: {
            mode: "auto_resume_after_ui_operation",
            operation_request_id: "vop_1234567890abcdef",
          },
        },
      },
      "vop_1234567890abcdef",
    ),
    true,
  );
  assert.equal(
    canAutoResumePageOperationRun(
      {
        status: "awaiting_human",
        metadata: {
          pending_page_operation_continuation: {
            mode: "auto_resume_after_ui_operation",
            operation_request_id: "vop_other",
          },
        },
      },
      "vop_1234567890abcdef",
    ),
    false,
  );
  assert.equal(
    canAutoResumePageOperationRun(
      {
        status: "running",
        metadata: {
          pending_page_operation_continuation: {
            mode: "auto_resume_after_ui_operation",
            operation_request_id: "vop_1234567890abcdef",
          },
        },
      },
      "vop_1234567890abcdef",
    ),
    false,
  );
});
