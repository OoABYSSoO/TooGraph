from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from app.schemas.graph import GraphDocument, GraphPayload


BASE_DIR = Path(__file__).resolve().parents[2]
GRAPH_DATA_DIR = BASE_DIR / "data" / "graphs"


def save_graph(graph_payload: GraphPayload) -> GraphDocument:
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    graph_id = graph_payload.graph_id or _generate_graph_id()
    graph = GraphDocument(
        **graph_payload.model_dump(exclude={"graph_id"}),
        graph_id=graph_id,
    )
    graph_path = GRAPH_DATA_DIR / f"{graph_id}.json"
    graph_path.write_text(
        json.dumps(graph.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return graph


def load_graph(graph_id: str) -> GraphDocument:
    graph_path = GRAPH_DATA_DIR / f"{graph_id}.json"
    if not graph_path.exists():
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    return GraphDocument.model_validate_json(graph_path.read_text(encoding="utf-8"))


def _generate_graph_id() -> str:
    return f"graph_{uuid4().hex[:10]}"
