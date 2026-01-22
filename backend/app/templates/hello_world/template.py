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
                        "presetId": "preset.input.question.v1",
                        "label": "Question Input",
                        "description": "Ask an onboarding question about GraphiteUI.",
                        "family": "input",
                        "valueType": "text",
                        "output": {
                            "key": "question",
                            "label": "Question",
                            "valueType": "text",
                        },
                        "defaultValue": "什么是 GraphiteUI？你能做些什么？我该如何开始使用？",
                        "placeholder": "Ask about GraphiteUI",
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
                        "presetId": "preset.agent.onboarding_helper.v1",
                        "label": "GraphiteUI Onboarding Helper",
                        "description": "Search the official GraphiteUI knowledge base and answer onboarding questions.",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "question",
                                "label": "Question",
                                "valueType": "text",
                                "required": True,
                            }
                        ],
                        "outputs": [
                            {
                                "key": "answer",
                                "label": "Onboarding Answer",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "You are the official GraphiteUI onboarding assistant. Answer only with information grounded in the provided skill context. If the knowledge is insufficient, say so directly.",
                        "taskInstruction": "Use the retrieved official knowledge to answer the user's question. Explain what GraphiteUI is, what it can do, and how to get started when relevant. Keep the answer practical, concise, and in the same language as the question.",
                        "skills": [
                            {
                                "name": "official_docs",
                                "skillKey": "search_knowledge_base",
                                "inputMapping": {
                                    "query": "$inputs.question",
                                    "knowledge_base": "GraphiteUI-official",
                                },
                                "contextBinding": {},
                                "usage": "required",
                            }
                        ],
                        "outputBinding": {
                            "answer": "$response.answer",
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
                        "presetId": "preset.output.onboarding_answer.v1",
                        "label": "Onboarding Answer",
                        "description": "Preview and optionally persist the grounded onboarding answer.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Onboarding Answer",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "txt",
                        "fileNameTemplate": "graphiteui_onboarding_answer",
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
                "sourceHandle": "output:question",
                "targetHandle": "input:question",
            },
            {
                "id": "edge_2",
                "source": "agent_1",
                "target": "output_1",
                "sourceHandle": "output:answer",
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
        "description": "Ask GraphiteUI onboarding questions, retrieve grounded knowledge, and generate a concise guided answer.",
        "default_graph_name": "Hello World",
        "default_theme_preset": theme_preset["id"],
        "supported_node_types": NODE_SYSTEM_SUPPORTED_NODE_TYPES,
        "state_keys": get_hello_world_state_keys(),
        "state_schema": get_hello_world_state_schema(),
        "theme_presets": [theme_preset],
        "default_node_system_graph": _create_default_node_system_graph(theme_preset),
    }
