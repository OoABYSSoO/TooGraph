from __future__ import annotations

from typing import Any

from app.templates.hello_world.handlers import get_hello_world_supported_node_types
from app.templates.hello_world.state import get_hello_world_state_keys, get_hello_world_state_schema


def _create_default_node_system_graph(theme_preset: dict[str, Any]) -> dict[str, Any]:
    return {
        "graph_family": "node_system",
        "name": theme_preset.get("graph_name") or "Hello World",
        "template_id": "hello_world",
        "theme_config": theme_preset["theme_config"],
        "state_schema": get_hello_world_state_schema(),
        "nodes": [
            {
                "id": "input_1",
                "type": "default",
                "position": {"x": 80, "y": 200},
                "data": {
                    "nodeId": "input_1",
                    "config": {
                        "presetId": "preset.input.name.v1",
                        "label": "Name Input",
                        "description": "Provide the name used to generate a greeting.",
                        "family": "input",
                        "valueType": "text",
                        "output": {
                            "key": "name",
                            "label": "Name",
                            "valueType": "text",
                        },
                        "defaultValue": "Abyss",
                        "inputMode": "inline",
                        "placeholder": "Enter a name",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_1",
                "type": "default",
                "position": {"x": 560, "y": 200},
                "data": {
                    "nodeId": "agent_1",
                    "config": {
                        "presetId": "preset.agent.hello_greeting.v1",
                        "label": "Hello Greeting",
                        "description": "Generate a greeting from the provided name.",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "name",
                                "label": "Name",
                                "valueType": "text",
                                "required": True,
                            }
                        ],
                        "outputs": [
                            {
                                "key": "greeting",
                                "label": "Greeting",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "You are a precise assistant.",
                        "taskInstruction": "Return a short greeting for the provided name.",
                        "skills": [
                            {
                                "name": "generate_greeting",
                                "skillKey": "generate_hello_greeting",
                                "inputMapping": {
                                    "name": "$inputs.name",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "greeting": "$skills.generate_greeting.greeting",
                        },
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_1",
                "type": "default",
                "position": {"x": 1040, "y": 200},
                "data": {
                    "nodeId": "output_1",
                    "config": {
                        "presetId": "preset.output.greeting.v1",
                        "label": "Greeting Output",
                        "description": "Preview and optionally persist the final greeting.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Greeting",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "greeting",
                    },
                    "previewText": "",
                },
            },
        ],
        "edges": [
            {
                "id": "edge_1",
                "source": "input_1",
                "target": "agent_1",
                "sourceHandle": "output:name",
                "targetHandle": "input:name",
            },
            {
                "id": "edge_2",
                "source": "agent_1",
                "target": "output_1",
                "sourceHandle": "output:greeting",
                "targetHandle": "input:value",
            },
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
        "default_node_system_graph": _create_default_node_system_graph(theme_preset),
    }
