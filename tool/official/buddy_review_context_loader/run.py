from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


EMPTY_HISTORY_REF = {
    "kind": "context_assembly_ref",
    "source_refs": [],
    "metadata": {"scope": "buddy_review_context_loader"},
}
REPLY_STATE_NAMES = {
    "buddy_reply",
    "visible_reply",
    "public_response",
    "direct_reply",
    "denied_reply",
    "approval_prompt",
    "missing_action_proposal",
}
REPLY_STATE_KEYS = {"state_27", "state_25", "state_26", "state_16", "state_18"}


def buddy_review_context_loader(payload: dict[str, Any] | None, *, context: dict[str, Any] | None = None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    source_run_id = _text(inputs.get("source_run_id") or _dict(context).get("source_run_id"))
    if not source_run_id:
        return _failed_result(
            source_run_id="",
            error_type="missing_source_run_id",
            error="source_run_id is required.",
        )

    try:
        _ensure_backend_path()
        from app.core.storage.run_store import load_run

        source_run = load_run(source_run_id)
    except Exception as exc:
        return _failed_result(
            source_run_id=source_run_id,
            error_type="source_run_load_failed",
            error=str(exc),
        )

    runtime_context = _dict(_dict(source_run.get("metadata")).get("runtime_context"))
    user_message = _text(_state_value_by_name(source_run, "user_message", ""))
    conversation_history = _state_value_by_name(source_run, "conversation_history", _empty_history_ref())
    request_understanding = _dict(_state_value_by_name(source_run, "request_understanding", {}))
    capability_result = _dict(_state_value_by_name(source_run, "capability_result", {}))
    capability_review = _dict(_state_value_by_name(source_run, "capability_review", {}))
    public_response = _text(_state_value_by_name(source_run, "public_response", "")) or _resolve_reply_text(source_run)
    current_session_id = _text(
        runtime_context.get("buddy_session_id")
        or runtime_context.get("current_session_id")
        or _state_value_by_name(source_run, "current_session_id", "")
    )
    current_message_id = _text(
        runtime_context.get("buddy_current_message_id")
        or runtime_context.get("current_message_id")
    )

    report = {
        "scope": "source_run",
        "source_run_id": source_run_id,
        "source_run_status": _text(source_run.get("status")),
        "current_session_id": current_session_id,
        "current_message_id": current_message_id,
        "state_keys": _resolved_state_keys(source_run),
        "fallbacks": {
            "conversation_history": "empty_context_assembly_ref" if conversation_history == EMPTY_HISTORY_REF else "",
            "public_response": "reply_state_or_output" if public_response and not _text(_state_value_by_name(source_run, "public_response", "")) else "",
        },
    }
    return {
        "status": "succeeded",
        "source_run_id": source_run_id,
        "current_session_id": current_session_id,
        "user_message": user_message,
        "conversation_history": conversation_history,
        "request_understanding": request_understanding,
        "capability_result": capability_result,
        "capability_review": capability_review,
        "public_response": public_response,
        "review_context_report": report,
        "result": f"Loaded Buddy review context from source run {source_run_id}.",
    }


def _failed_result(*, source_run_id: str, error_type: str, error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "source_run_id": source_run_id,
        "current_session_id": "",
        "user_message": "",
        "conversation_history": _empty_history_ref(),
        "request_understanding": {},
        "capability_result": {},
        "capability_review": {},
        "public_response": "",
        "review_context_report": {
            "scope": "source_run",
            "source_run_id": source_run_id,
            "error_type": error_type,
            "error": error,
        },
        "error_type": error_type,
        "error": error,
        "result": f"Buddy review context loading failed: {error}",
    }


def _state_value_by_name(run: dict[str, Any], state_name: str, fallback: Any) -> Any:
    state_key = _find_state_key_by_name(run, state_name) or state_name
    for values in _state_value_maps(run):
        if state_key in values:
            return values[state_key]
        if state_name in values:
            return values[state_name]
    return fallback


def _state_value_maps(run: dict[str, Any]) -> list[dict[str, Any]]:
    maps: list[dict[str, Any]] = []
    snapshot_values = _dict(_dict(run.get("state_snapshot")).get("values"))
    artifact_values = _dict(_dict(run.get("artifacts")).get("state_values"))
    direct_values = _dict(run.get("state_values"))
    for values in (snapshot_values, artifact_values, direct_values):
        if values:
            maps.append(values)
    return maps


def _find_state_key_by_name(run: dict[str, Any], state_name: str) -> str:
    state_schema = _dict(_dict(run.get("graph_snapshot")).get("state_schema"))
    for state_key, definition in state_schema.items():
        if _text(_dict(definition).get("name")) == state_name:
            return str(state_key)
    return ""


def _resolved_state_keys(run: dict[str, Any]) -> dict[str, str]:
    names = [
        "current_session_id",
        "user_message",
        "conversation_history",
        "request_understanding",
        "capability_result",
        "capability_review",
        "public_response",
    ]
    return {name: _find_state_key_by_name(run, name) or name for name in names}


def _resolve_reply_text(run: dict[str, Any]) -> str:
    for state_key in _reply_state_keys(run):
        for values in _state_value_maps(run):
            if state_key in values:
                text = _stringify_reply_candidate(values[state_key])
                if text:
                    return text
    for preview in _output_previews(run):
        source_key = _text(preview.get("source_key"))
        if source_key and source_key not in _reply_state_keys(run):
            continue
        text = _stringify_reply_candidate(preview.get("value"))
        if text:
            return text
    return _text(run.get("final_result"))


def _reply_state_keys(run: dict[str, Any]) -> list[str]:
    keys: list[str] = []
    state_schema = _dict(_dict(run.get("graph_snapshot")).get("state_schema"))
    for state_key, definition in state_schema.items():
        if _text(_dict(definition).get("name")) in REPLY_STATE_NAMES:
            keys.append(str(state_key))
    for state_key in REPLY_STATE_KEYS:
        if state_key not in keys:
            keys.append(state_key)
    if "buddy_reply" not in keys:
        keys.append("buddy_reply")
    return keys


def _output_previews(run: dict[str, Any]) -> list[dict[str, Any]]:
    previews: list[dict[str, Any]] = []
    for value in (run.get("output_previews"), _dict(run.get("artifacts")).get("output_previews")):
        if isinstance(value, list):
            previews.extend(item for item in value if isinstance(item, dict))
    return previews


def _stringify_reply_candidate(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("text", "result", "public_response", "final_response", "content", "value"):
            text = _text(value.get(key))
            if text:
                return text
    return ""


def _empty_history_ref() -> dict[str, Any]:
    return json.loads(json.dumps(EMPTY_HISTORY_REF))


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _ensure_backend_path() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


if __name__ == "__main__":
    raw_payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(buddy_review_context_loader(raw_payload), ensure_ascii=False))
