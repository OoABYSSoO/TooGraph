from __future__ import annotations

from app.core.schemas.node_system import NodeSystemGraphPayload
from app.templates.loader import (
    delete_user_template_record,
    disable_user_template_record,
    enable_user_template_record,
    load_template_record,
    list_template_records,
    save_user_template_record,
)


def list_templates(include_disabled: bool = False) -> list[dict]:
    return list_template_records(include_disabled=include_disabled)


def get_template(template_id: str) -> dict:
    return load_template_record(template_id)


def save_template(graph_payload: NodeSystemGraphPayload) -> dict:
    return save_user_template_record(graph_payload)


def disable_template(template_id: str) -> dict:
    return disable_user_template_record(template_id)


def enable_template(template_id: str) -> dict:
    return enable_user_template_record(template_id)


def delete_template(template_id: str) -> None:
    delete_user_template_record(template_id)
