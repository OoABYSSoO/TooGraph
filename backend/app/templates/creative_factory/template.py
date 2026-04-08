from __future__ import annotations

from typing import Any

from app.templates.creative_factory.handlers import get_creative_factory_supported_node_types
from app.templates.creative_factory.state import get_creative_factory_state_keys, get_creative_factory_state_schema
from app.templates.creative_factory.themes import get_creative_factory_theme_presets


def get_creative_factory_template() -> dict[str, Any]:
    return {
        "template_id": "creative_factory",
        "label": "Creative Factory",
        "description": "Research, analyze, generate, review, and export a creative package.",
        "default_graph_name": "Creative Factory",
        "default_theme_preset": "slg_launch",
        "supported_node_types": get_creative_factory_supported_node_types(),
        "state_keys": get_creative_factory_state_keys(),
        "state_schema": get_creative_factory_state_schema(),
        "theme_presets": get_creative_factory_theme_presets(),
    }
