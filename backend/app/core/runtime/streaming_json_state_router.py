from __future__ import annotations

from typing import Any


def route_streaming_json_state_text(text: str, state_keys: list[str]) -> dict[str, dict[str, Any]]:
    allowed_keys = {key for key in state_keys if key}
    routes: dict[str, dict[str, Any]] = {}
    source = str(text or "").lstrip()
    if not source.startswith("{"):
        return routes

    index = source.find("{") + 1
    while index < len(source):
        index = _skip_whitespace_and_comma(source, index)
        key_result = _read_json_string(source, index)
        if key_result is None:
            break
        index = _skip_whitespace(source, int(key_result["next_index"]))
        if index >= len(source) or source[index] != ":":
            break
        index = _skip_whitespace(source, index + 1)
        if index < len(source) and source[index] == '"':
            value_result = _read_json_string(source, index, allow_partial=True)
            if value_result is None:
                break
            state_key = str(key_result["value"])
            if state_key in allowed_keys:
                routes[state_key] = {
                    "text": value_result["value"],
                    "completed": bool(value_result["completed"]),
                }
            index = int(value_result["next_index"])
            continue
        index = _skip_json_value(source, index)

    return routes


def _skip_whitespace_and_comma(source: str, index: int) -> int:
    cursor = index
    while cursor < len(source) and (source[cursor].isspace() or source[cursor] == ","):
        cursor += 1
    return cursor


def _skip_whitespace(source: str, index: int) -> int:
    cursor = index
    while cursor < len(source) and source[cursor].isspace():
        cursor += 1
    return cursor


def _read_json_string(source: str, index: int, *, allow_partial: bool = False) -> dict[str, Any] | None:
    if index >= len(source) or source[index] != '"':
        return None
    cursor = index + 1
    value = ""
    while cursor < len(source):
        char = source[cursor]
        if char == '"':
            return {"value": value, "next_index": cursor + 1, "completed": True}
        if char == "\\":
            escaped = source[cursor + 1] if cursor + 1 < len(source) else None
            if escaped is None:
                return {"value": value, "next_index": len(source), "completed": False} if allow_partial else None
            value += _decode_json_escape(escaped)
            cursor += 2
            continue
        value += char
        cursor += 1
    return {"value": value, "next_index": len(source), "completed": False} if allow_partial else None


def _decode_json_escape(char: str) -> str:
    if char == "n":
        return "\n"
    if char == "r":
        return "\r"
    if char == "t":
        return "\t"
    if char == '"':
        return '"'
    if char == "\\":
        return "\\"
    if char == "/":
        return "/"
    return char


def _skip_json_value(source: str, index: int) -> int:
    cursor = index
    depth = 0
    in_string = False
    while cursor < len(source):
        char = source[cursor]
        if in_string:
            if char == "\\":
                cursor += 2
                continue
            if char == '"':
                in_string = False
            cursor += 1
            continue
        if char == '"':
            in_string = True
        elif char in {"{", "["}:
            depth += 1
        elif char in {"}", "]"}:
            if depth == 0:
                return cursor
            depth -= 1
        elif char == "," and depth == 0:
            return cursor + 1
        cursor += 1
    return cursor
