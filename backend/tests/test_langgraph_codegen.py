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
