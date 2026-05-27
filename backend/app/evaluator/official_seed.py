from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.evaluator import store


ROOT_DIR = Path(__file__).resolve().parents[3]
DEFAULT_TEMPLATE_ROOT = ROOT_DIR / "graph_template" / "official"

EXECUTABLE_RULE_KEYS = {"must_include", "forbidden", "not_contains"}
EXECUTABLE_KNOWLEDGE_RETRIEVAL_KEYS = {
    "min_results",
    "required_chunk_ids",
    "required_citation_ids",
    "required_source_paths",
    "required_terms",
    "forbidden_terms",
    "max_citations",
    "max_context_chars",
}
EXECUTABLE_MEMORY_RETRIEVAL_KEYS = {
    "min_results",
    "required_memory_ids",
    "required_source_refs",
    "required_terms",
    "forbidden_terms",
    "max_context_chars",
    "required_reranker_model_ref",
    "required_rerank_status",
    "required_top_memory_id",
    "required_ranked_memory_ids",
}
EXECUTABLE_HYBRID_RECALL_KEYS = {
    "min_memory_results",
    "min_session_results",
    "required_memory_ids",
    "required_message_ids",
    "required_source_refs",
    "required_terms",
    "forbidden_terms",
    "max_context_chars",
}
EXECUTABLE_CAPABILITY_SELECTION_KEYS = {
    "required_requested",
    "required_selected",
    "required_rejected",
    "required_fallbacks",
    "required_terms",
    "forbidden_terms",
    "min_rejected",
    "min_fallbacks",
}
EXECUTABLE_SCHEDULER_RUN_KEYS = {
    "required_job_id",
    "required_job_run_id",
    "required_run_id",
    "required_trigger_reason",
    "required_status",
    "required_retry_decision",
    "required_pending_retry",
    "required_delivery_result",
    "required_graph_permission_mode",
    "required_permission_policy",
    "required_permission_policy_source",
    "required_pending_permission_approval",
    "required_terms",
    "forbidden_terms",
}
EXECUTABLE_DELEGATION_WORKER_KEYS = {
    "required_task_id",
    "required_status",
    "required_output_keys",
    "required_source_refs",
    "required_terms",
    "forbidden_terms",
}
EXECUTABLE_PROVIDER_FALLBACK_KEYS = {
    "required_requested",
    "required_selected",
    "required_failed",
    "required_capabilities",
    "required_permissions",
    "required_terms",
    "forbidden_terms",
    "min_fallbacks",
}


def seed_official_eval_suites(template_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(template_root) if template_root is not None else DEFAULT_TEMPLATE_ROOT
    summary: dict[str, Any] = {
        "suite_count": 0,
        "created_or_updated_case_count": 0,
        "suite_ids": [],
        "errors": [],
    }
    if not root.is_dir():
        return summary

    for eval_cases_path in sorted(root.glob("*/eval_cases.json")):
        try:
            suite_payload, case_payloads = _load_eval_package(eval_cases_path, root)
            suite = store.create_eval_suite(suite_payload)
            summary["suite_count"] += 1
            summary["suite_ids"].append(suite["suite_id"])
            for case_payload in case_payloads:
                store.create_eval_case(suite["suite_id"], case_payload)
                summary["created_or_updated_case_count"] += 1
        except Exception as exc:  # Keep app startup available when one package is malformed.
            summary["errors"].append(
                {
                    "path": str(_relative_to_root(eval_cases_path, root)),
                    "message": str(exc),
                }
            )
    return summary


def _load_eval_package(eval_cases_path: Path, root: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    template_dir = eval_cases_path.parent
    template = _load_json_object(template_dir / "template.json")
    template_id = _text(template.get("template_id")) or template_dir.name
    template_metadata = _dict(template.get("metadata"))
    package = _load_json(eval_cases_path)

    if isinstance(package, list):
        package_record: dict[str, Any] = {}
        raw_cases = package
    else:
        package_record = _dict(package)
        raw_cases = _list(package_record.get("cases"))

    suite_id = _text(package_record.get("suite") or package_record.get("suite_id")) or f"{template_id}_official"
    suite_payload = {
        "suite_id": suite_id,
        "name": _text(package_record.get("name")) or f"{_text(template.get('label')) or template_id} official evals",
        "description": _text(package_record.get("description")) or _text(template.get("description")),
        "target_template_id": template_id,
        "tags": _suite_tags(template_metadata),
        "metadata": {
            "source": "official_template_eval_cases",
            "template_id": template_id,
            "source_path": str(_relative_to_root(eval_cases_path, root)),
            "template_label": _text(template.get("label")),
        },
    }

    case_payloads = [
        _normalize_case(template_dir, root, eval_cases_path, template_id, raw_case)
        for raw_case in raw_cases
        if isinstance(raw_case, dict)
    ]
    return suite_payload, case_payloads


def _normalize_case(
    template_dir: Path,
    root: Path,
    eval_cases_path: Path,
    template_id: str,
    raw_case: dict[str, Any],
) -> dict[str, Any]:
    case_id = _text(raw_case.get("case_id") or raw_case.get("caseId") or raw_case.get("id"))
    if not case_id:
        raise ValueError(f"Eval case in {eval_cases_path} is missing case_id.")
    return {
        "case_id": case_id,
        "name": _text(raw_case.get("name")) or case_id,
        "description": _text(raw_case.get("description")),
        "input_values": _case_input_values(template_dir, raw_case),
        "expected": _dict(raw_case.get("expected")),
        "checks": [_normalize_check(check) for check in _list(raw_case.get("checks"))],
        "metadata": {
            "source": "official_template_eval_cases",
            "template_id": template_id,
            "source_path": str(_relative_to_root(eval_cases_path, root)),
            **_dict(raw_case.get("metadata")),
        },
    }


def _case_input_values(template_dir: Path, raw_case: dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw_case.get("input_values"), dict):
        return _dict(raw_case.get("input_values"))
    if isinstance(raw_case.get("inputs"), dict):
        return _dict(raw_case.get("inputs"))

    input_path = _text(raw_case.get("input"))
    if not input_path:
        return {}
    loaded = _load_json(template_dir / input_path)
    if isinstance(loaded, dict):
        if isinstance(loaded.get("input_values"), dict):
            return _dict(loaded.get("input_values"))
        if isinstance(loaded.get("inputs"), dict):
            return _dict(loaded.get("inputs"))
        return dict(loaded)
    return {}


def _normalize_check(check: Any) -> dict[str, Any]:
    record = _dict(check)
    kind = _text(record.get("kind")).lower()
    if kind in {"llm_judge", "judge"}:
        return {**record, "kind": "llm_judge"}
    if _is_executable_check(record, kind):
        return record
    return _llm_judge_check(record, kind)


def _is_executable_check(record: dict[str, Any], kind: str) -> bool:
    if kind == "schema":
        return bool(_list(record.get("required")))
    if kind == "rule":
        return any(_list(record.get(key)) for key in EXECUTABLE_RULE_KEYS)
    if kind == "artifact":
        return bool(_text(record.get("target"))) and not _descriptive_only(record)
    if kind == "citation":
        return bool(record.get("min_citations")) and not _descriptive_only(record)
    if kind in {"knowledge_retrieval", "knowledge_context"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_KNOWLEDGE_RETRIEVAL_KEYS)
    if kind in {"memory_retrieval", "memory_context"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_MEMORY_RETRIEVAL_KEYS)
    if kind in {"hybrid_recall", "session_memory_recall", "hybrid_memory_recall"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_HYBRID_RECALL_KEYS)
    if kind in {"capability_selection", "capability_selector"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_CAPABILITY_SELECTION_KEYS)
    if kind in {"scheduler_run", "scheduled_graph_job_run"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_SCHEDULER_RUN_KEYS)
    if kind in {"delegation_worker", "worker_result", "worker_result_package"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_DELEGATION_WORKER_KEYS)
    if kind in {"provider_fallback", "model_provider_fallback", "provider_fallback_trace"}:
        return any(_has_concrete_value(record.get(key)) for key in EXECUTABLE_PROVIDER_FALLBACK_KEYS)
    return False


def _llm_judge_check(record: dict[str, Any], original_kind: str) -> dict[str, Any]:
    rubric = (
        _text(record.get("rubric"))
        or _text(record.get("description"))
        or _text(record.get("expectation"))
        or _text(record.get("key"))
        or _text(record.get("target"))
        or f"Review the output for the original {original_kind or 'unknown'} check."
    )
    check = {
        "kind": "llm_judge",
        "name": _text(record.get("name") or record.get("key") or record.get("target") or original_kind or "judge"),
        "rubric": rubric,
        "details": {
            "original_kind": original_kind or "unknown",
            "original_check": record,
        },
    }
    criteria = _list(record.get("criteria"))
    if criteria:
        check["criteria"] = criteria
    min_score = record.get("min_score")
    if min_score is not None:
        check["min_score"] = min_score
    model_ref = record.get("model_ref")
    if isinstance(model_ref, dict):
        check["model_ref"] = model_ref
    return check


def _descriptive_only(record: dict[str, Any]) -> bool:
    return bool(_text(record.get("description") or record.get("expectation")))


def _has_concrete_value(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    if isinstance(value, (int, float)):
        return value > 0
    return bool(value)


def _suite_tags(template_metadata: dict[str, Any]) -> list[str]:
    tags = ["official", "template"]
    category = _text(template_metadata.get("category"))
    role = _text(template_metadata.get("role"))
    for tag in [category, role, *_string_list(template_metadata.get("tags"))]:
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_json_object(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    loaded = _load_json(path)
    return _dict(loaded)


def _relative_to_root(path: Path, root: Path) -> Path:
    try:
        return path.relative_to(root.parent)
    except ValueError:
        return path


def _dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _string_list(value: Any) -> list[str]:
    return [_text(item) for item in _list(value) if _text(item)]


def _text(value: Any) -> str:
    return str(value or "").strip()
