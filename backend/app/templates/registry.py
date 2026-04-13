from __future__ import annotations

from app.templates.loader import load_template_record, list_template_records


def list_templates() -> list[dict]:
    return list_template_records()


def get_template(template_id: str) -> dict:
    return load_template_record(template_id)
