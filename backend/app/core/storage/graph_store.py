from __future__ import annotations

from uuid import uuid4

from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload


def save_graph(graph_payload: NodeSystemGraphPayload) -> NodeSystemGraphDocument:
    graph_id = graph_payload.graph_id or _generate_graph_id()
    graph = NodeSystemGraphDocument.model_validate(
        {
            **graph_payload.model_dump(exclude={"graph_id"}, by_alias=True),
            "graph_id": graph_id,
        }
    )
    from app.core.storage.database import get_connection

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


def load_graph(graph_id: str) -> NodeSystemGraphDocument:
    from app.core.storage.database import get_connection, row_payload

    with get_connection() as connection:
        row = connection.execute(
            "SELECT payload_json FROM graphs WHERE graph_id = ?",
            (graph_id,),
        ).fetchone()
    payload = row_payload(row)
    if payload is None:
        raise FileNotFoundError(f"Graph '{graph_id}' does not exist.")
    return NodeSystemGraphDocument.model_validate(payload)


def list_graphs() -> list[NodeSystemGraphDocument]:
    from app.core.storage.database import get_connection, row_payload

    with get_connection() as connection:
        rows = connection.execute(
            "SELECT payload_json FROM graphs ORDER BY updated_at DESC, graph_id DESC"
        ).fetchall()
    graphs: list[NodeSystemGraphDocument] = []
    for row in rows:
        payload = row_payload(row)
        if payload is not None:
            try:
                graphs.append(NodeSystemGraphDocument.model_validate(payload))
            except Exception:
                continue
    return graphs


def _generate_graph_id() -> str:
    return f"graph_{uuid4().hex[:10]}"
