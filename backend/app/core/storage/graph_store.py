from __future__ import annotations

from uuid import uuid4

from app.core.schemas.graph_family import AnyGraphDocument, AnyGraphPayload, parse_graph_document
from app.core.storage.database import get_connection, row_payload


def save_graph(graph_payload: AnyGraphPayload) -> AnyGraphDocument:
    graph_id = graph_payload.graph_id or _generate_graph_id()
    graph = parse_graph_document(
        {
            **graph_payload.model_dump(exclude={"graph_id"}, by_alias=True),
            "graph_id": graph_id,
        }
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO graphs (graph_id, name, template_id, payload_json, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(graph_id) DO UPDATE SET
                name = excluded.name,
                template_id = excluded.template_id,
                payload_json = excluded.payload_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                graph.graph_id,
                graph.name,
                graph.template_id,
                graph.model_dump_json(),
            ),
        )
        connection.commit()
    return graph


def load_graph(graph_id: str) -> AnyGraphDocument:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT payload_json FROM graphs WHERE graph_id = ?",
            (graph_id,),
        ).fetchone()
    payload = row_payload(row)
    if payload is None:
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    return parse_graph_document(payload)


def list_graphs() -> list[AnyGraphDocument]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT payload_json FROM graphs ORDER BY updated_at DESC, graph_id DESC"
        ).fetchall()
    graphs: list[AnyGraphDocument] = []
    for row in rows:
        payload = row_payload(row)
        if payload is not None:
            graphs.append(parse_graph_document(payload))
    return graphs


def _generate_graph_id() -> str:
    return f"graph_{uuid4().hex[:10]}"
