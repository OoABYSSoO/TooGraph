// 开发者内部遗留 API：当前冻结，保留现有内部工具兼容。
import type { EvalBatchActionResult, EvalCase, EvalCaseResult, EvalCollectOptions, EvalRun, EvalSuite } from "@/types/eval";

import { apiGet, apiPost } from "./http.ts";

export async function fetchEvalSuites(): Promise<EvalSuite[]> {
  return apiGet<EvalSuite[]>("/api/evals/suites");
}

export async function fetchEvalCases(suiteId: string): Promise<EvalCase[]> {
  return apiGet<EvalCase[]>(`/api/evals/suites/${encodeURIComponent(suiteId)}/cases`);
}

export async function fetchEvalRuns(suiteId: string): Promise<EvalRun[]> {
  return apiGet<EvalRun[]>(`/api/evals/suites/${encodeURIComponent(suiteId)}/runs`);
}

export async function createEvalRun(suiteId: string): Promise<EvalRun> {
  return apiPost<EvalRun>("/api/evals/runs", { suite_id: suiteId });
}

export async function runEvalCase(evalRunId: string, caseId: string): Promise<EvalCaseResult> {
  return apiPost<EvalCaseResult>(`/api/evals/runs/${encodeURIComponent(evalRunId)}/cases/${encodeURIComponent(caseId)}/run`, {});
}

export async function runEvalRunCases(evalRunId: string): Promise<EvalBatchActionResult> {
  return apiPost<EvalBatchActionResult>(`/api/evals/runs/${encodeURIComponent(evalRunId)}/cases/run`, {});
}

export async function collectEvalCaseResult(
  evalRunId: string,
  caseId: string,
  options: EvalCollectOptions = {},
): Promise<EvalCaseResult> {
  return apiPost<EvalCaseResult>(
    `/api/evals/runs/${encodeURIComponent(evalRunId)}/cases/${encodeURIComponent(caseId)}/collect`,
    buildEvalCollectPayload(options),
  );
}

export async function collectEvalRunCases(
  evalRunId: string,
  options: EvalCollectOptions = {},
): Promise<EvalBatchActionResult> {
  return apiPost<EvalBatchActionResult>(
    `/api/evals/runs/${encodeURIComponent(evalRunId)}/cases/collect`,
    buildEvalCollectPayload(options),
  );
}

function buildEvalCollectPayload(options: EvalCollectOptions): Record<string, unknown> {
  return options.runLlmJudge ? { run_llm_judge: true } : {};
}
