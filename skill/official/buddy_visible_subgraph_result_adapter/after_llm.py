from __future__ import annotations

import json
import sys
from typing import Any


def buddy_visible_subgraph_result_adapter(**skill_inputs: Any) -> dict[str, Any]:
    selected = _normalize_selected_capability(skill_inputs.get("selected_capability"))
    if selected.get("kind") != "subgraph":
        return _failed(
            code="unsupported_capability_kind",
            message="可见子图结果适配器只接受原始 kind=subgraph 的目标能力。",
            detail={"selected_capability": selected},
        )

    visible_result = _normalize_result_package(skill_inputs.get("visible_operation_result"))
    if not visible_result:
        return _failed(
            code="invalid_visible_operation_result",
            message="visible_operation_result 必须是页面操作 workflow 返回的 result_package。",
            detail={"visible_operation_result": skill_inputs.get("visible_operation_result")},
        )

    user_goal = _compact_text(skill_inputs.get("user_goal"))
    source_key = selected["key"]
    source_name = selected.get("name") or source_key
    status = _compact_text(visible_result.get("status")) or "succeeded"
    error = _compact_text(visible_result.get("error"))
    error_type = _compact_text(visible_result.get("errorType") or visible_result.get("error_type"))
    duration_ms = _coerce_int(visible_result.get("durationMs") or visible_result.get("duration_ms"))
    visible_outputs = visible_result.get("outputs") if isinstance(visible_result.get("outputs"), dict) else {}
    final_reply = _output_value(visible_outputs.get("final_reply"))
    operation_report = _output_value(visible_outputs.get("operation_report"))

    package = {
        "kind": "result_package",
        "sourceType": "subgraph",
        "sourceKey": source_key,
        "sourceName": source_name,
        "status": "failed" if status == "failed" or error else status,
        "inputs": {
            "user_goal": user_goal,
            "target_capability": selected,
            "visible_operation_capability": "toograph_page_operation_workflow",
        },
        "outputs": {
            "final_reply": {
                "name": "可见模板运行回复",
                "description": "页面操作 workflow 在运行目标模板后生成的用户可见回复。",
                "type": "markdown",
                "value": final_reply,
            },
            "operation_report": {
                "name": "可见模板运行报告",
                "description": "页面操作 workflow 返回的结构化运行报告。",
                "type": "json",
                "value": operation_report,
            },
            "visible_operation_result": {
                "name": "可见页面操作结果包",
                "description": "内部 toograph_page_operation_workflow 的完整 result_package。",
                "type": "result_package",
                "value": visible_result,
            },
        },
        "durationMs": duration_ms,
        "error": error,
        "errorType": error_type,
    }
    return {
        "ok": True,
        "result_package": package,
        "error": None,
        "activity_events": [
            {
                "kind": "capability_result_adapter",
                "summary": f"Wrapped visible template run result for {source_name}.",
                "status": "failed" if package["status"] == "failed" else "succeeded",
                "detail": {
                    "target_capability": selected,
                    "visible_operation_source": visible_result.get("sourceKey"),
                    "status": package["status"],
                },
                "error": error or None,
            }
        ],
    }


def _failed(*, code: str, message: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    error = {
        "code": code,
        "message": message,
        "recoverable": True,
    }
    return {
        "ok": False,
        "result_package": {},
        "error": error,
        "activity_events": [
            {
                "kind": "capability_result_adapter",
                "summary": message,
                "status": "failed",
                "detail": {"error": error, **(detail or {})},
                "error": message,
            }
        ],
    }


def _normalize_selected_capability(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}
        try:
            return _normalize_selected_capability(json.loads(stripped))
        except json.JSONDecodeError:
            return {}
    if not isinstance(value, dict):
        return {}
    kind = _compact_text(value.get("kind")).lower()
    key = _compact_text(value.get("key"))
    if not kind or not key:
        return {}
    return {
        "kind": kind,
        "key": key,
        "name": _compact_text(value.get("name")) or key,
        "description": _compact_text(value.get("description")),
    }


def _normalize_result_package(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}
        try:
            return _normalize_result_package(json.loads(stripped))
        except json.JSONDecodeError:
            return {}
    if not isinstance(value, dict):
        return {}
    if value.get("kind") != "result_package":
        return {}
    return dict(value)


def _output_value(value: Any) -> Any:
    if isinstance(value, dict) and "value" in value:
        return value.get("value")
    return value


def _coerce_int(value: Any) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    if not isinstance(payload, dict):
        raise SystemExit("Skill input must be a JSON object.")
    print(json.dumps(buddy_visible_subgraph_result_adapter(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
