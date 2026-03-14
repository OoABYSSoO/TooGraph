from __future__ import annotations

import json
from typing import Any


def normalize_message_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [normalize_message_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        for key in ("text", "content", "reasoning_content", "reasoning"):
            candidate = value.get(key)
            if candidate:
                return normalize_message_text(candidate)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def parse_sse_json_events(stream_text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    event_name = ""
    data_lines: list[str] = []

    def flush_event() -> None:
        nonlocal event_name, data_lines
        if not data_lines:
            event_name = ""
            return
        data = "\n".join(data_lines).strip()
        data_lines = []
        if not data or data == "[DONE]":
            event_name = ""
            return
        try:
            payload = json.loads(data)
        except ValueError:
            event_name = ""
            return
        if isinstance(payload, dict):
            if event_name and "_event" not in payload:
                payload["_event"] = event_name
            events.append(payload)
        event_name = ""

    for raw_line in stream_text.splitlines():
        line = raw_line.rstrip("\r")
        if not line:
            flush_event()
            continue
        if line.startswith("event:"):
            event_name = line[len("event:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].lstrip())
    flush_event()
    return events
