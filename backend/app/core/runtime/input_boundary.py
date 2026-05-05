from __future__ import annotations

import json
from typing import Any

from app.core.schemas.node_system import NodeSystemStateType


def first_truthy(values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def coerce_input_boundary_value(value: Any, state_type: NodeSystemStateType) -> Any:
    if not isinstance(value, str):
        return value

    try:
        parsed = json.loads(value)
        if state_type == NodeSystemStateType.FILE:
            return _coerce_file_reference(parsed)
        if state_type == NodeSystemStateType.FILE_LIST:
            return _coerce_file_reference_list(parsed)
        if state_type in {
            NodeSystemStateType.NUMBER,
            NodeSystemStateType.BOOLEAN,
            NodeSystemStateType.OBJECT,
            NodeSystemStateType.ARRAY,
            NodeSystemStateType.JSON,
            NodeSystemStateType.SKILL,
        }:
            return parsed
        if (
            state_type
            in {
                NodeSystemStateType.IMAGE,
                NodeSystemStateType.AUDIO,
                NodeSystemStateType.VIDEO,
            }
            and isinstance(parsed, dict)
            and parsed.get("kind") == "uploaded_file"
        ):
            return parsed
        if state_type == NodeSystemStateType.KNOWLEDGE_BASE:
            return value
        return value
    except json.JSONDecodeError:
        return value


def _coerce_file_reference(value: Any) -> Any:
    if isinstance(value, dict) and value.get("kind") == "uploaded_file":
        return first_truthy([value.get("localPath"), value.get("local_path"), value.get("path")]) or value
    return value


def _coerce_file_reference_list(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    return [_coerce_file_reference(item) for item in value]
