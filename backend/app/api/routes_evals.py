from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.evaluator import store
from app.evaluator.checks import evaluate_case_checks, summarize_check_status
from app.evaluator import collector
from app.evaluator.llm_judge import create_llm_judge_runner
from app.evaluator import runner


# 开发者内部遗留入口：当前冻结，保留现有内部工具兼容。
router = APIRouter(prefix="/api/evals", tags=["evals"])


@router.get("/suites")
def list_eval_suites() -> list[dict[str, Any]]:
    return store.list_eval_suites()


@router.post("/suites")
def create_eval_suite(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.create_eval_suite(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/suites/{suite_id}/cases")
def list_eval_cases(suite_id: str) -> list[dict[str, Any]]:
    try:
        return store.list_eval_cases(suite_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval suite '{suite_id}' does not exist.") from exc


@router.post("/suites/{suite_id}/cases")
def create_eval_case(suite_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.create_eval_case(suite_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval suite '{suite_id}' does not exist.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/runs")
def create_eval_run(payload: dict[str, Any]) -> dict[str, Any]:
    suite_id = str(payload.get("suite_id") or "").strip()
    if not suite_id:
        raise HTTPException(status_code=422, detail="suite_id is required.")
    try:
        return store.create_eval_run(
            suite_id,
            requested_by=str(payload.get("requested_by") or ""),
            metadata=dict(payload.get("metadata") or {}) if isinstance(payload.get("metadata"), dict) else {},
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval suite '{suite_id}' does not exist.") from exc


@router.get("/suites/{suite_id}/runs")
def list_eval_runs(suite_id: str) -> list[dict[str, Any]]:
    try:
        return store.list_eval_runs(suite_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval suite '{suite_id}' does not exist.") from exc


@router.get("/runs/{eval_run_id}")
def get_eval_run(eval_run_id: str) -> dict[str, Any]:
    try:
        return store.load_eval_run(eval_run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval run '{eval_run_id}' does not exist.") from exc


@router.post("/runs/{eval_run_id}/cases/{case_id}/result")
def record_eval_case_result(eval_run_id: str, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.record_eval_case_result(eval_run_id, case_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval case result '{case_id}' does not exist.") from exc


@router.post("/runs/{eval_run_id}/cases/run")
def run_eval_run_cases(
    eval_run_id: str,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        eval_run = store.load_eval_run(eval_run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval run '{eval_run_id}' does not exist.") from exc
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for case_result in eval_run["case_results"]:
        try:
            results.append(
                _start_eval_case_result(
                    eval_run,
                    case_result,
                    background_tasks=background_tasks,
                    requested_by=str(request_payload.get("requested_by") or ""),
                )
            )
        except Exception as exc:  # Keep batch progress inspectable when one case cannot start.
            errors.append({"case_id": str(case_result.get("case_id") or ""), "message": str(exc)})
    return {
        "eval_run_id": eval_run_id,
        "results": results,
        "started_count": len(results),
        "skipped_count": len(errors),
        "errors": errors,
    }


@router.post("/runs/{eval_run_id}/cases/collect")
def collect_eval_run_cases(eval_run_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        eval_run = store.load_eval_run(eval_run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Eval run '{eval_run_id}' does not exist.") from exc
    judge_runner = _judge_runner_from_payload(request_payload)
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    skipped_count = 0
    for case_result in eval_run["case_results"]:
        if not case_result.get("graph_run_id"):
            skipped_count += 1
            continue
        try:
            results.append(_collect_eval_case_result(eval_run_id, case_result, judge_runner=judge_runner))
        except collector.EvalGraphRunNotReady as exc:
            skipped_count += 1
            errors.append({"case_id": str(case_result.get("case_id") or ""), "message": str(exc)})
        except Exception as exc:  # Keep other cases collectable when one case has stale references.
            errors.append({"case_id": str(case_result.get("case_id") or ""), "message": str(exc)})
    return {
        "eval_run_id": eval_run_id,
        "results": results,
        "collected_count": len(results),
        "skipped_count": skipped_count,
        "errors": errors,
    }


@router.post("/runs/{eval_run_id}/cases/{case_id}/run")
def run_eval_case_result(
    eval_run_id: str,
    case_id: str,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        eval_run = store.load_eval_run(eval_run_id)
        case_result = _find_case_result(eval_run, case_id)
        return _start_eval_case_result(
            eval_run,
            case_result,
            background_tasks=background_tasks,
            requested_by=str(request_payload.get("requested_by") or ""),
        )
    except (KeyError, StopIteration, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=f"Eval case result '{case_id}' does not exist.") from exc


@router.post("/runs/{eval_run_id}/cases/{case_id}/collect")
def collect_eval_case_result(
    eval_run_id: str,
    case_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        eval_run = store.load_eval_run(eval_run_id)
        case_result = _find_case_result(eval_run, case_id)
        return _collect_eval_case_result(
            eval_run_id,
            case_result,
            judge_runner=_judge_runner_from_payload(request_payload),
        )
    except collector.EvalGraphRunNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (KeyError, StopIteration, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=f"Eval case result '{case_id}' does not exist.") from exc


@router.post("/runs/{eval_run_id}/cases/{case_id}/evaluate")
def evaluate_eval_case_result(eval_run_id: str, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        eval_run = store.load_eval_run(eval_run_id)
        case_result = _find_case_result(eval_run, case_id)
        case = store.load_eval_case(case_result["suite_id"], case_result["case_id"])
        final_output = dict(payload.get("final_output") or {}) if isinstance(payload.get("final_output"), dict) else {}
        artifacts = dict(payload.get("artifacts") or {}) if isinstance(payload.get("artifacts"), dict) else {}
        check_results = evaluate_case_checks(
            case,
            final_output=final_output,
            artifacts=artifacts,
            judge_runner=_judge_runner_from_payload(payload),
        )
        return store.record_eval_case_result(
            eval_run_id,
            case_result["case_id"],
            {
                "graph_run_id": payload.get("graph_run_id"),
                "status": summarize_check_status(check_results),
                "final_output": final_output,
                "artifacts": artifacts,
                "node_failures": payload.get("node_failures") or [],
                "human_review": payload.get("human_review") or {},
                "check_results": check_results,
            },
        )
    except (KeyError, StopIteration) as exc:
        raise HTTPException(status_code=404, detail=f"Eval case result '{case_id}' does not exist.") from exc


def _find_case_result(eval_run: dict[str, Any], case_id: str) -> dict[str, Any]:
    normalized_case_id = _normalize_identifier(case_id)
    return next(
        result for result in eval_run["case_results"] if result["case_id"] == normalized_case_id
    )


def _start_eval_case_result(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    *,
    background_tasks: BackgroundTasks,
    requested_by: str,
) -> dict[str, Any]:
    suite = store.load_eval_suite(case_result["suite_id"])
    case = store.load_eval_case(case_result["suite_id"], case_result["case_id"])
    run_state = runner.start_eval_case_graph_run(
        {
            **eval_run,
            "target_graph_id": suite["target_graph_id"],
            "target_template_id": suite["target_template_id"],
        },
        case_result,
        case,
        background_tasks=background_tasks,
        requested_by=requested_by,
    )
    return store.record_eval_case_result(
        eval_run["eval_run_id"],
        case_result["case_id"],
        {
            "graph_run_id": run_state["run_id"],
            "status": "running",
            "final_output": {},
            "artifacts": {},
            "node_failures": [],
            "human_review": {},
            "check_results": [],
        },
    )


def _collect_eval_case_result(
    eval_run_id: str,
    case_result: dict[str, Any],
    *,
    judge_runner: Any | None = None,
) -> dict[str, Any]:
    case = store.load_eval_case(case_result["suite_id"], case_result["case_id"])
    if judge_runner is None:
        payload = collector.collect_eval_case_result_payload(case, case_result)
    else:
        payload = collector.collect_eval_case_result_payload(case, case_result, judge_runner=judge_runner)
    return store.record_eval_case_result(eval_run_id, case_result["case_id"], payload)


def _judge_runner_from_payload(payload: dict[str, Any]) -> Any | None:
    if not _truthy(payload.get("run_llm_judge")):
        return None
    return create_llm_judge_runner()


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _normalize_identifier(value: Any) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    return "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)[:100]
