from __future__ import annotations

import sqlite3
from pathlib import Path
from uuid import uuid4

from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload
from app.core.storage.database import GRAPH_DATA_DIR, get_connection, row_payload
from app.core.storage.json_file_utils import read_json_file, write_json_file


_GRAPH_STORAGE_MIGRATED = False


def save_graph(graph_payload: NodeSystemGraphPayload) -> NodeSystemGraphDocument:
    _initialize_graph_storage()
    graph_id = graph_payload.graph_id or _generate_graph_id()
    graph = NodeSystemGraphDocument.model_validate(
        {
            **graph_payload.model_dump(exclude={"graph_id"}, by_alias=True),
            "graph_id": graph_id,
        }
    )
    write_json_file(_graph_path(graph.graph_id), graph.model_dump(by_alias=True))
    return graph


def load_graph(graph_id: str) -> NodeSystemGraphDocument:
    _initialize_graph_storage()
    path = _graph_path(graph_id)
    payload = read_json_file(path, default=None)
    if payload is None:
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    return NodeSystemGraphDocument.model_validate(payload)


def list_graphs() -> list[NodeSystemGraphDocument]:
    _initialize_graph_storage()
    graphs: list[NodeSystemGraphDocument] = []
    for path in sorted(GRAPH_DATA_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            payload = read_json_file(path, default=None)
            if payload is None:
                continue
            graphs.append(NodeSystemGraphDocument.model_validate(payload))
        except Exception:
            continue
    return graphs


def _initialize_graph_storage() -> None:
    global _GRAPH_STORAGE_MIGRATED
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _GRAPH_STORAGE_MIGRATED:
        return
    _migrate_graphs_from_database()
    _GRAPH_STORAGE_MIGRATED = True


def _migrate_graphs_from_database() -> None:
    try:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM graphs ORDER BY updated_at DESC, graph_id DESC"
            ).fetchall()
    except sqlite3.OperationalError:
        return

    for row in rows:
        payload = row_payload(row)
        if payload is None:
            continue
        try:
            graph = NodeSystemGraphDocument.model_validate(payload)
        except Exception:
            continue
        path = _graph_path(graph.graph_id)
        if path.exists():
            continue
        write_json_file(path, graph.model_dump(by_alias=True))


def _graph_path(graph_id: str) -> Path:
    return GRAPH_DATA_DIR / f"{graph_id}.json"


def _generate_graph_id() -> str:
    return f"graph_{uuid4().hex[:10]}"
