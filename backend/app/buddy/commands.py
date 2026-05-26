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
    previous_revision_ids = {str(revision.get("revision_id")) for revision in store.list_revisions()}

    result, target_type, resolved_target_id = _dispatch_command(
        action,
        command_payload,
        target_id=target_id,
        change_reason=change_reason,
    )
    revision = _latest_new_revision(previous_revision_ids) or _revision_from_command_result(
        result,
        target_type=target_type,
        target_id=resolved_target_id,
    )
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


def _dispatch_command(
    action: str,
    payload: dict[str, Any],
    *,
    target_id: str | None,
    change_reason: str,
) -> tuple[dict[str, Any], str, str]:
    if action == "buddy_identity.update":
        return (
            store.save_buddy_identity(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "buddy_identity",
            "buddy_identity",
        )
    if action == "user_context.update":
        result = store.save_user_context_document(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason)
        return result, "home_file", "USER.md"
    if action == "memory_document.update":
        result = store.save_memory_document(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason)
        return result, "home_file", "MEMORY.md"
    if action == "session_summary.update":
        return (
            store.save_session_summary(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "session_summary",
            "session_summary",
        )
    if action == "capability_usage_stats.update":
        result = store.update_capability_usage_stats(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason)
        return result, "capability_usage_stats", "capability_usage_stats"
    if action == "memory_entry.create":
        from app.core.storage import memory_store

        result = memory_store.create_memory_entry(
            **_memory_create_kwargs(payload),
            changed_by=COMMAND_CHANGED_BY,
            change_reason=change_reason,
        )
        return result, "memory_entry", str(result.get("memory_id") or "")
    if action == "memory_entry.update":
        from app.core.storage import memory_store

        memory_id = _required_target_id(_optional_text(payload.get("memory_id")) or target_id, action)
        updates = {key: deepcopy(value) for key, value in payload.items() if key != "memory_id"}
        result = memory_store.update_memory_entry(
            memory_id,
            updates,
            changed_by=COMMAND_CHANGED_BY,
            change_reason=change_reason,
        )
        return result, "memory_entry", str(result.get("memory_id") or memory_id)
    if action == "memory_entry.archive":
        from app.core.storage import memory_store

        memory_id = _required_target_id(_optional_text(payload.get("memory_id")) or target_id, action)
        result = memory_store.archive_memory_entry(
            memory_id,
            changed_by=COMMAND_CHANGED_BY,
            change_reason=change_reason,
        )
        return result, "memory_entry", str(result.get("memory_id") or memory_id)
    if action == "run_template_binding.update":
        return (
            store.save_run_template_binding(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "run_template_binding",
            "run_template_binding",
        )
    if action == "memory_review_template_binding.update":
        return (
            store.save_memory_review_template_binding(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "memory_review_template_binding",
            "memory_review_template_binding",
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


def _revision_from_command_result(result: dict[str, Any], *, target_type: str, target_id: str) -> dict[str, Any] | None:
    revision_id = str(result.get("latest_revision_id") or "").strip()
    if not revision_id:
        return None
    revisions = result.get("revisions")
    latest_revision = revisions[-1] if isinstance(revisions, list) and revisions else {}
    return {
        "revision_id": revision_id,
        "revision_number": latest_revision.get("revision_number") if isinstance(latest_revision, dict) else None,
        "operation": latest_revision.get("operation") if isinstance(latest_revision, dict) else "",
        "target_type": target_type,
        "target_id": target_id,
    }


def _memory_create_kwargs(payload: dict[str, Any]) -> dict[str, Any]:
    allowed_keys = {
        "memory_id",
        "scope_kind",
        "scope_id",
        "layer",
        "memory_type",
        "title",
        "content",
        "status",
        "confidence",
        "salience",
        "sources",
        "metadata",
    }
    return {key: deepcopy(value) for key, value in payload.items() if key in allowed_keys}


def _append_command(command: dict[str, Any]) -> None:
    store.append_command_record(command)


def _required_target_id(value: str | None, action: str) -> str:
    if not value:
        raise ValueError(f"{action} requires target_id.")
    return value


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
