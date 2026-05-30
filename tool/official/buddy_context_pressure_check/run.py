from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


HISTORY_COMPACTION_THRESHOLD_CHARS = 6000
TOTAL_CONTEXT_PRESSURE_THRESHOLD_CHARS = 12000
NON_HISTORY_CONTEXT_THRESHOLD_CHARS = 9000
MIN_HISTORY_CHARS_FOR_TOTAL_PRESSURE_COMPACTION = 3000
DEFAULT_CONTEXT_COMPRESSION_THRESHOLD = 0.9


def buddy_context_pressure_check(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    items = _normalize_context_items(inputs)
    measurements = [_measure_context_item(item) for item in items]
    history_measurements = [item for item in measurements if item["is_history"]]

    total_context_chars = sum(int(item["chars"]) for item in measurements)
    history_used_chars = sum(int(item["chars"]) for item in history_measurements)
    history_source_chars = sum(int(item["source_chars"]) for item in history_measurements)
    history_omitted_count = sum(int(item["omitted_count"]) for item in history_measurements)
    non_history_chars = max(0, total_context_chars - history_used_chars)

    has_history_pressure = (
        history_used_chars >= HISTORY_COMPACTION_THRESHOLD_CHARS
        or history_source_chars >= HISTORY_COMPACTION_THRESHOLD_CHARS
        or history_omitted_count > 0
    )
    has_total_pressure = total_context_chars >= TOTAL_CONTEXT_PRESSURE_THRESHOLD_CHARS
    has_enough_history_to_help = max(history_used_chars, history_source_chars) >= MIN_HISTORY_CHARS_FOR_TOTAL_PRESSURE_COMPACTION
    provider_prompt_tokens, token_source = _resolve_prompt_tokens(inputs)
    model_budget = _normalize_model_budget(inputs.get("model_budget"))
    model_context_window_tokens = model_budget["context_window_tokens"]
    compression_threshold = model_budget["compression_threshold"]
    prompt_token_pressure = (
        provider_prompt_tokens / model_context_window_tokens
        if provider_prompt_tokens is not None and model_context_window_tokens
        else None
    )
    has_token_pressure = (
        prompt_token_pressure is not None
        and prompt_token_pressure >= compression_threshold
    )
    should_compact = bool(
        history_measurements
        and (
            has_token_pressure
            or has_history_pressure
            or (has_total_pressure and has_enough_history_to_help)
        )
    )
    pressure_sources = _pressure_sources(
        has_history_pressure=has_history_pressure,
        has_total_pressure=has_total_pressure,
        has_token_pressure=has_token_pressure,
        non_history_chars=non_history_chars,
        should_compact=should_compact,
    )
    reason = _pressure_reason(
        should_compact=should_compact,
        has_history_pressure=has_history_pressure,
        has_total_pressure=has_total_pressure,
        has_token_pressure=has_token_pressure,
    )
    source_refs = _history_source_refs(history_measurements)
    report = {
        "version": 3,
        "total_context_chars": total_context_chars,
        "history_used_chars": history_used_chars,
        "history_source_chars": history_source_chars,
        "history_omitted_count": history_omitted_count,
        "non_history_chars": non_history_chars,
        "user_message_chars": _chars_for_state(measurements, "user_message"),
        "buddy_context_chars": _chars_for_state(measurements, "buddy_context"),
        "capability_result_chars": _chars_for_state(measurements, "capability_result"),
        "context_items": [
            {
                "state": item["state"],
                "type": item["type"],
                "chars": item["chars"],
                "source_chars": item["source_chars"],
                "is_history": item["is_history"],
                "history_view": item["history_view"],
            }
            for item in measurements
        ],
        "source_refs": source_refs,
        "summary_source_refs": source_refs,
        "provider_prompt_tokens": provider_prompt_tokens,
        "token_source": token_source,
        "model_context_window_tokens": model_context_window_tokens,
        "model_ref": model_budget["model_ref"],
        "max_output_tokens": model_budget["max_output_tokens"],
        "compression_threshold": compression_threshold,
        "prompt_token_pressure": prompt_token_pressure,
        "thresholds": {
            "history_chars": HISTORY_COMPACTION_THRESHOLD_CHARS,
            "total_context_chars": TOTAL_CONTEXT_PRESSURE_THRESHOLD_CHARS,
            "non_history_context_chars": NON_HISTORY_CONTEXT_THRESHOLD_CHARS,
            "min_history_chars_for_total_pressure": MIN_HISTORY_CHARS_FOR_TOTAL_PRESSURE_COMPACTION,
            "prompt_token_pressure": compression_threshold,
        },
        "pressure_sources": pressure_sources,
        "reason": reason,
        "should_compact": should_compact,
    }
    return {
        "status": "succeeded",
        "needs_context_compaction": should_compact,
        "context_budget_report": report,
        "reason": reason,
    }


def _normalize_context_items(inputs: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = inputs.get("context_items")
    if isinstance(raw_items, list):
        return [_normalize_context_item(item) for item in raw_items if isinstance(item, dict)]

    # Backward-compatible fallback for direct CLI/debug invocation. The manifest no longer exposes
    # these fields; runtime tool nodes pass context_items.
    legacy_states = [
        "user_message",
        "conversation_history",
        "buddy_context",
        "capability_result",
        "public_response",
    ]
    return [
        _normalize_context_item({"state": state, "type": "json", "value": inputs.get(state)})
        for state in legacy_states
        if state in inputs
    ]


def _normalize_context_item(item: dict[str, Any]) -> dict[str, Any]:
    state = _text(item.get("state"))
    return {
        "state": state,
        "name": _text(item.get("name")) or state,
        "description": _text(item.get("description")),
        "type": _text(item.get("type")) or _text(item.get("valueType")) or "json",
        "required": bool(item.get("required")),
        "value": item.get("value"),
    }


def _measure_context_item(item: dict[str, Any]) -> dict[str, Any]:
    value = item.get("value")
    rendered_chars = _prompt_value_length(value, item.get("type"))
    budget = _context_budget(value)
    source_chars = max(rendered_chars, _non_negative_int(budget.get("source_chars"), 0))
    used_chars = max(rendered_chars, _non_negative_int(budget.get("used_chars"), 0))
    omitted_count = _non_negative_int(budget.get("omitted_count"), 0)
    metadata = value.get("metadata") if isinstance(value, dict) and isinstance(value.get("metadata"), dict) else {}
    is_history = _is_history_context(item, value)
    return {
        "state": str(item.get("state") or ""),
        "type": str(item.get("type") or "json"),
        "chars": used_chars if is_history else rendered_chars,
        "source_chars": source_chars if is_history else rendered_chars,
        "omitted_count": omitted_count if is_history else 0,
        "is_history": is_history,
        "history_view": _text(metadata.get("history_view")) if isinstance(metadata, dict) else "",
        "source_refs": _context_source_refs(value) if is_history else [],
    }


def _is_history_context(item: dict[str, Any], value: Any) -> bool:
    state = _text(item.get("state"))
    if state == "conversation_history":
        return True
    if not isinstance(value, dict):
        return False
    metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
    return (
        _text(value.get("authority")) == "history"
        or _text(value.get("source_kind")) == "session"
        or bool(_text(metadata.get("history_view")))
    )


def _pressure_sources(
    *,
    has_history_pressure: bool,
    has_total_pressure: bool,
    has_token_pressure: bool,
    non_history_chars: int,
    should_compact: bool,
) -> list[str]:
    sources: list[str] = []
    if has_token_pressure:
        sources.append("provider_usage")
    if has_history_pressure:
        sources.append("history")
    if has_total_pressure:
        sources.append("total_context")
    if non_history_chars >= NON_HISTORY_CONTEXT_THRESHOLD_CHARS and not should_compact:
        sources.append("non_history")
    return sources


def _pressure_reason(
    *,
    should_compact: bool,
    has_history_pressure: bool,
    has_total_pressure: bool,
    has_token_pressure: bool,
) -> str:
    if should_compact and has_token_pressure:
        return "provider_usage_pressure"
    if should_compact and has_history_pressure:
        return "history_pressure"
    if should_compact and has_total_pressure:
        return "total_context_pressure"
    if has_total_pressure:
        return "non_history_pressure"
    return "none"


def _chars_for_state(measurements: list[dict[str, Any]], state: str) -> int:
    return sum(int(item["chars"]) for item in measurements if item.get("state") == state)


def _history_source_refs(measurements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for item in measurements:
        item_refs = item.get("source_refs") if isinstance(item.get("source_refs"), list) else []
        for ref in item_refs:
            if isinstance(ref, dict):
                refs.append(dict(ref))
    return refs


def _resolve_prompt_tokens(inputs: dict[str, Any]) -> tuple[int | None, str]:
    for source_key in ("provider_usage", "usage", "model_usage"):
        tokens = _extract_prompt_tokens(inputs.get(source_key))
        if tokens is not None:
            return tokens, "provider_usage"

    context_report = inputs.get("context_assembly_report")
    if isinstance(context_report, dict):
        tokens = _extract_prompt_tokens(context_report.get("provider_usage"))
        if tokens is not None:
            return tokens, "provider_usage"
        totals = context_report.get("totals")
        if isinstance(totals, dict):
            estimate = _positive_int(totals.get("token_estimate"))
            if estimate is not None:
                return estimate, "context_assembly_estimate"

    return None, "unavailable"


def _extract_prompt_tokens(value: Any) -> int | None:
    if not isinstance(value, dict):
        return None
    for key in (
        "prompt_tokens",
        "input_tokens",
        "promptTokenCount",
        "promptTokens",
        "inputTokens",
    ):
        tokens = _positive_int(value.get(key))
        if tokens is not None:
            return tokens
    nested_usage = value.get("usage")
    if isinstance(nested_usage, dict):
        return _extract_prompt_tokens(nested_usage)
    return None


def _normalize_model_budget(value: Any) -> dict[str, Any]:
    budget = value if isinstance(value, dict) else {}
    threshold = _positive_float(budget.get("compression_threshold"))
    if threshold is None:
        threshold = _positive_float(budget.get("context_compression_threshold"))
    if threshold is None:
        threshold = DEFAULT_CONTEXT_COMPRESSION_THRESHOLD
    return {
        "model_ref": _text(budget.get("model_ref")),
        "context_window_tokens": _positive_int(budget.get("context_window_tokens") or budget.get("context_window")),
        "max_output_tokens": _positive_int(budget.get("max_output_tokens") or budget.get("max_tokens")),
        "compression_threshold": min(1.0, max(0.01, threshold)),
    }


def _prompt_value_length(value: Any, value_type: Any = None) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value.strip())
    expanded = _expand_context_value_text(value)
    if expanded is not None:
        return len(expanded.strip())
    if _text(value_type) == "result_package":
        return _result_package_prompt_length(value)
    return _json_length(value)


def _result_package_prompt_length(value: Any) -> int:
    if not isinstance(value, dict):
        return _json_length(value)
    outputs = value.get("outputs")
    if not isinstance(outputs, dict):
        return _json_length(value)
    total = 0
    for output_key, output in outputs.items():
        output_value = output.get("value") if isinstance(output, dict) else output
        total += len(str(output_key)) + min(_json_length(output_value), 1600)
    return total


def _json_length(value: Any) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False, sort_keys=True))
    except Exception:
        return len(str(value))


def _expand_context_value_text(value: Any) -> str | None:
    if not isinstance(value, dict) or value.get("kind") not in {"context_assembly_ref", "context_package"}:
        return None
    try:
        repo_root = _repo_root()
        backend_path = repo_root / "backend"
        if str(backend_path) not in sys.path:
            sys.path.insert(0, str(backend_path))
        from app.core.storage.context_assembly_store import (
            expand_context_assembly_ref,
            expand_context_package,
        )

        expanded = expand_context_package(value) if value.get("kind") == "context_package" else expand_context_assembly_ref(value)
        return str(expanded.get("text") or "")
    except Exception:
        return None


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _context_budget(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    budget = value.get("budget")
    if isinstance(budget, dict):
        return budget
    context_ref = value.get("context_ref")
    if isinstance(context_ref, dict) and isinstance(context_ref.get("budget"), dict):
        return context_ref["budget"]
    return {}


def _context_source_refs(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    refs = value.get("source_refs")
    if not isinstance(refs, list):
        context_ref = value.get("context_ref")
        refs = context_ref.get("source_refs") if isinstance(context_ref, dict) else []
    if not isinstance(refs, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, ref in enumerate(refs):
        if not isinstance(ref, dict):
            continue
        source_kind = _text(ref.get("source_kind"))
        source_id = _text(ref.get("source_id"))
        if not source_kind or not source_id:
            continue
        normalized_ref = dict(ref)
        normalized_ref["source_kind"] = source_kind
        normalized_ref["source_id"] = source_id
        normalized_ref["ordinal"] = _non_negative_int(normalized_ref.get("ordinal"), index)
        normalized.append(normalized_ref)
    return normalized


def _text(value: Any) -> str:
    return str(value or "").strip()


def _non_negative_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default


def _positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _positive_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


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
