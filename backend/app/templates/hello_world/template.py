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
            # ── Column 1: Inputs ──
            {
                "id": "input_1",
                "type": "default",
                "position": {"x": 80, "y": 120},
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
                "id": "input_kb",
                "type": "default",
                "position": {"x": 80, "y": 420},
                "data": {
                    "nodeId": "input_kb",
                    "config": {
                        "presetId": "preset.input.knowledge_base.v1",
                        "label": "Knowledge Base",
                        "description": "Select a knowledge base to provide to downstream agents.",
                        "family": "input",
                        "valueType": "knowledge_base",
                        "output": {
                            "key": "knowledge_base",
                            "label": "Knowledge Base",
                            "valueType": "knowledge_base",
                        },
                        "defaultValue": "GraphiteUI-official",
                        "placeholder": "Knowledge base name",
                    },
                    "previewText": "",
                },
            },
            # ── Column 2: Agents ──
            {
                "id": "agent_1",
                "type": "default",
                "position": {"x": 560, "y": 80},
                "data": {
                    "nodeId": "agent_1",
                    "config": {
                        "presetId": "preset.agent.onboarding_helper.v1",
                        "label": "Onboarding Helper",
                        "description": "",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "question",
                                "label": "Question",
                                "valueType": "text",
                                "required": True,
                            },
                            {
                                "key": "knowledge_base",
                                "label": "Knowledge Base",
                                "valueType": "knowledge_base",
                                "required": True,
                            },
                        ],
                        "outputs": [
                            {
                                "key": "answer",
                                "label": "Answer",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "",
                        "taskInstruction": "",
                        "skills": [],
                        "outputBinding": {},
                    },
                    "previewText": "",
                },
            },
            {
                "id": "agent_2",
                "type": "default",
                "position": {"x": 560, "y": 420},
                "data": {
                    "nodeId": "agent_2",
                    "config": {
                        "presetId": "preset.agent.markdown_formatter.v1",
                        "label": "Markdown Formatter",
                        "description": "使用markdown格式输出",
                        "family": "agent",
                        "inputs": [
                            {
                                "key": "text_input",
                                "label": "Text Input",
                                "valueType": "text",
                                "required": True,
                            },
                        ],
                        "outputs": [
                            {
                                "key": "formatted",
                                "label": "Formatted",
                                "valueType": "text",
                            }
                        ],
                        "systemInstruction": "",
                        "taskInstruction": "使用markdown格式输出",
                        "skills": [],
                        "outputBinding": {},
                    },
                    "previewText": "",
                },
            },
            # ── Column 3: Outputs ──
            {
                "id": "output_1",
                "type": "default",
                "position": {"x": 1040, "y": 80},
                "data": {
                    "nodeId": "output_1",
                    "config": {
                        "presetId": "preset.output.raw_answer.v1",
                        "label": "Raw Answer",
                        "description": "Preview the raw onboarding answer.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Answer",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                    "previewText": "",
                },
            },
            {
                "id": "output_2",
                "type": "default",
                "position": {"x": 1040, "y": 420},
                "data": {
                    "nodeId": "output_2",
                    "config": {
                        "presetId": "preset.output.formatted_answer.v1",
                        "label": "Formatted Answer",
                        "description": "Preview the markdown-formatted answer.",
                        "family": "output",
                        "input": {
                            "key": "value",
                            "label": "Formatted",
                            "valueType": "text",
                            "required": True,
                        },
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                    "previewText": "",
                },
            },
        ],
        "edges": [
            # Input → Agents
            {
                "id": "edge_q_agent1",
                "source": "input_1",
                "target": "agent_1",
                "sourceHandle": "output:question",
                "targetHandle": "input:question",
            },
            {
                "id": "edge_kb_agent1",
                "source": "input_kb",
                "target": "agent_1",
                "sourceHandle": "output:knowledge_base",
                "targetHandle": "input:knowledge_base",
            },
            {
                "id": "edge_agent1_agent2",
                "source": "agent_1",
                "target": "agent_2",
                "sourceHandle": "output:answer",
                "targetHandle": "input:text_input",
            },
            # Agents → Outputs
            {
                "id": "edge_agent1_out1",
                "source": "agent_1",
                "target": "output_1",
                "sourceHandle": "output:answer",
                "targetHandle": "input:value",
            },
            {
                "id": "edge_agent2_out2",
                "source": "agent_2",
                "target": "output_2",
                "sourceHandle": "output:formatted",
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
