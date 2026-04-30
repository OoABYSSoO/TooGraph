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
        if state_type in {
            NodeSystemStateType.NUMBER,
            NodeSystemStateType.BOOLEAN,
            NodeSystemStateType.OBJECT,
            NodeSystemStateType.ARRAY,
            NodeSystemStateType.JSON,
            NodeSystemStateType.FILE_LIST,
        }:
            return parsed
        if (
            state_type
            in {
                NodeSystemStateType.IMAGE,
                NodeSystemStateType.AUDIO,
                NodeSystemStateType.VIDEO,
                NodeSystemStateType.FILE,
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
