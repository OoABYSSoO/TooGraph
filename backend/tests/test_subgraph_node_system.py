from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.runtime.state import create_initial_run_state
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


def _dynamic_passthrough_template() -> dict:
    return {
        "template_id": "simple_dynamic_subgraph",
        "label": "Simple Dynamic Subgraph",
        "description": "Returns the public input as the final reply.",
        "default_graph_name": "Simple Dynamic Subgraph",
        "state_schema": {
            "final_reply": {
                "name": "Final Reply",
                "description": "The final subgraph output.",
                "type": "markdown",
                "value": "",
                "color": "#2563eb",
            }
        },
        "nodes": {
            "inner_input": {
                "kind": "input",
                "name": "Inner Input",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "final_reply", "mode": "replace"}],
                "config": {"value": ""},
            },
            "inner_output": {
                "kind": "output",
                "name": "Inner Output",
                "description": "",
                "ui": {"position": {"x": 240, "y": 0}},
                "reads": [{"state": "final_reply", "required": True}],
                "writes": [],
                "config": {
                    "displayMode": "markdown",
                    "persistEnabled": False,
                    "persistFormat": "md",
                    "fileNameTemplate": "",
                },
            },
        },
        "edges": [{"source": "inner_input", "target": "inner_output"}],
        "conditional_edges": [],
        "metadata": {},
        "source": "official",
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


def test_langgraph_runtime_records_subgraph_internal_status_map() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        _parent_graph_payload(
            subgraph_reads=[{"state": "question", "required": True}],
            subgraph_writes=[{"state": "answer", "mode": "replace"}],
        )
    )

    result = execute_node_system_graph_langgraph(graph)

    assert result["subgraph_status_map"]["nested_research"] == {
        "inner_input": "success",
        "inner_output": "success",
    }
    subgraph_execution = next(item for item in result["node_executions"] if item["node_id"] == "nested_research")
    assert subgraph_execution["artifacts"]["subgraph"]["node_status_map"] == {
        "inner_input": "success",
        "inner_output": "success",
    }


def test_langgraph_runtime_publishes_subgraph_event_context(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module

    events: list[tuple[str, str, dict]] = []

    def capture_run_event(run_id: str | None, event_type: str, payload: dict | None = None) -> None:
        events.append((str(run_id or ""), event_type, dict(payload or {})))

    monkeypatch.setattr(runtime_module, "publish_run_event", capture_run_event)
    graph = NodeSystemGraphDocument.model_validate(
        _parent_graph_payload(
            subgraph_reads=[{"state": "question", "required": True}],
            subgraph_writes=[{"state": "answer", "mode": "replace"}],
        )
    )
    initial_state = create_initial_run_state(graph.graph_id, graph.name)

    execute_node_system_graph_langgraph(graph, initial_state)

    inner_status_events = [
        payload
        for _run_id, event_type, payload in events
        if event_type in {"node.started", "node.completed", "node.failed"} and payload.get("subgraph_node_id") == "nested_research"
    ]
    assert inner_status_events
    assert inner_status_events[0]["subgraph_path"] == ["nested_research"]


def test_langgraph_runtime_runs_dynamic_subgraph_capability_and_packages_outputs(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module
    import app.core.runtime.node_system_executor as executor_module

    template = _dynamic_passthrough_template()
    monkeypatch.setattr(runtime_module, "load_template_record", lambda template_key: template)
    monkeypatch.setattr(executor_module, "load_template_record", lambda template_key: template)
    monkeypatch.setattr(
        executor_module,
        "_generate_agent_subgraph_inputs",
        lambda **kwargs: (
            {"simple_dynamic_subgraph": {"final_reply": "子图最终回复"}},
            "planned subgraph inputs",
            [],
            kwargs["runtime_config"],
        ),
    )

    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_dynamic_subgraph_runtime",
            "name": "Dynamic Subgraph Runtime",
            "state_schema": {
                "selected_capability": {"type": "capability", "value": {"kind": "subgraph", "key": "simple_dynamic_subgraph"}},
                "requirement": {"type": "text", "value": "运行这个子图"},
                "dynamic_result": {"type": "result_package"},
            },
            "nodes": {
                "capability_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "selected_capability"}],
                    "config": {"value": {"kind": "subgraph", "key": "simple_dynamic_subgraph"}},
                },
                "requirement_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 180}},
                    "writes": [{"state": "requirement"}],
                    "config": {"value": "运行这个子图"},
                },
                "run_selected_subgraph": {
                    "kind": "agent",
                    "ui": {"position": {"x": 320, "y": 80}},
                    "reads": [{"state": "selected_capability"}, {"state": "requirement"}],
                    "writes": [{"state": "dynamic_result"}],
                    "config": {"skillKey": ""},
                },
                "result_output": {
                    "kind": "output",
                    "ui": {"position": {"x": 640, "y": 80}},
                    "reads": [{"state": "dynamic_result"}],
                },
            },
            "edges": [
                {"source": "capability_input", "target": "run_selected_subgraph"},
                {"source": "requirement_input", "target": "run_selected_subgraph"},
                {"source": "run_selected_subgraph", "target": "result_output"},
            ],
            "conditional_edges": [],
        }
    )

    result = execute_node_system_graph_langgraph(graph)

    assert result["status"] == "completed"
    package = result["state_values"]["dynamic_result"]
    assert package["kind"] == "result_package"
    assert package["sourceType"] == "subgraph"
    assert package["sourceKey"] == "simple_dynamic_subgraph"
    assert package["inputs"] == {"final_reply": "子图最终回复"}
    assert package["outputs"]["final_reply"] == {
        "name": "Final Reply",
        "description": "The final subgraph output.",
        "type": "markdown",
        "value": "子图最终回复",
    }
    execution = next(item for item in result["node_executions"] if item["node_id"] == "run_selected_subgraph")
    assert execution["artifacts"]["capability_outputs"][0]["inputs"] == {"final_reply": "子图最终回复"}
