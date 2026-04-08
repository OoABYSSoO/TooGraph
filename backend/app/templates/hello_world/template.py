from __future__ import annotations

from typing import Any

from app.templates.hello_world.handlers import get_hello_world_supported_node_types
from app.templates.hello_world.state import get_hello_world_state_keys, get_hello_world_state_schema


def _create_node(
    *,
    node_id: str,
    node_type: str,
    label: str,
    x: int,
    y: int,
    reads: list[str] | None = None,
    writes: list[str] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params = params or {}
    return {
        "id": node_id,
        "type": node_type,
        "label": label,
        "position": {"x": x, "y": y},
        "reads": reads or [],
        "writes": writes or [],
        "params": params,
        "config": dict(params),
        "implementation": {
            "executor": "node_handler",
            "handler_key": node_type,
            "tool_keys": ["generate_hello_greeting"] if node_type == "hello_model" else [],
        },
    }


def _create_edge(*, edge_id: str, source: str, target: str, flow_keys: list[str]) -> dict[str, Any]:
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "flow_keys": flow_keys,
        "edge_kind": "normal",
    }


def _create_default_graph(theme_preset: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": theme_preset.get("graph_name") or "Hello World",
        "template_id": "hello_world",
        "theme_config": theme_preset["theme_config"],
        "state_schema": get_hello_world_state_schema(),
        "nodes": [
            _create_node(node_id="start_1", node_type="start", label="Start", x=80, y=220),
            _create_node(
                node_id="hello_model_1",
                node_type="hello_model",
                label="Hello Model",
                x=360,
                y=220,
                reads=["name"],
                writes=["name", "greeting", "final_result", "llm_response"],
                params={
                    "name": "Abyss",
                    "temperature": 0.2,
                    "max_tokens": 40,
                },
            ),
            _create_node(node_id="end_1", node_type="end", label="End", x=660, y=220, reads=["greeting", "final_result"]),
        ],
        "edges": [
            _create_edge(edge_id="edge_1", source="start_1", target="hello_model_1", flow_keys=["name"]),
            _create_edge(edge_id="edge_2", source="hello_model_1", target="end_1", flow_keys=["greeting", "final_result"]),
        ],
        "metadata": {},
    }


def get_hello_world_template() -> dict[str, Any]:
    theme_preset = {
        "id": "hello_local",
        "label": "Hello Local",
        "description": "Minimal local LLM validation flow.",
        "graph_name": "Hello World",
        "node_param_overrides": {},
        "theme_config": {
            "theme_preset": "hello_local",
            "domain": "llm_validation",
            "genre": "hello_world",
            "market": "local",
            "platform": "openai_compatible",
            "language": "zh",
            "creative_style": "minimal",
            "tone": "plain",
            "language_constraints": [],
            "evaluation_policy": {},
            "asset_source_policy": {},
            "strategy_profile": {
                "hookTheme": "",
                "payoffTheme": "",
                "visualPattern": "",
                "pacingPattern": "",
                "evaluationFocus": [],
            },
        },
    }
    return {
        "template_id": "hello_world",
        "label": "Hello World",
        "description": "Send a name to the local language model and return a greeting.",
        "default_graph_name": "Hello World",
        "default_theme_preset": theme_preset["id"],
        "supported_node_types": get_hello_world_supported_node_types(),
        "state_keys": get_hello_world_state_keys(),
        "state_schema": get_hello_world_state_schema(),
        "theme_presets": [theme_preset],
        "default_graph": _create_default_graph(theme_preset),
    }
