from __future__ import annotations

from app.templates.creative_factory import get_creative_factory_template
from app.templates.hello_world import get_hello_world_template


def list_templates() -> list[dict]:
    return [get_creative_factory_template(), get_hello_world_template()]


def get_template(template_id: str) -> dict:
    templates = {item["template_id"]: item for item in list_templates()}
    if template_id not in templates:
        raise KeyError(template_id)
    return templates[template_id]
