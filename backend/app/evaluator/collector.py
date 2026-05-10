from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from app.core.storage.run_store import load_run
from app.evaluator.checks import evaluate_case_checks, summarize_check_status


TERMINAL_RUN_STATUSES = {"completed", "failed", "cancelled", "error"}


class EvalGraphRunNotReady(ValueError):
    pass


def collect_eval_case_result_payload(case: dict[str, Any], case_result: dict[str, Any]) -> dict[str, Any]:
    graph_run_id = str(case_result.get("graph_run_id") or "").strip()
    if not graph_run_id:
        raise KeyError("graph_run_id")

    graph_run = load_run(graph_run_id)
    run_status = str(graph_run.get("status") or "").strip()
    if run_status not in TERMINAL_RUN_STATUSES:
        raise EvalGraphRunNotReady(f"Graph run '{graph_run_id}' is not terminal: {run_status or 'unknown'}.")

    final_output = extract_final_output(graph_run)
    artifacts = extract_artifacts(graph_run)
    node_failures = extract_node_failures(graph_run)
    errors = [str(error) for error in graph_run.get("errors", []) if str(error or "").strip()]
    if run_status == "completed" and not node_failures and not errors:
        check_results = evaluate_case_checks(case, final_output=final_output, artifacts=artifacts)
        status = summarize_check_status(check_results)
        error = ""
    else:
        check_results = []
        status = "error"
        error = "\n".join(errors) or f"Graph run '{graph_run_id}' ended with status '{run_status}'."

    return {
        "graph_run_id": graph_run_id,
        "status": status,
        "final_output": final_output,
        "error": error,
        "artifacts": artifacts,
        "node_failures": node_failures,
        "human_review": case_result.get("human_review") or {},
        "check_results": check_results,
    }


def extract_final_output(graph_run: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for preview in _as_list(graph_run.get("output_previews")):
        if not isinstance(preview, dict):
            continue
        key = _output_key(preview)
        if not key:
            continue
        value = copy.deepcopy(preview.get("value"))
        output[key] = value
        tail_key = key.rsplit(".", 1)[-1]
        if tail_key and tail_key not in output:
            output[tail_key] = copy.deepcopy(value)

    artifacts = graph_run.get("artifacts") if isinstance(graph_run.get("artifacts"), dict) else {}
    state_values = artifacts.get("state_values") if isinstance(artifacts.get("state_values"), dict) else {}
    for key, value in state_values.items():
        output.setdefault(str(key), copy.deepcopy(value))

    final_result = graph_run.get("final_result")
    if final_result not in (None, "", [], {}):
        output["final_result"] = copy.deepcopy(final_result)
    return output


def extract_artifacts(graph_run: dict[str, Any]) -> dict[str, Any]:
    artifacts: dict[str, Any] = {}
    for saved in _collect_saved_outputs(graph_run):
        if not isinstance(saved, dict):
            continue
        record = copy.deepcopy(saved)
        for key in _artifact_keys(record):
            artifacts.setdefault(key, record)
    artifacts["saved_outputs"] = _collect_saved_outputs(graph_run)
    artifacts["output_previews"] = _as_list(graph_run.get("output_previews"))
    return artifacts


def extract_node_failures(graph_run: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for execution in _as_list(graph_run.get("node_executions")):
        if not isinstance(execution, dict):
            continue
        status = str(execution.get("status") or "").strip()
        if status not in {"failed", "error"}:
            continue
        failures.append(
            {
                "node_id": str(execution.get("node_id") or ""),
                "node_type": str(execution.get("node_type") or ""),
                "status": status,
                "errors": _as_list(execution.get("errors")),
            }
        )
    return failures


def _collect_saved_outputs(graph_run: dict[str, Any]) -> list[dict[str, Any]]:
    saved_outputs = [copy.deepcopy(item) for item in _as_list(graph_run.get("saved_outputs")) if isinstance(item, dict)]
    artifacts = graph_run.get("artifacts") if isinstance(graph_run.get("artifacts"), dict) else {}
    for exported in _as_list(artifacts.get("exported_outputs")):
        if not isinstance(exported, dict) or not isinstance(exported.get("saved_file"), dict):
            continue
        saved_file = dict(exported["saved_file"])
        saved_outputs.append(
            {
                **saved_file,
                "node_id": exported.get("node_id"),
                "source_key": exported.get("source_key") or saved_file.get("source_key", ""),
            }
        )
    return saved_outputs


def _output_key(preview: dict[str, Any]) -> str:
    for raw_key in (preview.get("source_key"), preview.get("label"), preview.get("node_id")):
        key = str(raw_key or "").strip()
        if key:
            return key
    return ""


def _artifact_keys(record: dict[str, Any]) -> list[str]:
    keys: list[str] = []
    for raw_key in (record.get("file_name"), record.get("source_key"), record.get("path")):
        key = str(raw_key or "").strip()
        if key:
            keys.append(key)
            if "/" in key:
                keys.append(Path(key).name)
    return _dedupe(keys)


def _as_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
