from __future__ import annotations

from app.core.schemas.node_system import NodeSystemGraphPayload
from app.templates.loader import load_template_record, list_template_records, save_user_template_record


def list_templates() -> list[dict]:
    return list_template_records()


def get_template(template_id: str) -> dict:
    return load_template_record(template_id)


def save_template(graph_payload: NodeSystemGraphPayload) -> dict:
    return save_user_template_record(graph_payload)
