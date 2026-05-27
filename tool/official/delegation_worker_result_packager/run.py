from __future__ import annotations

import json
import sys
from typing import Any


TERMINAL_STATUSES = {"succeeded", "completed", "failed", "partial", "cancelled", "skipped"}


def delegation_worker_result_packager(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        task_packet = _normalize_task_packet(inputs.get("worker_task_packet"))
        outputs = _normalize_outputs(inputs.get("worker_outputs"), task_packet.get("expected_output_schema"))
        status = _normalize_status(inputs.get("worker_status"), outputs=outputs, errors=inputs.get("errors"))
        summary = _text(inputs.get("worker_summary")) or _default_summary(task_packet, outputs, status)
        package = {
            "kind": "worker_result_package",
            "version": 1,
            "task_id": task_packet["task_id"],
            "status": status,
            "summary": summary,
            "outputs": outputs,
            "artifacts": _list_or_empty(inputs.get("artifacts")),
            "errors": _list_or_empty(inputs.get("errors")),
            "followups": _list_or_empty(inputs.get("followups")),
            "source_refs": _source_refs(task_packet, outputs),
            "allowed_capabilities": task_packet.get("allowed_capabilities", []),
            "budget": _budget(task_packet, inputs.get("budget_usage")),
            "worker_task_packet": task_packet,
        }
        return {
            "status": "succeeded",
            "worker_task_packet": task_packet,
            "worker_result_package": package,
        }
    except Exception as exc:
        task_id = _text(_as_dict(inputs.get("worker_task_packet")).get("task_id"))
        return {
            "status": "failed",
            "error_type": "delegation_worker_result_package_failed",
            "error": str(exc),
            "worker_task_packet": _as_dict(inputs.get("worker_task_packet")),
            "worker_result_package": {
                "kind": "worker_result_package",
                "version": 1,
                "task_id": task_id,
                "status": "failed",
                "summary": str(exc),
                "outputs": {},
                "artifacts": [],
                "errors": [{"message": str(exc)}],
                "followups": [],
                "source_refs": [],
                "budget": {},
            },
        }


def _normalize_task_packet(value: Any) -> dict[str, Any]:
    packet = _as_dict(value)
    task_id = _text(packet.get("task_id") or packet.get("taskId"))
    if not task_id:
        raise ValueError("worker_task_packet.task_id is required.")
    goal = _text(packet.get("goal"))
    expected_output_schema = _as_dict(packet.get("expected_output_schema") or packet.get("expectedOutputSchema"))
    return {
        "kind": "worker_task_packet",
        "version": 1,
        "task_id": task_id,
        "goal": goal,
        "context_package_refs": _source_ref_list(packet.get("context_package_refs") or packet.get("contextPackageRefs")),
        "allowed_capabilities": _capability_ref_list(packet.get("allowed_capabilities") or packet.get("allowedCapabilities")),
        "budget": _as_dict(packet.get("budget")),
        "expected_output_schema": expected_output_schema,
        "metadata": _as_dict(packet.get("metadata")),
    }


def _normalize_outputs(value: Any, schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw_outputs = _as_dict(value)
    outputs: dict[str, dict[str, Any]] = {}
    for key, raw_value in raw_outputs.items():
        output_key = _text(key)
        if not output_key:
            continue
        schema_record = _as_dict(schema.get(output_key))
        output_type = _text(schema_record.get("type") or schema_record.get("valueType")) or _infer_type(raw_value)
        outputs[output_key] = {
            "name": _text(schema_record.get("name")) or output_key,
            "type": output_type,
            "value": raw_value,
        }
        source_refs = _source_ref_list(schema_record.get("source_refs"))
        if source_refs:
            outputs[output_key]["source_refs"] = source_refs
    return outputs


def _normalize_status(value: Any, *, outputs: dict[str, Any], errors: Any) -> str:
    status = _text(value).lower()
    if status in TERMINAL_STATUSES:
        return "succeeded" if status == "completed" else status
    if _list_or_empty(errors):
        return "failed"
    return "succeeded" if outputs else "partial"


def _default_summary(task_packet: dict[str, Any], outputs: dict[str, Any], status: str) -> str:
    goal = _text(task_packet.get("goal"))
    output_keys = ", ".join(outputs.keys())
    if goal and output_keys:
        return f"{status}: {goal} Outputs: {output_keys}."
    if goal:
        return f"{status}: {goal}"
    return f"{status}: worker task {task_packet['task_id']}."


def _source_refs(task_packet: dict[str, Any], outputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    refs = list(task_packet.get("context_package_refs") or [])
    for output in outputs.values():
        refs.extend(_source_ref_list(output.get("source_refs")))
        value = output.get("value")
        if isinstance(value, list):
            refs.extend(_source_ref_list(value))
        elif isinstance(value, dict):
            refs.extend(_source_ref_list(value.get("source_refs")))
            if _text(value.get("source_kind")) and _text(value.get("source_id")):
                refs.append(value)
    return _dedupe_source_refs(refs)


def _budget(task_packet: dict[str, Any], usage: Any) -> dict[str, Any]:
    budget = dict(task_packet.get("budget") if isinstance(task_packet.get("budget"), dict) else {})
    for key, value in _as_dict(usage).items():
        budget[str(key)] = value
    return budget


def _source_ref_list(value: Any) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for item in (value if isinstance(value, list) else []):
        record = _as_dict(item)
        source_kind = _text(record.get("source_kind") or record.get("kind"))
        source_id = _text(record.get("source_id") or record.get("id"))
        if source_kind and source_id:
            refs.append({"source_kind": source_kind, "source_id": source_id})
    return refs


def _capability_ref_list(value: Any) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    for item in (value if isinstance(value, list) else []):
        record = _as_dict(item)
        kind = _text(record.get("kind"))
        key = _text(record.get("key") or record.get("actionKey") or record.get("toolKey") or record.get("template_id"))
        if kind and key:
            refs.append({"kind": kind, "key": key})
    return refs


def _dedupe_source_refs(refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for ref in refs:
        source_kind = _text(ref.get("source_kind"))
        source_id = _text(ref.get("source_id"))
        if not source_kind or not source_id:
            continue
        key = (source_kind, source_id)
        if key in seen:
            continue
        seen.add(key)
        result.append({"source_kind": source_kind, "source_id": source_id})
    return result


def _infer_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, dict | list):
        return "json"
    text = _text(value)
    if "\n" in text or len(text) > 120:
        return "markdown"
    return "text"


def _as_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list_or_empty(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(delegation_worker_result_packager(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
