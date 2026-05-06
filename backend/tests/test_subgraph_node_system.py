from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.schemas.node_system import NodeSystemGraphDocument


def _inner_passthrough_graph() -> dict:
    return {
        "state_schema": {
            "internal_question": {
                "name": "Internal Question",
                "description": "",
                "type": "text",
                "value": "should not leak",
                "color": "#d97706",
            }
        },
        "nodes": {
            "inner_input": {
                "kind": "input",
                "name": "Inner Input",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "internal_question", "mode": "replace"}],
                "config": {"value": "should not leak"},
            },
            "inner_output": {
                "kind": "output",
                "name": "Inner Output",
                "description": "",
                "ui": {"position": {"x": 240, "y": 0}},
                "reads": [{"state": "internal_question", "required": True}],
                "writes": [],
                "config": {
                    "displayMode": "auto",
                    "persistEnabled": False,
                    "persistFormat": "auto",
                    "fileNameTemplate": "",
                },
            },
        },
        "edges": [{"source": "inner_input", "target": "inner_output"}],
        "conditional_edges": [],
        "metadata": {},
    }


def _parent_graph_payload(*, subgraph_reads: list[dict], subgraph_writes: list[dict]) -> dict:
    return {
        "graph_id": "graph_subgraph_runtime",
        "name": "Subgraph Runtime",
        "state_schema": {
            "question": {
                "name": "Question",
                "description": "",
                "type": "text",
                "value": "来自父图的明确输入",
                "color": "#d97706",
            },
            "answer": {
                "name": "Answer",
                "description": "",
                "type": "text",
                "value": "",
                "color": "#2563eb",
            },
        },
        "nodes": {
            "parent_input": {
                "kind": "input",
                "name": "Parent Input",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "question", "mode": "replace"}],
                "config": {"value": "来自父图的明确输入"},
            },
            "nested_research": {
                "kind": "subgraph",
                "name": "Nested Research",
                "description": "Runs an embedded graph instance.",
                "ui": {"position": {"x": 260, "y": 0}},
                "reads": subgraph_reads,
                "writes": subgraph_writes,
                "config": {
                    "graph": _inner_passthrough_graph(),
                },
            },
            "parent_output": {
                "kind": "output",
                "name": "Parent Output",
                "description": "",
                "ui": {"position": {"x": 520, "y": 0}},
                "reads": [{"state": "answer", "required": True}],
                "writes": [],
                "config": {
                    "displayMode": "auto",
                    "persistEnabled": False,
                    "persistFormat": "auto",
                    "fileNameTemplate": "",
                },
            },
        },
        "edges": [
            {"source": "parent_input", "target": "nested_research"},
            {"source": "nested_research", "target": "parent_output"},
        ],
        "conditional_edges": [],
        "metadata": {},
    }


def test_subgraph_node_schema_accepts_embedded_graph_instances() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        _parent_graph_payload(
            subgraph_reads=[{"state": "question", "required": True}],
            subgraph_writes=[{"state": "answer", "mode": "replace"}],
        )
    )

    node = graph.nodes["nested_research"]

    assert node.kind == "subgraph"
    assert node.config.graph.nodes["inner_input"].kind == "input"
    assert node.config.graph.nodes["inner_output"].kind == "output"


def test_subgraph_validation_fails_before_run_when_required_input_is_unbound() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        _parent_graph_payload(
            subgraph_reads=[],
            subgraph_writes=[{"state": "answer", "mode": "replace"}],
        )
    )

    validation = validate_graph(graph)

    assert not validation.valid
    assert [issue.code for issue in validation.issues] == ["subgraph_input_binding_missing"]


def test_langgraph_runtime_executes_subgraph_with_isolated_input_state() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        _parent_graph_payload(
            subgraph_reads=[{"state": "question", "required": True}],
            subgraph_writes=[{"state": "answer", "mode": "replace"}],
        )
    )

    result = execute_node_system_graph_langgraph(graph)

    assert result["status"] == "completed"
    assert result["state_values"]["answer"] == "来自父图的明确输入"
    subgraph_execution = next(item for item in result["node_executions"] if item["node_id"] == "nested_research")
    assert subgraph_execution["artifacts"]["subgraph"]["output_values"] == {"internal_question": "来自父图的明确输入"}
