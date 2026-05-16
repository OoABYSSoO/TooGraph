from __future__ import annotations

import ast
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.codegen import generate_langgraph_python_source, import_graph_payload_from_python_source
from app.core.schemas.node_system import NodeSystemGraphPayload


def _literal_assignments(source: str) -> dict[str, Any]:
    assignments: dict[str, Any] = {}
    for statement in ast.parse(source).body:
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if isinstance(target, ast.Name) and target.id in {"GRAPH_PAYLOAD", "TOOGRAPH_EDITOR_GRAPH"}:
            assignments[target.id] = ast.literal_eval(statement.value)
    return assignments


def _subgraph_export_graph() -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(
        {
            "name": "Parent Graph",
            "state_schema": {
                "question": {"name": "Question", "type": "text", "value": "Hello"},
                "answer": {"name": "Answer", "type": "text", "value": ""},
            },
            "nodes": {
                "input_question": {
                    "kind": "input",
                    "name": "Question Input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "question"}],
                    "config": {"value": "Hello"},
                },
                "nested_research": {
                    "kind": "subgraph",
                    "name": "Nested Research",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "question", "required": True}],
                    "writes": [{"state": "answer", "mode": "replace"}],
                    "config": {
                        "graph": {
                            "state_schema": {
                                "internal_question": {
                                    "name": "Internal Question",
                                    "type": "text",
                                    "value": "",
                                }
                            },
                            "nodes": {
                                "inner_input": {
                                    "kind": "input",
                                    "name": "Inner Input",
                                    "ui": {"position": {"x": 0, "y": 0}},
                                    "writes": [{"state": "internal_question"}],
                                    "config": {"value": ""},
                                },
                                "inner_output": {
                                    "kind": "output",
                                    "name": "Inner Output",
                                    "ui": {"position": {"x": 240, "y": 0}},
                                    "reads": [{"state": "internal_question", "required": True}],
                                },
                            },
                            "edges": [{"source": "inner_input", "target": "inner_output"}],
                            "conditional_edges": [],
                            "metadata": {"interrupt_after": ["inner_output"]},
                        }
                    },
                },
                "output_answer": {
                    "kind": "output",
                    "name": "Answer Output",
                    "ui": {"position": {"x": 480, "y": 0}},
                    "reads": [{"state": "answer"}],
                },
            },
            "edges": [
                {"source": "input_question", "target": "nested_research"},
                {"source": "nested_research", "target": "output_answer"},
            ],
            "conditional_edges": [],
            "metadata": {},
        }
    )


def test_langgraph_python_export_runtime_payload_preserves_embedded_subgraph_graph() -> None:
    source = generate_langgraph_python_source(_subgraph_export_graph())
    assignments = _literal_assignments(source)

    runtime_subgraph = assignments["GRAPH_PAYLOAD"]["nodes"]["nested_research"]
    editor_subgraph = assignments["TOOGRAPH_EDITOR_GRAPH"]["nodes"]["nested_research"]

    assert runtime_subgraph["kind"] == "subgraph"
    assert runtime_subgraph["config"]["graph"]["metadata"] == {"interrupt_after": ["inner_output"]}
    assert runtime_subgraph["config"]["graph"]["nodes"]["inner_input"]["kind"] == "input"
    assert runtime_subgraph["config"]["graph"]["nodes"]["inner_output"]["kind"] == "output"
    assert editor_subgraph["config"]["graph"]["nodes"]["inner_input"]["kind"] == "input"


def test_imported_python_export_preserves_embedded_subgraph_graph() -> None:
    source = generate_langgraph_python_source(_subgraph_export_graph())

    imported = import_graph_payload_from_python_source(source)

    nested = imported.nodes["nested_research"]
    assert nested.kind == "subgraph"
    assert nested.config.graph.nodes["inner_input"].kind == "input"


def test_langgraph_python_export_has_no_toograph_runtime_imports() -> None:
    source = generate_langgraph_python_source(_subgraph_export_graph())

    assert "from app.core" not in source
    assert "import app.core" not in source
    assert "NodeSystemGraphPayload" not in source
    assert "_execute_node" not in source


def test_standalone_python_export_executes_static_subgraph_without_toograph_runtime() -> None:
    source = generate_langgraph_python_source(_subgraph_export_graph())
    namespace: dict[str, Any] = {}

    exec(compile(source, "<standalone_export>", "exec"), namespace)
    result = namespace["invoke_graph"]({"question": "Standalone works"})

    assert result["question"] == "Standalone works"
    assert result["answer"] == "Standalone works"


def test_standalone_python_export_executes_agent_inside_static_subgraph(monkeypatch: Any) -> None:
    graph = NodeSystemGraphPayload.model_validate(
        {
            "name": "Parent Graph",
            "state_schema": {
                "question": {"type": "text", "value": "Hello"},
                "answer": {"type": "text", "value": ""},
            },
            "nodes": {
                "input_question": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "question"}],
                    "config": {"value": "Hello"},
                },
                "nested_agent": {
                    "kind": "subgraph",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "question"}],
                    "writes": [{"state": "answer"}],
                    "config": {
                        "graph": {
                            "state_schema": {
                                "inner_question": {"type": "text", "value": ""},
                                "inner_answer": {"type": "text", "value": ""},
                            },
                            "nodes": {
                                "inner_input": {
                                    "kind": "input",
                                    "ui": {"position": {"x": 0, "y": 0}},
                                    "writes": [{"state": "inner_question"}],
                                    "config": {"value": ""},
                                },
                                "inner_agent": {
                                    "kind": "agent",
                                    "ui": {"position": {"x": 240, "y": 0}},
                                    "reads": [{"state": "inner_question"}],
                                    "writes": [{"state": "inner_answer"}],
                                    "config": {"taskInstruction": "Answer the question."},
                                },
                                "inner_output": {
                                    "kind": "output",
                                    "ui": {"position": {"x": 480, "y": 0}},
                                    "reads": [{"state": "inner_answer"}],
                                },
                            },
                            "edges": [
                                {"source": "inner_input", "target": "inner_agent"},
                                {"source": "inner_agent", "target": "inner_output"},
                            ],
                        }
                    },
                },
                "output_answer": {
                    "kind": "output",
                    "ui": {"position": {"x": 480, "y": 0}},
                    "reads": [{"state": "answer"}],
                },
            },
            "edges": [
                {"source": "input_question", "target": "nested_agent"},
                {"source": "nested_agent", "target": "output_answer"},
            ],
        }
    )
    source = generate_langgraph_python_source(graph)
    namespace: dict[str, Any] = {}
    monkeypatch.setenv("TOOGRAPH_EXPORT_MOCK_LLM_RESPONSE", '{"inner_answer": "mocked answer"}')

    exec(compile(source, "<standalone_export>", "exec"), namespace)
    result = namespace["invoke_graph"]({"question": "What changed?"})

    assert result["answer"] == "mocked answer"


def test_standalone_python_export_routes_start_condition_to_static_subgraph() -> None:
    graph = NodeSystemGraphPayload.model_validate(
        {
            "name": "Condition Graph",
            "state_schema": {
                "flag": {"type": "boolean", "value": True},
                "result": {"type": "boolean", "value": False},
            },
            "nodes": {
                "input_flag": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "flag"}],
                    "config": {"value": True, "boundaryType": "boolean"},
                },
                "check_flag": {
                    "kind": "condition",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "flag"}],
                    "config": {
                        "rule": {"source": "flag", "operator": "==", "value": True},
                        "branches": ["true", "false", "exhausted"],
                        "branchMapping": {"true": "true", "false": "false"},
                    },
                },
                "true_subgraph": {
                    "kind": "subgraph",
                    "ui": {"position": {"x": 480, "y": -100}},
                    "reads": [{"state": "flag"}],
                    "writes": [{"state": "result"}],
                    "config": {
                        "graph": {
                            "state_schema": {"inner_result": {"type": "boolean", "value": True}},
                            "nodes": {
                                "inner_input": {
                                    "kind": "input",
                                    "ui": {"position": {"x": 0, "y": 0}},
                                    "writes": [{"state": "inner_result"}],
                                    "config": {"value": True, "boundaryType": "boolean"},
                                },
                                "inner_output": {
                                    "kind": "output",
                                    "ui": {"position": {"x": 240, "y": 0}},
                                    "reads": [{"state": "inner_result"}],
                                },
                            },
                            "edges": [{"source": "inner_input", "target": "inner_output"}],
                        }
                    },
                },
                "false_subgraph": {
                    "kind": "subgraph",
                    "ui": {"position": {"x": 480, "y": 100}},
                    "reads": [{"state": "flag"}],
                    "writes": [{"state": "result"}],
                    "config": {
                        "graph": {
                            "state_schema": {"inner_result": {"type": "boolean", "value": False}},
                            "nodes": {
                                "inner_input": {
                                    "kind": "input",
                                    "ui": {"position": {"x": 0, "y": 0}},
                                    "writes": [{"state": "inner_result"}],
                                    "config": {"value": False, "boundaryType": "boolean"},
                                },
                                "inner_output": {
                                    "kind": "output",
                                    "ui": {"position": {"x": 240, "y": 0}},
                                    "reads": [{"state": "inner_result"}],
                                },
                            },
                            "edges": [{"source": "inner_input", "target": "inner_output"}],
                        }
                    },
                },
            },
            "edges": [{"source": "input_flag", "target": "check_flag"}],
            "conditional_edges": [
                {
                    "source": "check_flag",
                    "branches": {
                        "true": "true_subgraph",
                        "false": "false_subgraph",
                        "exhausted": "false_subgraph",
                    },
                }
            ],
        }
    )
    source = generate_langgraph_python_source(graph)
    namespace: dict[str, Any] = {}

    exec(compile(source, "<standalone_export>", "exec"), namespace)
    true_result = namespace["invoke_graph"]({"flag": True})
    false_result = namespace["invoke_graph"]({"flag": False})

    assert true_result["result"] is True
    assert false_result["result"] is False
