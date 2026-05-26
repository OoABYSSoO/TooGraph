from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import sys
from typing import Any


ALLOWED_ACTIONS = {"memory_entry.create", "memory_entry.update", "memory_entry.archive"}
CREATE_REQUIRED_FIELDS = {"scope_kind", "scope_id", "layer", "memory_type", "content"}
ALLOWED_CREATE_FIELDS = {
    "memory_id",
    "scope_kind",
    "scope_id",
    "layer",
    "memory_type",
    "status",
    "title",
    "content",
    "confidence",
    "salience",
    "sources",
    "metadata",
}
ALLOWED_UPDATE_FIELDS = ALLOWED_CREATE_FIELDS - {"memory_id"} | {"sources"}


def buddy_memory_writer(**action_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    if str(repo_root / "backend") not in sys.path:
        sys.path.insert(0, str(repo_root / "backend"))

    from app.buddy import commands as buddy_commands
    from app.buddy import store as buddy_store
    from app.core.storage import database

    buddy_home_override = _as_text(os.environ.get("TOOGRAPH_BUDDY_HOME_DIR")).strip()
    if buddy_home_override:
        buddy_store.BUDDY_HOME_DIR = Path(buddy_home_override).expanduser().resolve()
    database.initialize_storage()

    command_items = _coerce_commands(action_inputs.get("commands"))
    if isinstance(command_items, dict):
        return _failed(command_items["error_type"], command_items["error"], skipped_commands=[command_items])

    source_run_id = _as_text(action_inputs.get("run_id")).strip() or None
    applied_commands: list[dict[str, Any]] = []
    skipped_commands: list[dict[str, Any]] = []
    revisions: list[dict[str, Any]] = []
    memories: list[dict[str, Any]] = []

    for index, item in enumerate(command_items):
        normalized, error = _normalize_command(item, default_run_id=source_run_id, index=index)
        if error:
            skipped_commands.append(error)
            continue
        try:
            result = buddy_commands.execute_command(normalized)
        except Exception as exc:
            skipped_commands.append(
                {
                    "index": index,
                    "action": normalized.get("action"),
                    "error_type": "execution_failed",
                    "error": str(exc),
                }
            )
            continue
        applied_commands.append(result)
        memory = result.get("result")
        if isinstance(memory, dict):
            memories.append(memory)
        revision = result.get("revision")
        if isinstance(revision, dict):
            revisions.append(revision)

    success = not skipped_commands
    result_text = _result_text(applied_commands, skipped_commands)
    return {
        "success": success,
        "result": result_text,
        "applied_commands": applied_commands,
        "skipped_commands": skipped_commands,
        "memories": memories,
        "revisions": revisions,
        "activity_events": [
            {
                "kind": "buddy_memory_write",
                "summary": result_text,
                "status": "succeeded" if success else "failed",
                "detail": _activity_detail(applied_commands, skipped_commands, revisions, memories),
            }
        ],
    }


def _coerce_commands(value: Any) -> list[Any] | dict[str, Any]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            return {"index": None, "error_type": "invalid_commands", "error": f"commands must be JSON: {exc}"}
        return _coerce_commands(parsed)
    if value is None:
        return []
    if isinstance(value, dict):
        nested_commands = value.get("commands")
        if isinstance(nested_commands, list):
            return nested_commands
        item_commands = value.get("items")
        if isinstance(item_commands, list):
            return item_commands
        return {"index": None, "error_type": "invalid_commands", "error": "commands must be an array."}
    if not isinstance(value, list):
        return {"index": None, "error_type": "invalid_commands", "error": "commands must be an array."}
    return value


def _normalize_command(
    value: Any,
    *,
    default_run_id: str | None,
    index: int,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if not isinstance(value, dict):
        return {}, {"index": index, "error_type": "invalid_command", "error": "command must be an object."}
    action = _as_text(value.get("action") or value.get("type")).strip()
    if action not in ALLOWED_ACTIONS:
        return {}, {
            "index": index,
            "action": action,
            "error_type": "unsupported_action",
            "error": f"Unsupported structured memory action: {action or '(empty)'}",
        }
    payload = deepcopy(value.get("payload")) if isinstance(value.get("payload"), dict) else {}
    payload_change_reason = _as_text(payload.pop("change_reason", "")).strip()
    command_change_reason = (
        _as_text(value.get("change_reason")).strip()
        or payload_change_reason
        or "Buddy autonomous review applied a structured memory write."
    )
    validation_error = _validate_payload(action, payload)
    if validation_error:
        return {}, {"index": index, "action": action, **validation_error}

    normalized = {
        "action": action,
        "payload": payload,
        "change_reason": command_change_reason,
    }
    target_id = _as_text(value.get("target_id")).strip()
    if target_id:
        normalized["target_id"] = target_id
    run_id = _as_text(value.get("run_id")).strip() or default_run_id
    if run_id:
        normalized["run_id"] = run_id
    return normalized, None


def _validate_payload(action: str, payload: dict[str, Any]) -> dict[str, str] | None:
    if action == "memory_entry.create":
        missing = sorted(field for field in CREATE_REQUIRED_FIELDS if not _as_text(payload.get(field)).strip())
        if missing:
            return {"error_type": "missing_required_field", "error": f"Missing memory fields: {', '.join(missing)}"}
        unsupported = sorted(set(payload) - ALLOWED_CREATE_FIELDS)
        if unsupported:
            return {"error_type": "unsupported_field", "error": f"Unsupported memory fields: {', '.join(unsupported)}"}
        return None
    if action == "memory_entry.update":
        memory_id = _as_text(payload.get("memory_id")).strip()
        if not memory_id:
            return {"error_type": "missing_required_field", "error": "memory_entry.update requires payload.memory_id."}
        unsupported = sorted(set(payload) - (ALLOWED_UPDATE_FIELDS | {"memory_id"}))
        if unsupported:
            return {"error_type": "unsupported_field", "error": f"Unsupported memory fields: {', '.join(unsupported)}"}
        return None
    if action == "memory_entry.archive" and not _as_text(payload.get("memory_id")).strip():
        return {"error_type": "missing_required_field", "error": "memory_entry.archive requires payload.memory_id."}
    return None


def _result_text(applied_commands: list[dict[str, Any]], skipped_commands: list[dict[str, Any]]) -> str:
    applied_count = len(applied_commands)
    skipped_count = len(skipped_commands)
    command_noun = "command" if applied_count == 1 else "commands"
    parts = [f"Applied {applied_count} structured memory {command_noun}."]
    if skipped_count:
        skipped_noun = "command" if skipped_count == 1 else "commands"
        parts.append(f"Skipped {skipped_count} unsafe or invalid {skipped_noun}.")
    return " ".join(parts)


def _activity_detail(
    applied_commands: list[dict[str, Any]],
    skipped_commands: list[dict[str, Any]],
    revisions: list[dict[str, Any]],
    memories: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "applied_count": len(applied_commands),
        "skipped_count": len(skipped_commands),
        "memory_ids": [memory.get("memory_id") for memory in memories],
        "revision_ids": [revision.get("revision_id") for revision in revisions],
        "applied_commands": [_summarize_applied_command(result) for result in applied_commands],
        "skipped_commands": deepcopy(skipped_commands),
    }


def _summarize_applied_command(result: dict[str, Any]) -> dict[str, Any]:
    command = result.get("command") if isinstance(result.get("command"), dict) else {}
    revision = result.get("revision") if isinstance(result.get("revision"), dict) else {}
    return {
        "command_id": command.get("command_id"),
        "action": command.get("action"),
        "status": command.get("status"),
        "target_type": command.get("target_type"),
        "target_id": command.get("target_id"),
        "revision_id": command.get("revision_id") or revision.get("revision_id"),
        "run_id": command.get("run_id"),
        "change_reason": command.get("change_reason"),
    }


def _failed(error_type: str, error: str, *, skipped_commands: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "success": False,
        "result": f"{error_type}: {error}",
        "applied_commands": [],
        "skipped_commands": skipped_commands or [],
        "memories": [],
        "revisions": [],
        "activity_events": [
            {
                "kind": "buddy_memory_write",
                "summary": f"Structured memory write failed: {error}",
                "status": "failed",
                "detail": {
                    "error_type": error_type,
                    "applied_count": 0,
                    "skipped_count": len(skipped_commands or []),
                    "memory_ids": [],
                    "revision_ids": [],
                    "applied_commands": [],
                    "skipped_commands": deepcopy(skipped_commands or []),
                },
                "error": error,
            }
        ],
    }


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(buddy_memory_writer(**payload), ensure_ascii=False))
