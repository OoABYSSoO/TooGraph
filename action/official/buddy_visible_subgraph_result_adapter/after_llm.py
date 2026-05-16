from __future__ import annotations

import json
import sys
from typing import Any


DEFAULT_SELECTED_CAPABILITY = {
    "kind": "subgraph",
    "key": "toograph_page_operation_workflow",
    "name": "操作 TooGraph 页面",
    "description": "固定 TooGraph 页面操作入口。",
}


def buddy_visible_subgraph_result_adapter(**action_inputs: Any) -> dict[str, Any]:
    selected = _normalize_selected_capability(action_inputs.get("selected_capability"))
    if selected.get("kind") != "subgraph":
        return _failed(
            code="unsupported_capability_kind",
            message="可见子图结果适配器只接受原始 kind=subgraph 的目标能力。",
            detail={"selected_capability": selected},
        )

    user_goal = _compact_text(action_inputs.get("user_goal"))
    operation_result = _normalize_json_object(action_inputs.get("operation_result"))
    operation_report = _normalize_json_object(action_inputs.get("operation_report"))
    direct_operation = operation_report or operation_result
    if direct_operation:
        return _wrap_direct_template_operation(
            selected=selected,
            user_goal=user_goal,
            operation_report=direct_operation,
        )

    page_operation_final_reply = _compact_text(action_inputs.get("page_operation_final_reply"))
    page_operation_workflow_report = _normalize_json_object(action_inputs.get("page_operation_workflow_report"))
    if page_operation_final_reply or page_operation_workflow_report:
        return _wrap_page_operation_workflow_outputs(
            selected=selected,
            user_goal=user_goal,
            final_reply=page_operation_final_reply,
            operation_report=page_operation_workflow_report,
        )

    visible_result = _normalize_result_package(action_inputs.get("visible_operation_result"))
    if visible_result:
        return _wrap_result_package(
            selected=selected,
            user_goal=user_goal,
            visible_result=visible_result,
        )

    return _failed(
        code="invalid_visible_operation_result",
        message="需要 operation_report 或页面操作 workflow 输出，才能适配可见图模板结果。",
        detail={
            "operation_report": action_inputs.get("operation_report"),
            "page_operation_final_reply": action_inputs.get("page_operation_final_reply"),
            "page_operation_workflow_report": action_inputs.get("page_operation_workflow_report"),
            "visible_operation_result": action_inputs.get("visible_operation_result"),
        },
    )


def _wrap_direct_template_operation(
    *,
    selected: dict[str, Any],
    user_goal: str,
    operation_report: dict[str, Any],
) -> dict[str, Any]:
    source_key = selected["key"]
    source_name = selected.get("name") or source_key
    status = _operation_status(operation_report)
    error = _compact_text(operation_report.get("error"))
    latest_run = _latest_run_from_operation_report(operation_report)
    final_reply = _direct_template_final_reply(
        source_name=source_name,
        operation_result=operation_report,
        latest_run=latest_run,
        error=error,
    )
    report_value = {
        "operation_report": operation_report,
        "latest_foreground_run": latest_run,
    }
    package = _base_package(
        selected=selected,
        user_goal=user_goal,
        visible_operation_capability="toograph_page_operator",
        status="failed" if _is_failure_status(status) or error else status,
        final_reply=final_reply,
        operation_report=report_value,
        visible_operation_result=operation_report,
        duration_ms=_coerce_int(operation_report.get("durationMs") or operation_report.get("duration_ms")),
        error=error,
        error_type=_compact_text(operation_report.get("errorType") or operation_report.get("error_type")),
        final_reply_name="可见模板运行回复",
        final_reply_description="页面操作 Action 在运行目标模板后得到的用户可见摘要。",
        operation_report_name="可见模板运行报告",
        operation_report_description="固定模板运行 Action 和前端续跑返回的结构化操作报告。",
        visible_result_name="固定模板页面操作结果",
        visible_result_description="toograph_page_operator 触发并等待目标模板运行后的紧凑操作结果。",
    )
    return _success(package, selected=selected, source_name=source_name, visible_operation_source="toograph_page_operator")


def _wrap_page_operation_workflow_outputs(
    *,
    selected: dict[str, Any],
    user_goal: str,
    final_reply: str,
    operation_report: dict[str, Any],
) -> dict[str, Any]:
    source_key = selected["key"]
    source_name = selected.get("name") or source_key
    error = _compact_text(operation_report.get("error"))
    status = _compact_text(operation_report.get("status"))
    if not status:
        status = "failed" if error or operation_report.get("goal_completed") is False else "succeeded"
    package = _base_package(
        selected=selected,
        user_goal=user_goal,
        visible_operation_capability="toograph_page_operation_workflow",
        status="failed" if _is_failure_status(status) or error else status,
        final_reply=final_reply,
        operation_report=operation_report,
        visible_operation_result=operation_report,
        duration_ms=_coerce_int(operation_report.get("durationMs") or operation_report.get("duration_ms")),
        error=error,
        error_type=_compact_text(operation_report.get("errorType") or operation_report.get("error_type")),
        final_reply_name="页面操作回复",
        final_reply_description="页面操作 workflow 生成的用户可见回复。",
        operation_report_name="页面操作报告",
        operation_report_description="页面操作 workflow 返回的结构化报告。",
        visible_result_name="页面操作 workflow 报告",
        visible_result_description="toograph_page_operation_workflow 的结构化输出报告。",
    )
    return _success(
        package,
        selected=selected,
        source_name=source_name,
        visible_operation_source="toograph_page_operation_workflow",
    )


def _wrap_result_package(
    *,
    selected: dict[str, Any],
    user_goal: str,
    visible_result: dict[str, Any],
) -> dict[str, Any]:
    source_key = selected["key"]
    source_name = selected.get("name") or source_key
    status = _compact_text(visible_result.get("status")) or "succeeded"
    error = _compact_text(visible_result.get("error"))
    error_type = _compact_text(visible_result.get("errorType") or visible_result.get("error_type"))
    duration_ms = _coerce_int(visible_result.get("durationMs") or visible_result.get("duration_ms"))
    visible_outputs = visible_result.get("outputs") if isinstance(visible_result.get("outputs"), dict) else {}
    final_reply = _output_value(visible_outputs.get("final_reply"))
    operation_report = _output_value(visible_outputs.get("operation_report"))

    package = _base_package(
        selected=selected,
        user_goal=user_goal,
        visible_operation_capability="toograph_page_operation_workflow",
        status="failed" if _is_failure_status(status) or error else status,
        final_reply=final_reply,
        operation_report=operation_report,
        visible_operation_result=visible_result,
        duration_ms=duration_ms,
        error=error,
        error_type=error_type,
        final_reply_name="可见模板运行回复",
        final_reply_description="页面操作 workflow 在运行目标模板后生成的用户可见回复。",
        operation_report_name="可见模板运行报告",
        operation_report_description="页面操作 workflow 返回的结构化运行报告。",
        visible_result_name="可见页面操作结果包",
        visible_result_description="内部 toograph_page_operation_workflow 的完整 result_package。",
        visible_result_type="result_package",
    )
    return _success(package, selected=selected, source_name=source_name, visible_operation_source=visible_result.get("sourceKey"))


def _base_package(
    *,
    selected: dict[str, Any],
    user_goal: str,
    visible_operation_capability: str,
    status: str,
    final_reply: Any,
    operation_report: Any,
    visible_operation_result: Any,
    duration_ms: int,
    error: str,
    error_type: str,
    final_reply_name: str,
    final_reply_description: str,
    operation_report_name: str,
    operation_report_description: str,
    visible_result_name: str,
    visible_result_description: str,
    visible_result_type: str = "json",
) -> dict[str, Any]:
    source_key = selected["key"]
    source_name = selected.get("name") or source_key
    output_contract = _normalize_output_contract(selected.get("output_contract"))
    validation_report = _build_validation_report(
        selected=selected,
        status=status,
        final_reply=final_reply,
        operation_report=operation_report if isinstance(operation_report, dict) else {},
        output_contract=output_contract,
        error=error,
    )
    return {
        "kind": "result_package",
        "sourceType": "subgraph",
        "sourceKey": source_key,
        "sourceName": source_name,
        "status": status or "succeeded",
        "outputContract": output_contract,
        "inputs": {
            "user_goal": user_goal,
            "target_capability": selected,
            "visible_operation_capability": visible_operation_capability,
        },
        "outputs": {
            "final_reply": {
                "name": final_reply_name,
                "description": final_reply_description,
                "type": "markdown",
                "value": final_reply,
            },
            "operation_report": {
                "name": operation_report_name,
                "description": operation_report_description,
                "type": "json",
                "value": operation_report,
            },
            "validation_report": {
                "name": "目标运行校验报告",
                "description": "根据目标模板终态、公开输出、warnings/errors、activity events 和 artifacts 生成的紧凑校验报告。",
                "type": "json",
                "value": validation_report,
            },
            "visible_operation_result": {
                "name": visible_result_name,
                "description": visible_result_description,
                "type": visible_result_type,
                "value": visible_operation_result,
            },
        },
        "durationMs": duration_ms,
        "error": error,
        "errorType": error_type,
    }


def _success(
    package: dict[str, Any],
    *,
    selected: dict[str, Any],
    source_name: str,
    visible_operation_source: Any,
) -> dict[str, Any]:
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
                    "visible_operation_source": visible_operation_source,
                    "status": package["status"],
                },
                "error": package.get("error") or None,
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
    if value is None:
        return dict(DEFAULT_SELECTED_CAPABILITY)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return dict(DEFAULT_SELECTED_CAPABILITY)
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
        "output_contract": _normalize_output_contract(value.get("output_contract") or value.get("outputContract")),
    }


def _normalize_output_contract(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    contract: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        key = _compact_text(item.get("key") or item.get("state") or item.get("stateKey"))
        if not key or key in seen:
            continue
        seen.add(key)
        role = _compact_text(item.get("role")).lower()
        if role not in {"final_response", "evidence", "artifact", "internal"}:
            role = "final_response" if key == "final_reply" else "evidence"
        contract.append(
            {
                "key": key,
                "name": _compact_text(item.get("name")) or key,
                "description": _compact_text(item.get("description")),
                "type": _compact_text(item.get("type") or item.get("valueType")) or ("markdown" if role == "final_response" else "json"),
                "role": role,
                "pass_through": _coerce_bool(item.get("pass_through", item.get("passThrough")), default=role == "final_response"),
                "required": _coerce_bool(item.get("required"), default=False),
            }
        )
    return contract


def _build_validation_report(
    *,
    selected: dict[str, Any],
    status: str,
    final_reply: Any,
    operation_report: dict[str, Any],
    output_contract: list[dict[str, Any]],
    error: str,
) -> dict[str, Any]:
    operation_detail = operation_report.get("operation_report") if isinstance(operation_report.get("operation_report"), dict) else operation_report
    latest_run = operation_report.get("latest_foreground_run") if isinstance(operation_report.get("latest_foreground_run"), dict) else {}
    raw_target_run_validation = operation_detail.get("target_run_validation")
    target_run_validation_present = isinstance(raw_target_run_validation, dict)
    target_run_validation = raw_target_run_validation if target_run_validation_present else {}
    root_outputs = _normalize_root_outputs(
        target_run_validation.get("root_outputs"),
        final_reply=final_reply,
        allow_final_reply_fallback=not target_run_validation_present,
    )
    artifact_refs = _normalize_list(target_run_validation.get("artifact_refs") or operation_detail.get("artifact_refs"))
    warnings = _normalize_text_list(target_run_validation.get("warnings"))
    errors = _normalize_text_list(target_run_validation.get("errors"))
    if error:
        errors.append(error)
    missing_required_outputs = _missing_required_outputs(
        output_contract,
        root_outputs,
        final_reply=final_reply,
        allow_final_reply_fallback=not target_run_validation_present,
    )
    final_response_strategy = _resolve_final_response_strategy(
        status=status,
        error=error,
        output_contract=output_contract,
        root_outputs=root_outputs,
        missing_required_outputs=missing_required_outputs,
        final_reply=final_reply,
    )
    repair_options = _build_repair_options(
        missing_required_outputs=missing_required_outputs,
        errors=errors,
        status=status,
    )
    return {
        "capability": {
            "kind": selected.get("kind"),
            "key": selected.get("key"),
            "name": selected.get("name"),
        },
        "status": "failed" if _is_failure_status(status) or error else status or "succeeded",
        "target_run": {
            "run_id": _compact_text(target_run_validation.get("run_id") or operation_detail.get("triggered_run_id") or latest_run.get("runId")),
            "graph_id": _compact_text(target_run_validation.get("graph_id") or operation_detail.get("triggered_graph_id") or latest_run.get("graphId")),
            "status": _compact_text(target_run_validation.get("status") or operation_detail.get("triggered_run_status") or latest_run.get("status")),
            "final_result_preview": _compact_text(
                target_run_validation.get("final_result_preview") or operation_detail.get("triggered_run_final_result") or latest_run.get("finalResult")
            ),
        },
        "output_contract": output_contract,
        "root_outputs": root_outputs,
        "missing_required_outputs": missing_required_outputs,
        "warnings": warnings,
        "errors": errors,
        "activity_events": _normalize_list(target_run_validation.get("activity_events")),
        "artifact_refs": artifact_refs,
        "final_response_strategy": final_response_strategy,
        "needs_user_reply": final_response_strategy == "ask_user",
        "needs_repair": bool(repair_options),
        "repair_options": repair_options,
    }


def _normalize_root_outputs(
    value: Any,
    *,
    final_reply: Any,
    allow_final_reply_fallback: bool = True,
) -> list[dict[str, Any]]:
    outputs: list[dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                source_key = _compact_text(item.get("source_key") or item.get("sourceKey"))
                if not source_key:
                    continue
                outputs.append(
                    {
                        "node_id": _compact_text(item.get("node_id") or item.get("nodeId")),
                        "source_key": source_key,
                        "label": _compact_text(item.get("label")),
                        "display_mode": _compact_text(item.get("display_mode") or item.get("displayMode")),
                        "persist_enabled": item.get("persist_enabled", item.get("persistEnabled")) is True,
                        "persist_format": _compact_text(item.get("persist_format") or item.get("persistFormat")),
                        "value_type": _compact_text(item.get("value_type") or item.get("valueType")) or "text",
                        "value_preview": _compact_text(item.get("value_preview") or item.get("valuePreview")),
                        "has_value": item.get("has_value", item.get("hasValue")) is True,
                    }
                )
    if allow_final_reply_fallback and not outputs and _has_value(final_reply):
        outputs.append(
            {
                "node_id": "",
                "source_key": "final_reply",
                "label": "final_reply",
                "display_mode": "markdown",
                "persist_enabled": False,
                "persist_format": "auto",
                "value_type": "text",
                "value_preview": _compact_text(final_reply),
                "has_value": True,
            }
        )
    return outputs


def _missing_required_outputs(
    output_contract: list[dict[str, Any]],
    root_outputs: list[dict[str, Any]],
    *,
    final_reply: Any,
    allow_final_reply_fallback: bool = True,
) -> list[str]:
    outputs_by_key = {str(output.get("source_key") or ""): output for output in root_outputs}
    missing: list[str] = []
    for item in output_contract:
        if item.get("required") is not True:
            continue
        key = str(item.get("key") or "")
        output = outputs_by_key.get(key)
        if output and output.get("has_value") is True:
            continue
        if allow_final_reply_fallback and key == "final_reply" and _has_value(final_reply):
            continue
        missing.append(key)
    return missing


def _resolve_final_response_strategy(
    *,
    status: str,
    error: str,
    output_contract: list[dict[str, Any]],
    root_outputs: list[dict[str, Any]],
    missing_required_outputs: list[str],
    final_reply: Any,
) -> str:
    if _is_failure_status(status) or error:
        return "ask_user"
    final_output_keys = {
        str(item.get("key") or "")
        for item in output_contract
        if item.get("role") == "final_response" and item.get("pass_through") is True
    }
    root_output_keys = {str(item.get("source_key") or "") for item in root_outputs if item.get("has_value") is True}
    final_response_available = bool(final_output_keys.intersection(root_output_keys)) or ("final_reply" in final_output_keys and _has_value(final_reply))
    if final_response_available and not missing_required_outputs:
        return "pass_through"
    return "compose" if root_outputs else "ask_user"


def _normalize_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


def _normalize_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _build_repair_options(
    *,
    missing_required_outputs: list[str],
    errors: list[str],
    status: str,
) -> list[dict[str, Any]]:
    if not missing_required_outputs and not errors and not _is_failure_status(status):
        return []
    reason = "; ".join([*(f"missing required output: {key}" for key in missing_required_outputs), *errors])
    if not reason:
        reason = f"target run status is {status or 'unknown'}"
    return [
        {
            "action": "rebind_inputs",
            "description": "重新检查并绑定目标模板输入后再运行。",
            "requires_user_input": True,
            "reason": reason,
        },
        {
            "action": "rerun_template",
            "description": "使用相同目标模板和已知输入重新运行一次。",
            "requires_user_input": False,
            "reason": reason,
        },
        {
            "action": "switch_template",
            "description": "改用另一个更匹配本轮目标的模板或能力。",
            "requires_user_input": False,
            "reason": reason,
        },
        {
            "action": "ask_user",
            "description": "向用户询问缺失输入或确认下一步修复方式。",
            "requires_user_input": True,
            "reason": reason,
        },
        {
            "action": "end_with_gap",
            "description": "结束本轮并明确说明已执行内容、失败原因和缺口。",
            "requires_user_input": False,
            "reason": reason,
        },
    ]


def _has_value(value: Any) -> bool:
    return value not in (None, "", [], {})


def _coerce_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _normalize_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}
        try:
            return _normalize_json_object(json.loads(stripped))
        except json.JSONDecodeError:
            return {}
    if isinstance(value, dict):
        return dict(value)
    return {}


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


def _operation_status(operation_result: dict[str, Any]) -> str:
    triggered_status = _compact_text(operation_result.get("triggered_run_status"))
    if triggered_status:
        if triggered_status == "completed":
            return "succeeded"
        return "failed" if _is_failure_status(triggered_status) else triggered_status
    status = _compact_text(operation_result.get("status"))
    return status or "succeeded"


def _is_failure_status(status: str) -> bool:
    return status.lower() in {"failed", "failure", "error", "cancelled", "canceled", "interrupted"}


def _latest_run_from_operation_report(operation_report: dict[str, Any]) -> dict[str, Any]:
    run_id = _compact_text(operation_report.get("triggered_run_id"))
    if not run_id:
        return {}
    return {
        "runId": run_id,
        "graphId": _compact_text(operation_report.get("triggered_graph_id")),
        "status": _compact_text(operation_report.get("triggered_run_status")),
        "resultSummary": _compact_text(
            operation_report.get("triggered_run_result_summary") or operation_report.get("result_summary")
        ),
        "finalResult": _compact_text(
            operation_report.get("triggered_run_final_result") or operation_report.get("final_result")
        ),
    }


def _direct_template_final_reply(
    *,
    source_name: str,
    operation_result: dict[str, Any],
    latest_run: dict[str, Any],
    error: str,
) -> str:
    final_result = _compact_text(latest_run.get("finalResult"))
    if final_result:
        return final_result
    result_summary = _compact_text(latest_run.get("resultSummary"))
    if result_summary:
        return result_summary
    if error:
        return f"运行图模板 {source_name} 时失败：{error}"
    triggered_run_id = _compact_text(operation_result.get("triggered_run_id") or latest_run.get("runId"))
    triggered_status = _compact_text(operation_result.get("triggered_run_status") or latest_run.get("status"))
    if triggered_run_id:
        if triggered_status:
            return f"已通过页面操作运行图模板 {source_name}，运行 {triggered_run_id} 状态：{triggered_status}。"
        return f"已通过页面操作运行图模板 {source_name}，运行 {triggered_run_id} 已创建。"
    return f"已通过页面操作请求运行图模板 {source_name}。"


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
        raise SystemExit("Action input must be a JSON object.")
    print(json.dumps(buddy_visible_subgraph_result_adapter(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
