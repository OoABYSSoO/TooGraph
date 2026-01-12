from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.core.schemas.graph import GraphDocument, GraphPayload
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload

AnyGraphPayload = GraphPayload | NodeSystemGraphPayload
AnyGraphDocument = GraphDocument | NodeSystemGraphDocument


def is_node_system_payload(payload: dict[str, Any]) -> bool:
    if payload.get("graph_family") == "node_system":
        return True

    nodes = payload.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return False

    first_node = nodes[0]
    if not isinstance(first_node, dict):
        return False

    data = first_node.get("data")
    if not isinstance(data, dict):
        return False

    config = data.get("config")
    return isinstance(config, dict) and isinstance(config.get("family"), str)


def parse_graph_payload(payload: dict[str, Any]) -> AnyGraphPayload:
    if is_node_system_payload(payload):
        return NodeSystemGraphPayload.model_validate(payload)
    return GraphPayload.model_validate(payload)


def parse_graph_document(payload: dict[str, Any]) -> AnyGraphDocument:
    if is_node_system_payload(payload):
        return NodeSystemGraphDocument.model_validate(payload)
    return GraphDocument.model_validate(payload)


def normalize_graph_document(payload: AnyGraphPayload) -> AnyGraphDocument:
    if isinstance(payload, NodeSystemGraphPayload):
        return NodeSystemGraphDocument(
            **payload.model_dump(exclude={"graph_id"}, by_alias=True),
            graph_id=payload.graph_id or "temp",
        )

    return GraphDocument(
        **payload.model_dump(exclude={"graph_id"}),
        graph_id=payload.graph_id or "temp",
    )


def schema_errors_to_paths(exc: ValidationError) -> list[dict[str, str]]:
    return [
        {
            "code": "schema_validation_error",
            "message": error["msg"],
            "path": ".".join(str(item) for item in error["loc"]),
        }
        for error in exc.errors()
    ]
