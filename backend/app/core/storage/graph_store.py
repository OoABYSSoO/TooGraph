from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.core.schemas.node_system import NodeSystemCatalogStatus, NodeSystemGraphDocument, NodeSystemGraphPayload
from app.core.storage.database import GRAPH_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


def save_graph(graph_payload: NodeSystemGraphPayload) -> NodeSystemGraphDocument:
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    graph_id = graph_payload.graph_id or _generate_graph_id()
    path = _graph_path(graph_id)
    existing_payload = read_json_file(path, default=None)
    existing_document = NodeSystemGraphDocument.model_validate(existing_payload) if existing_payload else None
    graph = NodeSystemGraphDocument.model_validate(
        {
            **graph_payload.model_dump(exclude={"graph_id"}, by_alias=True, mode="json"),
            "graph_id": graph_id,
            "status": existing_document.status if existing_document else NodeSystemCatalogStatus.ACTIVE,
        }
    )
    write_json_file(path, graph.model_dump(by_alias=True, mode="json"))
    return graph


def load_graph(graph_id: str) -> NodeSystemGraphDocument:
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = _graph_path(graph_id)
    payload = read_json_file(path, default=None)
    if payload is None:
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    return NodeSystemGraphDocument.model_validate(payload)


def list_graphs(include_disabled: bool = False) -> list[NodeSystemGraphDocument]:
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    graphs: list[NodeSystemGraphDocument] = []
    for path in sorted(GRAPH_DATA_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            payload = read_json_file(path, default=None)
            if payload is None:
                continue
            graph = NodeSystemGraphDocument.model_validate(payload)
            if graph.status == NodeSystemCatalogStatus.DISABLED and not include_disabled:
                continue
            graphs.append(graph)
        except Exception:
            continue
    return graphs


def disable_graph(graph_id: str) -> NodeSystemGraphDocument:
    return set_graph_status(graph_id, NodeSystemCatalogStatus.DISABLED)


def enable_graph(graph_id: str) -> NodeSystemGraphDocument:
    return set_graph_status(graph_id, NodeSystemCatalogStatus.ACTIVE)


def set_graph_status(graph_id: str, status: NodeSystemCatalogStatus) -> NodeSystemGraphDocument:
    graph = load_graph(graph_id)
    updated_graph = NodeSystemGraphDocument.model_validate(
        {
            **graph.model_dump(by_alias=True, mode="json"),
            "status": status.value,
        }
    )
    write_json_file(_graph_path(graph_id), updated_graph.model_dump(by_alias=True, mode="json"))
    return updated_graph


def delete_graph(graph_id: str) -> None:
    path = _graph_path(graph_id)
    if not path.exists():
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    path.unlink()


def _graph_path(graph_id: str) -> Path:
    return GRAPH_DATA_DIR / f"{graph_id}.json"


def _generate_graph_id() -> str:
    return f"graph_{uuid4().hex[:10]}"
