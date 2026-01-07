from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.runtime.handlers import STANDARD_HANDLER_MAP
from app.schemas.graph import NodeType


NodeHandler = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def get_node_handler_registry() -> dict[NodeType, NodeHandler]:
    return dict(STANDARD_HANDLER_MAP)
