from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4

from app.buddy import store
from app.core.storage.json_file_utils import utc_now_iso


COMMAND_CHANGED_BY = "buddy_command"


def list_commands() -> list[dict[str, Any]]:
    return store.list_command_records()


def execute_command(payload: dict[str, Any]) -> dict[str, Any]:
    action = _required_text(payload.get("action"), "action")
    command_payload = payload.get("payload")
    if command_payload is None:
        command_payload = {}
    if not isinstance(command_payload, dict):
        raise ValueError("payload must be an object.")

    target_id = _optional_text(payload.get("target_id"))
    run_id = _optional_text(payload.get("run_id"))
    change_reason = _optional_text(payload.get("change_reason")) or f"Buddy command executed: {action}."
    if action == "graph_patch.draft":
        return _execute_graph_patch_draft(command_payload, target_id=target_id, run_id=run_id, change_reason=change_reason)

    previous_revision_ids = {str(revision.get("revision_id")) for revision in store.list_revisions()}

    result, target_type, resolved_target_id = _dispatch_command(
        action,
        command_payload,
        target_id=target_id,
        change_reason=change_reason,
    )
    revision = _latest_new_revision(previous_revision_ids)
    now = utc_now_iso()
    command = {
        "command_id": f"cmd_{uuid4().hex[:12]}",
        "kind": "buddy.manual_write",
        "action": action,
        "status": "succeeded",
        "target_type": target_type,
        "target_id": resolved_target_id,
        "revision_id": revision.get("revision_id") if isinstance(revision, dict) else None,
        "run_id": run_id,
        "payload": deepcopy(command_payload),
        "change_reason": change_reason,
        "created_at": now,
        "completed_at": now,
    }
    _append_command(command)
    return {"command": command, "result": result, "revision": revision}


def _execute_graph_patch_draft(
    payload: dict[str, Any],
    *,
    target_id: str | None,
    run_id: str | None,
    change_reason: str,
) -> dict[str, Any]:
    patch = _required_graph_patch(payload.get("patch"))
    graph_id = target_id or _optional_text(payload.get("graph_id"))
    graph_name = _optional_text(payload.get("graph_name"))
    resolved_target_id = graph_id or "unsaved_graph"
    now = utc_now_iso()
    command_id = f"cmd_{uuid4().hex[:12]}"
    activity_event = {
        "kind": "graph_patch_draft",
        "summary": _graph_patch_draft_activity_summary(graph_name=graph_name, graph_id=graph_id, operation_count=len(patch)),
        "status": "awaiting_approval",
        "detail": {
            "graph_id": graph_id,
            "graph_name": graph_name,
            "operation_count": len(patch),
            "operations": [operation.get("op") for operation in patch],
        },
        "created_at": now,
    }
    result = {
        "draft_id": command_id,
        "graph_id": graph_id,
        "graph_name": graph_name,
        "summary": _optional_text(payload.get("summary")) or "Buddy graph patch draft.",
        "rationale": _optional_text(payload.get("rationale")) or "",
        "patch": patch,
        "preview": deepcopy(payload.get("preview")) if isinstance(payload.get("preview"), dict) else None,
        "activity_event": activity_event,
    }
    command = {
        "command_id": command_id,
        "kind": "buddy.graph_patch_draft",
        "action": "graph_patch.draft",
        "status": "awaiting_approval",
        "target_type": "graph",
        "target_id": resolved_target_id,
        "revision_id": None,
        "run_id": run_id,
        "payload": deepcopy(payload),
        "change_reason": change_reason,
        "activity_event": activity_event,
        "created_at": now,
        "completed_at": None,
    }
    _append_command(command)
    return {"command": command, "result": result, "revision": None}


def _dispatch_command(
    action: str,
    payload: dict[str, Any],
    *,
    target_id: str | None,
    change_reason: str,
) -> tuple[dict[str, Any], str, str]:
    if action == "profile.update":
        return store.save_profile(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason), "profile", "profile"
    if action == "policy.update":
        return store.save_policy(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason), "policy", "policy"
    if action == "memory.create":
        result = store.create_memory(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason)
        return result, "memory", str(result.get("id") or "")
    if action == "memory.update":
        memory_id = _required_target_id(target_id, action)
        return store.update_memory(memory_id, payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason), "memory", memory_id
    if action == "memory.delete":
        memory_id = _required_target_id(target_id, action)
        return store.delete_memory(memory_id, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason), "memory", memory_id
    if action == "session_summary.update":
        return (
            store.save_session_summary(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "session_summary",
            "session_summary",
        )
    if action == "run_template_binding.update":
        return (
            store.save_run_template_binding(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "run_template_binding",
            "run_template_binding",
        )
    if action == "revision.restore":
        revision_id = _required_target_id(target_id, action)
        result = store.restore_revision(revision_id, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason)
        return result, str(result.get("target_type") or ""), str(result.get("target_id") or "")
    raise ValueError(f"Unsupported buddy command action: {action}")


def _latest_new_revision(previous_revision_ids: set[str]) -> dict[str, Any] | None:
    for revision in reversed(store.list_revisions()):
        revision_id = str(revision.get("revision_id") or "")
        if revision_id and revision_id not in previous_revision_ids:
            return revision
    return None


def _append_command(command: dict[str, Any]) -> None:
    store.append_command_record(command)


def _required_target_id(value: str | None, action: str) -> str:
    if not value:
        raise ValueError(f"{action} requires target_id.")
    return value


def _required_graph_patch(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError("graph_patch.draft requires a non-empty patch list.")
    patch: list[dict[str, Any]] = []
    for index, operation in enumerate(value):
        if not isinstance(operation, dict):
            raise ValueError(f"patch[{index}] must be an object.")
        op = _required_text(operation.get("op"), f"patch[{index}].op")
        if op not in {"add", "remove", "replace", "move", "copy", "test"}:
            raise ValueError(f"patch[{index}].op is not supported.")
        _required_text(operation.get("path"), f"patch[{index}].path")
        if op in {"move", "copy"}:
            _required_text(operation.get("from"), f"patch[{index}].from")
        patch.append(deepcopy(operation))
    return patch


def _graph_patch_draft_activity_summary(*, graph_name: str | None, graph_id: str | None, operation_count: int) -> str:
    target = graph_name or graph_id or "unsaved graph"
    noun = "operation" if operation_count == 1 else "operations"
    return f"Drafted graph patch for {target} ({operation_count} {noun})."


def _required_text(value: Any, field_name: str) -> str:
    text = _optional_text(value)
    if not text:
        raise ValueError(f"{field_name} is required.")
    return text


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
