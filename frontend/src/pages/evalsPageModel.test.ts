import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvalCaseCards,
  buildEvalOverview,
  chooseInitialEvalSuiteId,
  countEvalCaseStatuses,
  formatEvalTarget,
} from "./evalsPageModel.ts";
import type { EvalRun, EvalSuite } from "@/types/eval";

function suite(overrides: Partial<EvalSuite>): EvalSuite {
  return {
    suite_id: "suite_a",
    name: "Suite A",
    description: "",
    target_graph_id: "",
    target_template_id: "",
    tags: [],
    metadata: {},
    case_count: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function run(overrides: Partial<EvalRun>): EvalRun {
  return {
    eval_run_id: "evalrun_1",
    suite_id: "suite_a",
    status: "running",
    requested_by: "",
    metadata: {},
    started_at: "",
    completed_at: "",
    created_at: "",
    updated_at: "",
    case_results: [],
    ...overrides,
  };
}

test("eval page model chooses the first suite and formats targets", () => {
  assert.equal(chooseInitialEvalSuiteId([], ""), "");
  assert.equal(chooseInitialEvalSuiteId([suite({ suite_id: "suite_a" })], ""), "suite_a");
  assert.equal(chooseInitialEvalSuiteId([suite({ suite_id: "suite_a" })], "suite_a"), "suite_a");
  assert.equal(formatEvalTarget(suite({ target_template_id: "policy_navigator_agent" })), "Template · policy_navigator_agent");
  assert.equal(formatEvalTarget(suite({ target_graph_id: "graph_policy" })), "Graph · graph_policy");
});

test("eval page model summarizes suite and case result status", () => {
  const runs = [
    run({ status: "passed" }),
    run({
      status: "failed",
      case_results: [
        { case_id: "a", case_name: "A", status: "passed", check_results: [] },
        { case_id: "b", case_name: "B", status: "failed", check_results: [{ status: "failed", kind: "rule" }] },
        { case_id: "c", case_name: "C", status: "running", check_results: [] },
      ] as EvalRun["case_results"],
    }),
  ];

  assert.deepEqual(buildEvalOverview([suite({ case_count: 3 })], runs), [
    { key: "suites", label: "evals.suitesMetric", value: 1 },
    { key: "cases", label: "evals.casesMetric", value: 3 },
    { key: "runs", label: "evals.runsMetric", value: 2 },
    { key: "attention", label: "evals.attentionMetric", value: 1 },
  ]);
  assert.deepEqual(countEvalCaseStatuses(runs[1].case_results), { passed: 1, failed: 1, running: 1, pending: 0 });
});

test("eval page model builds case cards with check and artifact counts", () => {
  const cards = buildEvalCaseCards(
    [
      {
        case_id: "case_one",
        name: "Case One",
        checks: [{ kind: "schema" }, { kind: "artifact" }],
      },
    ] as never,
    run({
      case_results: [
        {
          case_id: "case_one",
          case_name: "Case One",
          status: "passed",
          graph_run_id: "run_1",
          final_output: { public_response: "ok" },
          artifacts: { "final.md": { path: "final.md" } },
          check_results: [{ status: "passed", kind: "schema" }, { status: "passed", kind: "artifact" }],
        },
      ] as EvalRun["case_results"],
    }),
  );

  assert.equal(cards[0].title, "Case One");
  assert.equal(cards[0].status, "passed");
  assert.equal(cards[0].graphRunId, "run_1");
  assert.equal(cards[0].checkCount, 2);
  assert.equal(cards[0].artifactCount, 1);
  assert.equal(cards[0].finalOutputPreview, '{"public_response":"ok"}');
});

test("eval page model builds compact expected and actual comparison previews", () => {
  const cards = buildEvalCaseCards(
    [
      {
        case_id: "case_one",
        name: "Case One",
        expected: { public_response: "must cite policy", citations: 1 },
        checks: [{ kind: "rule" }],
      },
    ] as never,
    run({
      case_results: [
        {
          case_id: "case_one",
          case_name: "Case One",
          status: "failed",
          final_output: { public_response: "no citation" },
          check_results: [
            {
              status: "failed",
              kind: "rule",
              name: "Citation rule",
              expected: { must_include: ["[1]"] },
              actual: { found: [] },
              message: "Missing citation.",
            },
          ],
        },
      ] as EvalRun["case_results"],
    }),
  );

  assert.equal(cards[0].expectedPreview, '{"public_response":"must cite policy","citations":1}');
  assert.equal(cards[0].actualPreview, '{"public_response":"no citation"}');
  assert.deepEqual(cards[0].checkComparisons, [
    {
      key: "case_one-0",
      label: "Citation rule",
      status: "failed",
      message: "Missing citation.",
      expectedPreview: '{"must_include":["[1]"]}',
      actualPreview: '{"found":[]}',
    },
  ]);
});

test("eval page model builds failed case diagnostics from errors, nodes, and checks", () => {
  const cards = buildEvalCaseCards(
    [
      {
        case_id: "case_one",
        name: "Case One",
        checks: [{ kind: "rule" }],
      },
    ] as never,
    run({
      case_results: [
        {
          case_id: "case_one",
          case_name: "Case One",
          status: "failed",
          error: "Graph run ended with failed checks.",
          node_failures: [
            {
              node_id: "citation_check",
              status: "failed",
              error: "No citation ids found.",
            },
          ],
          check_results: [
            {
              status: "failed",
              kind: "rule",
              name: "Citation rule",
              message: "Missing citation.",
              details: { missing: ["[1]"] },
              actual: { found: [] },
            },
          ],
        },
      ] as EvalRun["case_results"],
    }),
  );

  assert.equal(cards[0].primaryFailure, "Graph run ended with failed checks.");
  assert.deepEqual(cards[0].failureDiagnostics, [
    {
      key: "case_one-case-error",
      kind: "case_error",
      label: "evals.caseError",
      status: "failed",
      message: "Graph run ended with failed checks.",
      detailPreview: "",
    },
    {
      key: "case_one-node-0",
      kind: "node_failure",
      label: "citation_check",
      status: "failed",
      message: "No citation ids found.",
      detailPreview: "",
    },
    {
      key: "case_one-check-0",
      kind: "check_failure",
      label: "Citation rule",
      status: "failed",
      message: "Missing citation.",
      detailPreview: '{"missing":["[1]"]}',
    },
  ]);
});
