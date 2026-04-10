from __future__ import annotations

from typing import Any

from app.templates.hello_world.state import get_hello_world_state_keys, get_hello_world_state_schema


NODE_SYSTEM_SUPPORTED_NODE_TYPES = [
    "input_boundary",
    "agent_node",
    "condition_node",
    "output_boundary",
]


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
                        "description": "Provide the name used to personalize the greeting.",
                        "family": "input",
                        "valueType": "text",
                        "output": {
                            "key": "name",
                            "label": "Name",
                            "valueType": "text",
                        },
                        "defaultValue": "Abyss",
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
                        "label": "Greeting With Guide",
                        "description": "Let the agent greet the user, then append the local usage guide.",
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
                                "label": "Greeting With Guide",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "You are a friendly GraphiteUI onboarding assistant.",
                        "taskInstruction": "Write one short Chinese greeting for the provided name only. Do not include usage instructions.",
                        "skills": [
                            {
                                "name": "append_usage_introduction",
                                "skillKey": "append_usage_introduction",
                                "inputMapping": {
                                    "greeting": "$response.greeting",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "responseMode": "json",
                        "outputBinding": {
                            "greeting": "$skills.append_usage_introduction.greeting",
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
                        "label": "Greeting With Guide Output",
                        "description": "Preview and optionally persist the greeting followed by the local usage guide.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Greeting With Guide",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "usage-introduction",
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
        "description": "Send a name to the local language model, greet the user, and append the local usage guide.",
        "default_graph_name": "Hello World",
        "default_theme_preset": theme_preset["id"],
        "supported_node_types": NODE_SYSTEM_SUPPORTED_NODE_TYPES,
        "state_keys": get_hello_world_state_keys(),
        "state_schema": get_hello_world_state_schema(),
        "theme_presets": [theme_preset],
        "default_node_system_graph": _create_default_node_system_graph(theme_preset),
    }
