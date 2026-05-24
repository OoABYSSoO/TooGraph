from __future__ import annotations

import json
import sys
from typing import Any


RENDERED_HISTORY_COMPACTION_THRESHOLD_CHARS = 6000
CAPABILITY_RESULT_COMPACTION_THRESHOLD_CHARS = 6000
PUBLIC_RESPONSE_COMPACTION_THRESHOLD_CHARS = 7000

VALID_TRIGGERS = {"preflight", "capability_result", "overflow_recovery", "background"}


def buddy_context_pressure_check(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    trigger = _normalize_trigger(inputs.get("trigger"), inputs.get("capability_result"))
    rendered_history_chars = _text_length(inputs.get("conversation_history"))
    user_message_chars = _text_length(inputs.get("user_message"))
    existing_session_summary_chars = _text_length(inputs.get("existing_session_summary"))
    context_compaction_summary_chars = _text_length(inputs.get("context_compaction_summary"))
    session_summary_chars = max(existing_session_summary_chars, context_compaction_summary_chars)
    capability_result_chars = _value_length(inputs.get("capability_result"))
    public_response_chars = _text_length(inputs.get("public_response"))

    thresholds = {
        "rendered_history_chars": RENDERED_HISTORY_COMPACTION_THRESHOLD_CHARS,
        "capability_result_chars": CAPABILITY_RESULT_COMPACTION_THRESHOLD_CHARS,
        "public_response_chars": PUBLIC_RESPONSE_COMPACTION_THRESHOLD_CHARS,
    }
    pressure_sources = _resolve_pressure_sources(
        trigger=trigger,
        rendered_history_chars=rendered_history_chars,
        session_summary_chars=session_summary_chars,
        capability_result_chars=capability_result_chars,
        public_response_chars=public_response_chars,
        thresholds=thresholds,
    )
    reason = _resolve_pressure_reason(trigger=trigger, pressure_sources=pressure_sources)
    should_compact = reason in {"history_pressure", "result_pressure", "overflow_recovery"}
    report = {
        "version": 1,
        "trigger": trigger,
        "rendered_history_chars": rendered_history_chars,
        "user_message_chars": user_message_chars,
        "existing_session_summary_chars": existing_session_summary_chars,
        "context_compaction_summary_chars": context_compaction_summary_chars,
        "session_summary_chars": session_summary_chars,
        "capability_result_chars": capability_result_chars,
        "public_response_chars": public_response_chars,
        "thresholds": thresholds,
        "pressure_sources": pressure_sources,
        "reason": reason,
        "should_compact": should_compact,
    }
    return {
        "status": "succeeded",
        "needs_context_compaction": should_compact,
        "context_budget_report": report,
        "context_compaction_trigger": trigger,
        "reason": reason,
    }


def _normalize_trigger(value: Any, capability_result: Any) -> str:
    trigger = _text(value)
    if _has_capability_result(capability_result) and trigger not in {"overflow_recovery", "background"}:
        return "capability_result"
    if trigger in VALID_TRIGGERS:
        return trigger
    return "preflight"


def _resolve_pressure_sources(
    *,
    trigger: str,
    rendered_history_chars: int,
    session_summary_chars: int,
    capability_result_chars: int,
    public_response_chars: int,
    thresholds: dict[str, int],
) -> list[str]:
    sources: list[str] = []
    if rendered_history_chars >= thresholds["rendered_history_chars"]:
        sources.append("history")
    if (
        capability_result_chars >= thresholds["capability_result_chars"]
        or public_response_chars >= thresholds["public_response_chars"]
    ):
        sources.append("result")
    return sources


def _resolve_pressure_reason(*, trigger: str, pressure_sources: list[str]) -> str:
    if trigger == "overflow_recovery":
        return "overflow_recovery"
    if "history" in pressure_sources:
        return "history_pressure"
    if "result" in pressure_sources:
        return "result_pressure"
    return "none"


def _has_capability_result(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    outputs = value.get("outputs")
    if isinstance(outputs, dict) and outputs:
        return True
    return any(key not in {"kind", "outputs"} for key in value)


def _value_length(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False, sort_keys=True))
    except Exception:
        return len(str(value))


def _text_length(value: Any) -> int:
    return len(_text(value))


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "failed", "error_type": "invalid_json", "error": str(exc)}, ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(
            json.dumps(
                {"status": "failed", "error_type": "invalid_input", "error": "stdin must be a JSON object."},
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps(buddy_context_pressure_check(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
