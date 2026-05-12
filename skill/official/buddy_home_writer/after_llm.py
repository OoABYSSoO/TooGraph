from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import sys
from typing import Any


ALLOWED_ACTIONS = {
    "memory.create",
    "memory.update",
    "memory.delete",
    "session_summary.update",
    "profile.update",
    "policy.update",
}
POLICY_PERMISSION_FIELDS = {"behavior_boundaries", "graph_permission_mode"}


def buddy_home_writer(**skill_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    if str(repo_root / "backend") not in sys.path:
        sys.path.insert(0, str(repo_root / "backend"))

    from app.buddy import commands as buddy_commands
    from app.buddy import store as buddy_store

    buddy_home_override = _as_text(os.environ.get("TOOGRAPH_BUDDY_HOME_DIR")).strip()
    if buddy_home_override:
        buddy_store.BUDDY_HOME_DIR = Path(buddy_home_override).expanduser().resolve()
    buddy_store.initialize_buddy_home()

    command_items = _coerce_commands(skill_inputs.get("commands"))
    if isinstance(command_items, dict):
        return _failed(
            command_items["error_type"],
            command_items["error"],
            skipped_commands=[command_items],
        )

    source_run_id = _as_text(skill_inputs.get("run_id")).strip() or None
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
    action = _as_text(value.get("action")).strip()
    if action not in ALLOWED_ACTIONS:
        return {}, {
            "index": index,
            "action": action,
            "error_type": "unsupported_action",
            "error": f"Unsupported Buddy Home writeback action: {action or '(empty)'}",
        }
    payload = value.get("payload") if isinstance(value.get("payload"), dict) else {}
    if action == "policy.update" and _contains_permission_boundary_change(payload):
        return {}, {
            "index": index,
            "action": action,
            "error_type": "permission_boundary",
            "error": "Autonomous Buddy Home writeback cannot change permission or behavior boundary policy fields.",
        }

    normalized = {
        "action": action,
        "payload": deepcopy(payload),
        "change_reason": _as_text(value.get("change_reason")).strip()
        or "Buddy autonomous review applied a safe Buddy Home writeback.",
    }
    target_id = _as_text(value.get("target_id")).strip()
    if target_id:
        normalized["target_id"] = target_id
    run_id = _as_text(value.get("run_id")).strip() or default_run_id
    if run_id:
        normalized["run_id"] = run_id
    return normalized, None


def _contains_permission_boundary_change(payload: dict[str, Any]) -> bool:
    return any(field in payload for field in POLICY_PERMISSION_FIELDS)


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
