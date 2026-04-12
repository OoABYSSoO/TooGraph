from __future__ import annotations

from typing import Any

from app.templates.hello_world.state import get_hello_world_state_keys, get_hello_world_state_schema


NODE_SYSTEM_SUPPORTED_NODE_TYPES = [
    "input_boundary",
    "agent_node",
    "condition_node",
    "output_boundary",
]


def _create_default_node_system_graph() -> dict[str, Any]:
    return {
        "graph_family": "node_system",
        "name": "Hello World",
        "template_id": "hello_world",
        "state_schema": get_hello_world_state_schema(),
        "nodes": [
            # ── Column 1: Inputs ──
            {
                "id": "input_1",
                "type": "default",
                "position": {"x": 80, "y": 160},
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
                "position": {"x": 80, "y": 540},
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
            # ── Column 2: Agents (parallel) ──
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
                "position": {"x": 560, "y": 480},
                "data": {
                    "nodeId": "agent_2",
                    "config": {
                        "presetId": "preset.agent.markdown_formatter.v1",
                        "label": "Markdown Formatter",
                        "description": "使用markdown格式输出",
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
                "position": {"x": 1040, "y": 480},
                "data": {
                    "nodeId": "output_2",
                    "config": {
                        "presetId": "preset.output.formatted_answer.v1",
                        "label": "Formatted Answer",
                        "description": "Preview the markdown-formatted answer.",
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
        ],
        "edges": [
            # Input → Agent 1
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
            # Input → Agent 2 (parallel)
            {
                "id": "edge_q_agent2",
                "source": "input_1",
                "target": "agent_2",
                "sourceHandle": "output:question",
                "targetHandle": "input:question",
            },
            {
                "id": "edge_kb_agent2",
                "source": "input_kb",
                "target": "agent_2",
                "sourceHandle": "output:knowledge_base",
                "targetHandle": "input:knowledge_base",
            },
            # Agent → Output
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
                "sourceHandle": "output:answer",
                "targetHandle": "input:value",
            },
        ],
        "metadata": {},
    }


def get_hello_world_template() -> dict[str, Any]:
    return {
        "template_id": "hello_world",
        "label": "Hello World",
        "description": "Ask GraphiteUI onboarding questions, retrieve grounded knowledge, and generate a concise guided answer.",
        "default_graph_name": "Hello World",
        "supported_node_types": NODE_SYSTEM_SUPPORTED_NODE_TYPES,
        "state_keys": get_hello_world_state_keys(),
        "state_schema": get_hello_world_state_schema(),
        "default_node_system_graph": _create_default_node_system_graph(),
    }
