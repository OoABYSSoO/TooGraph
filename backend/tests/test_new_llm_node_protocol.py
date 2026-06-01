from unittest.mock import patch

from app.core.compiler.validator import validate_graph
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.runtime.node_handlers import execute_agent_node
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.schemas.tools import ToolDefinition, ToolIoField, ToolRuntimeSpec


def _new_llm_graph() -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_new_llm",
            "name": "New LLM Smoke",
            "state_schema": {
                "question": {
                    "name": "Question",
                    "description": "",
                    "type": "text",
                    "value": "",
                    "color": "#d97706",
                },
                "answer": {
                    "name": "Answer",
                    "description": "",
                    "type": "markdown",
                    "value": "",
                    "color": "#2563eb",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "content",
                        "managed": True,
                    },
                },
                "tool_calls": {
                    "name": "tool_calls",
                    "description": "",
                    "type": "json",
                    "value": [],
                    "color": "#0f766e",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "tool_calls",
                        "managed": True,
                    },
                },
            },
            "nodes": {
                "input_question": {
                    "kind": "input",
                    "name": "Question Input",
                    "description": "",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [],
                    "writes": [{"state": "question", "mode": "replace"}],
                    "config": {"value": "hello"},
                },
                "new_llm": {
                    "kind": "new_llm",
                    "name": "New LLM Node",
                    "description": "Experimental one-turn LLM node.",
                    "ui": {"position": {"x": 260, "y": 0}},
                    "reads": [{"state": "question", "required": True}],
                    "writes": [
                        {"state": "answer", "mode": "replace"},
                        {"state": "tool_calls", "mode": "replace"},
                    ],
                    "config": {
                        "toolKeys": [],
                        "outputChannels": {
                            "reasoningContent": False,
                            "finishReason": False,
                        },
                        "taskInstruction": "Answer the question.",
                        "modelSource": "global",
                        "model": "",
                        "thinkingMode": "high",
                        "temperature": 0.2,
                    },
                },
                "output_answer": {
                    "kind": "output",
                    "name": "Answer Output",
                    "description": "",
                    "ui": {"position": {"x": 560, "y": 0}},
                    "reads": [{"state": "answer", "required": True}],
                    "writes": [],
                    "config": {
                        "displayMode": "markdown",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                },
            },
            "edges": [
                {"source": "input_question", "target": "new_llm"},
                {"source": "new_llm", "target": "output_answer"},
            ],
            "conditional_edges": [],
            "metadata": {},
        }
    )


def test_new_llm_node_uses_new_llm_config_and_validates_output_protocol():
    graph = _new_llm_graph()

    node = graph.nodes["new_llm"]
    assert node.kind == "new_llm"
    assert node.config.thinking_mode.value == "high"
    assert validate_graph(graph).valid is True


def test_new_llm_node_executes_through_current_llm_runtime_path():
    graph = _new_llm_graph()

    with patch("app.core.runtime.node_system_executor.chat_with_model_ref_with_meta") as chat, patch(
        "app.core.runtime.node_system_executor._chat_with_local_model_with_meta"
    ) as local_chat, patch("app.core.langgraph.runtime.save_run"):
        chat.return_value = ('{"answer":"Hello from the new LLM node."}', {"warnings": [], "model": "test"})
        local_chat.return_value = ('{"answer":"Hello from the new LLM node."}', {"warnings": [], "model": "test"})
        result = execute_node_system_graph_langgraph(
            graph,
            {"run_id": "run_new_llm", "status": "running"},
            persist_progress=False,
        )

    assert result["state_values"]["answer"] == "Hello from the new LLM node."
    execution = next(entry for entry in result["node_executions"] if entry["node_id"] == "new_llm")
    assert execution["node_type"] == "new_llm"
    assert execution["artifacts"]["context_assembly_report"]["node_type"] == "new_llm"


def test_new_llm_node_maps_provider_channels_and_selected_tool_schemas():
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_new_llm_channels",
            "name": "New LLM Channels",
            "state_schema": {
                "content": {
                    "name": "content",
                    "description": "Final assistant content.",
                    "type": "markdown",
                    "value": "",
                    "color": "#2563eb",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "content",
                        "managed": True,
                    },
                },
                "tool_calls": {
                    "name": "tool_calls",
                    "description": "Tool calls requested by the model.",
                    "type": "json",
                    "value": [],
                    "color": "#0f766e",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "tool_calls",
                        "managed": True,
                    },
                },
                "reasoning_content": {
                    "name": "reasoning_content",
                    "description": "Provider reasoning content.",
                    "type": "markdown",
                    "value": "",
                    "color": "#7c3aed",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "reasoning_content",
                        "managed": True,
                    },
                },
                "finish_reason": {
                    "name": "finish_reason",
                    "description": "Provider finish reason.",
                    "type": "text",
                    "value": "",
                    "color": "#f97316",
                    "binding": {
                        "kind": "llm_output",
                        "nodeId": "new_llm",
                        "fieldKey": "finish_reason",
                        "managed": True,
                    },
                },
            },
            "nodes": {
                "new_llm": {
                    "kind": "new_llm",
                    "name": "New LLM Node",
                    "description": "",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [],
                    "writes": [
                        {"state": "content", "mode": "replace"},
                        {"state": "tool_calls", "mode": "replace"},
                        {"state": "reasoning_content", "mode": "replace"},
                        {"state": "finish_reason", "mode": "replace"},
                    ],
                    "config": {
                        "toolKeys": ["json_passthrough"],
                        "outputChannels": {
                            "reasoningContent": True,
                            "finishReason": True,
                        },
                        "taskInstruction": "Answer or call tools.",
                        "modelSource": "global",
                        "model": "",
                        "thinkingMode": "high",
                        "temperature": 0.2,
                    },
                }
            },
            "edges": [],
            "conditional_edges": [],
            "metadata": {},
        }
    )
    node = graph.nodes["new_llm"]
    captured_tools = []

    def generate_response(*_args, **kwargs):
        captured_tools.extend(kwargs.get("tools") or [])
        return (
            {
                "content": "I need the JSON passthrough tool.",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "name": "json_passthrough",
                        "arguments": {"value": {"ok": True}},
                    }
                ],
                "reasoning_content": "Need structured echo.",
                "finish_reason": "tool_calls",
            },
            "Need structured echo.",
            [],
            {"resolved_model_ref": "local/test", "runtime_model_name": "test"},
        )

    result = execute_agent_node(
        graph.state_schema,
        node,
        {},
        {"metadata": {}, "state": {}, "state_schema": graph.state_schema, "nodes": graph.nodes, "graph": graph},
        node_name="new_llm",
        state={"metadata": {}, "state_values": {}},
        get_action_registry_func=lambda *, include_disabled: {},
        get_tool_definition_registry_func=lambda *, include_disabled: {
            "json_passthrough": ToolDefinition(
                toolKey="json_passthrough",
                name="JSON Passthrough",
                description="Return the JSON input.",
                schemaVersion="toograph.tool/v1",
                version="1",
                permissions=[],
                runtime=ToolRuntimeSpec(type="python", entrypoint="run.py"),
                inputSchema=[ToolIoField(key="value", name="Value", valueType="json", description="Value to echo.")],
                outputSchema=[],
            )
        },
        resolve_agent_runtime_config_func=lambda _node: {"resolved_model_ref": "local/test", "runtime_model_name": "test"},
        generate_agent_response_func=generate_response,
    )

    assert captured_tools[0]["function"]["name"] == "json_passthrough"
    assert captured_tools[0]["function"]["parameters"]["properties"]["value"]["type"] == "object"
    assert result["outputs"] == {
        "content": "I need the JSON passthrough tool.",
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "name": "json_passthrough",
                "arguments": {"value": {"ok": True}},
            }
        ],
        "reasoning_content": "Need structured echo.",
        "finish_reason": "tool_calls",
    }
    assert result["selected_tools"] == ["json_passthrough"]
    assert result["reasoning"] == "Need structured echo."
