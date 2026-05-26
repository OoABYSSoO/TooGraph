from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import sys
from typing import Any


ALLOWED_ACTIONS = {
    "memory_document.update",
    "user_context.update",
    "session_summary.update",
    "buddy_identity.update",
    "capability_usage_stats.update",
}
IDENTITY_RENAME_INTENT_MARKERS = (
    "call yourself",
    "rename yourself",
    "your name",
    "buddy identity name",
    "visible buddy name",
    "\u4ee5\u540e\u5c31\u53eb",
    "\u4ee5\u540e\u53eb",
    "\u6539\u540d",
    "\u540d\u5b57",
    "\u540d\u79f0",
    "\u79f0\u547c",
    "\u81ea\u79f0",
)
DISPLAY_NAME_ONLY_MARKERS = (
    "display name",
    "display label",
    "display_preferences.display_name",
    "\u663e\u793a\u540d",
    "\u663e\u793a\u6807\u7b7e",
)


def buddy_home_writer(**action_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    if str(repo_root / "backend") not in sys.path:
        sys.path.insert(0, str(repo_root / "backend"))

    from app.buddy import commands as buddy_commands
    from app.buddy import store as buddy_store

    buddy_home_override = _as_text(os.environ.get("TOOGRAPH_BUDDY_HOME_DIR")).strip()
    if buddy_home_override:
        buddy_store.BUDDY_HOME_DIR = Path(buddy_home_override).expanduser().resolve()
    buddy_store.initialize_buddy_home()

    command_items = _coerce_commands(action_inputs.get("commands"))
    if isinstance(command_items, dict):
        return _failed(
            command_items["error_type"],
            command_items["error"],
            skipped_commands=[command_items],
        )

    source_run_id = _as_text(action_inputs.get("run_id")).strip() or None
    applied_commands: list[dict[str, Any]] = []
    skipped_commands: list[dict[str, Any]] = []
    revisions: list[dict[str, Any]] = []

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
        "revisions": revisions,
        "activity_events": [
            {
                "kind": "buddy_home_write",
                "summary": result_text,
                "status": "succeeded" if success else "failed",
                "detail": _activity_detail(applied_commands, skipped_commands, revisions),
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
            "error": f"Unsupported Buddy Home writeback action: {action or '(empty)'}",
        }
    payload = deepcopy(value.get("payload")) if isinstance(value.get("payload"), dict) else {}
    payload_change_reason = _as_text(payload.pop("change_reason", "")).strip()
    command_change_reason = (
        _as_text(value.get("change_reason")).strip()
        or payload_change_reason
        or "Buddy autonomous review applied a safe Buddy Home writeback."
    )
    if action == "buddy_identity.update":
        payload = _normalize_buddy_identity_update_payload(payload, change_reason=command_change_reason)
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


def _normalize_buddy_identity_update_payload(payload: dict[str, Any], *, change_reason: str) -> dict[str, Any]:
    normalized = deepcopy(payload)
    if "name" in normalized or _looks_like_display_name_only_intent(change_reason):
        return normalized
    display_preferences = normalized.get("display_preferences")
    if not isinstance(display_preferences, dict):
        return normalized
    display_name = _as_text(display_preferences.get("display_name")).strip()
    if display_name and _looks_like_buddy_identity_rename_intent(change_reason):
        normalized["name"] = display_name
    return normalized


def _looks_like_buddy_identity_rename_intent(value: str) -> bool:
    text = value.lower()
    return any(marker in text for marker in IDENTITY_RENAME_INTENT_MARKERS)


def _looks_like_display_name_only_intent(value: str) -> bool:
    text = value.lower()
    return any(marker in text for marker in DISPLAY_NAME_ONLY_MARKERS)


def _result_text(applied_commands: list[dict[str, Any]], skipped_commands: list[dict[str, Any]]) -> str:
    applied_count = len(applied_commands)
    skipped_count = len(skipped_commands)
    command_noun = "command" if applied_count == 1 else "commands"
    parts = [f"Applied {applied_count} Buddy Home {command_noun}."]
    if skipped_count:
        skipped_noun = "command" if skipped_count == 1 else "commands"
        parts.append(f"Skipped {skipped_count} unsafe or invalid {skipped_noun}.")
    return " ".join(parts)


def _activity_detail(
    applied_commands: list[dict[str, Any]],
    skipped_commands: list[dict[str, Any]],
    revisions: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "applied_count": len(applied_commands),
        "skipped_count": len(skipped_commands),
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
        "revisions": [],
        "activity_events": [
            {
                "kind": "buddy_home_write",
                "summary": f"Buddy Home writeback failed: {error}",
                "status": "failed",
                "detail": {
                    "error_type": error_type,
                    "applied_count": 0,
                    "skipped_count": len(skipped_commands or []),
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
    print(json.dumps(buddy_home_writer(**payload), ensure_ascii=False))
