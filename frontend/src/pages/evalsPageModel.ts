import { translate } from "../i18n/index.ts";
import type { EvalCase, EvalCaseResult, EvalRun, EvalSuite } from "../types/eval.ts";

export type EvalOverviewItem = {
  key: string;
  label: string;
  value: number;
};

export type EvalCaseStatusCounts = {
  passed: number;
  failed: number;
  running: number;
  pending: number;
};

export type EvalCaseCard = {
  caseId: string;
  title: string;
  description: string;
  status: string;
  graphRunId: string;
  checkCount: number;
  failedCheckCount: number;
  artifactCount: number;
  finalOutputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  error: string;
  checks: EvalCaseResult["check_results"];
  checkComparisons: EvalCheckComparison[];
  primaryFailure: string;
  failureDiagnostics: EvalFailureDiagnostic[];
};

export type EvalCheckComparison = {
  key: string;
  label: string;
  status: string;
  message: string;
  expectedPreview: string;
  actualPreview: string;
};

export type EvalFailureDiagnostic = {
  key: string;
  kind: "case_error" | "node_failure" | "check_failure";
  label: string;
  status: string;
  message: string;
  detailPreview: string;
};

export function chooseInitialEvalSuiteId(suites: EvalSuite[], currentSuiteId: string): string {
  if (currentSuiteId && suites.some((suite) => suite.suite_id === currentSuiteId)) {
    return currentSuiteId;
  }
  return suites[0]?.suite_id ?? "";
}

export function formatEvalTarget(suite: Pick<EvalSuite, "target_graph_id" | "target_template_id">): string {
  if (suite.target_template_id) {
    return `Template · ${suite.target_template_id}`;
  }
  if (suite.target_graph_id) {
    return `Graph · ${suite.target_graph_id}`;
  }
  return translate("common.none");
}

export function buildEvalOverview(suites: EvalSuite[], runs: EvalRun[]): EvalOverviewItem[] {
  const caseCount = suites.reduce((total, suite) => total + Math.max(0, Number(suite.case_count || 0)), 0);
  const attentionCount = runs.filter((run) => run.status === "failed" || run.status === "error").length;
  return [
    { key: "suites", label: legacyLabel("suitesMetric"), value: suites.length },
    { key: "cases", label: legacyLabel("casesMetric"), value: caseCount },
    { key: "runs", label: legacyLabel("runsMetric"), value: runs.length },
    { key: "attention", label: legacyLabel("attentionMetric"), value: attentionCount },
  ];
}

export function countEvalCaseStatuses(caseResults: EvalCaseResult[]): EvalCaseStatusCounts {
  const counts: EvalCaseStatusCounts = { passed: 0, failed: 0, running: 0, pending: 0 };
  for (const result of caseResults) {
    if (result.status === "passed") {
      counts.passed += 1;
    } else if (result.status === "failed" || result.status === "error") {
      counts.failed += 1;
    } else if (result.status === "running") {
      counts.running += 1;
    } else {
      counts.pending += 1;
    }
  }
  return counts;
}

export function buildEvalCaseCards(cases: EvalCase[], run: EvalRun | null): EvalCaseCard[] {
  const resultsByCaseId = new Map((run?.case_results ?? []).map((result) => [result.case_id, result]));
  return cases.map((evalCase) => {
    const result = resultsByCaseId.get(evalCase.case_id);
    const artifacts = result?.artifacts && typeof result.artifacts === "object" ? result.artifacts : {};
    const checkResults = result?.check_results ?? [];
    const failureDiagnostics = buildFailureDiagnostics(evalCase.case_id, result);
    return {
      caseId: evalCase.case_id,
      title: evalCase.name || result?.case_name || evalCase.case_id,
      description: evalCase.description || "",
      status: result?.status || "pending",
      graphRunId: result?.graph_run_id || "",
      checkCount: checkResults.length || evalCase.checks.length,
      failedCheckCount: checkResults.filter((check) => check.status === "failed" || check.status === "error").length,
      artifactCount: Object.keys(artifacts).filter((key) => !["saved_outputs", "output_previews"].includes(key)).length,
      finalOutputPreview: formatPreview(result?.final_output),
      expectedPreview: formatPreview(evalCase.expected),
      actualPreview: formatPreview(result?.final_output),
      error: result?.error || "",
      checks: checkResults,
      checkComparisons: buildCheckComparisons(evalCase.case_id, checkResults),
      primaryFailure: failureDiagnostics[0]?.message || "",
      failureDiagnostics,
    };
  });
}

export function latestEvalRun(runs: EvalRun[]): EvalRun | null {
  return runs[0] ?? null;
}

function formatPreview(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 240);
  }
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return String(value).slice(0, 240);
  }
}

function buildCheckComparisons(caseId: string, checks: EvalCaseResult["check_results"]): EvalCheckComparison[] {
  return checks
    .map((check, index) => {
      const expectedPreview = formatPreview(check.expected);
      const actualPreview = formatPreview(check.actual);
      return {
        key: `${caseId}-${index}`,
        label: check.name || check.kind || legacyLabel("check"),
        status: check.status || "pending",
        message: check.message || "",
        expectedPreview,
        actualPreview,
      };
    })
    .filter((comparison) => comparison.expectedPreview || comparison.actualPreview || comparison.message);
}

function buildFailureDiagnostics(caseId: string, result: EvalCaseResult | undefined): EvalFailureDiagnostic[] {
  if (!result || !["failed", "error"].includes(result.status)) {
    return [];
  }

  const diagnostics: EvalFailureDiagnostic[] = [];
  const caseError = textValue(result.error);
  if (caseError) {
    diagnostics.push({
      key: `${caseId}-case-error`,
      kind: "case_error",
      label: legacyLabel("caseError"),
      status: result.status || "failed",
      message: caseError,
      detailPreview: "",
    });
  }

  (result.node_failures ?? []).forEach((failure, index) => {
    const label = textValue(failure.node_id) || textValue(failure.node) || legacyLabel("nodeFailure");
    const message = textValue(failure.error) || textValue(failure.message) || formatPreview(failure);
    diagnostics.push({
      key: `${caseId}-node-${index}`,
      kind: "node_failure",
      label,
      status: textValue(failure.status) || "failed",
      message,
      detailPreview: "",
    });
  });

  (result.check_results ?? [])
    .filter((check) => check.status === "failed" || check.status === "error")
    .forEach((check, index) => {
      const message = check.message || formatPreview(check.actual) || formatPreview(check.details);
      diagnostics.push({
        key: `${caseId}-check-${index}`,
        kind: "check_failure",
        label: check.name || check.kind || legacyLabel("checkFailure"),
        status: check.status || "failed",
        message,
        detailPreview: formatPreview(check.details) || formatPreview(check.actual),
      });
    });

  return diagnostics;
}

function legacyLabel(key: string): string {
  return `evals.${key}`;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
