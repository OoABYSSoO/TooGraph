from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.runtime.handlers import LEGACY_HANDLER_MAP, STANDARD_HANDLER_MAP
from app.schemas.graph import NodeType


NodeHandler = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def get_node_handler_registry() -> dict[NodeType, NodeHandler]:
    return {
        **STANDARD_HANDLER_MAP,
        **LEGACY_HANDLER_MAP,
    }

