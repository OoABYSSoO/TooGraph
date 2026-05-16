from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.core.compiler.validator import validate_graph
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.runtime.node_handlers import execute_batch_node
from app.core.schemas.node_system import (
    NodeSystemBatchNode,
    NodeSystemGraphDocument,
    NodeSystemStateDefinition,
)


def _batch_node() -> NodeSystemBatchNode:
    return NodeSystemBatchNode.model_validate(
        {
            "kind": "batch",
            "name": "Analyze Segments",
            "description": "Analyze each segment with shared question context.",
            "ui": {"position": {"x": 0, "y": 0}},
            "reads": [
                {"state": "segments", "required": True},
                {"state": "question", "required": True},
            ],
            "writes": [{"state": "reports", "mode": "replace"}],
            "config": {
                "workerSource": "default_llm",
                "inputModes": {
                    "segments": "batch",
                    "question": "shared",
                },
                "maxConcurrency": 2,
                "continueOnError": False,
                "defaultWorker": {
                    "taskInstruction": "Analyze one segment.",
                    "modelSource": "global",
                    "model": "",
                    "thinkingMode": "off",
                    "temperature": 0.2,
                },
            },
        }
    )


def _batch_subgraph_worker_graph() -> dict[str, Any]:
    return {
        "state_schema": {
            "inner_segment": {"type": "text", "value": ""},
        },
        "nodes": {
            "segment_input": {
                "kind": "input",
                "ui": {"position": {"x": 0, "y": 0}},
                "writes": [{"state": "inner_segment"}],
                "config": {"value": "", "boundaryType": "text"},
            },
            "segment_output": {
                "kind": "output",
                "ui": {"position": {"x": 320, "y": 0}},
                "reads": [{"state": "inner_segment", "required": True}],
            },
        },
        "edges": [{"source": "segment_input", "target": "segment_output"}],
        "conditional_edges": [],
        "metadata": {},
    }


def _batch_node_with_subgraph_worker() -> NodeSystemBatchNode:
    return NodeSystemBatchNode.model_validate(
        {
            **_batch_node().model_dump(by_alias=True),
            "reads": [{"state": "segments", "required": True}],
            "config": {
                **_batch_node().config.model_dump(by_alias=True),
                "workerSource": "subgraph",
                "inputModes": {"segments": "batch"},
                "subgraphWorker": {
                    "templateId": "segment_template",
                    "templateSource": "user",
                    "label": "Segment Template",
                    "graph": _batch_subgraph_worker_graph(),
                },
            },
        }
    )


def test_batch_node_schema_accepts_per_input_batch_switches() -> None:
    node = _batch_node()

    assert node.kind == "batch"
    assert node.config.worker_source == "default_llm"
    assert node.config.input_modes == {"segments": "batch", "question": "shared"}
    assert node.config.max_concurrency == 2


def test_batch_node_schema_defaults_to_continue_retry_and_four_workers() -> None:
    node = NodeSystemBatchNode.model_validate(
        {
            "kind": "batch",
            "name": "Analyze Segments",
            "description": "",
            "ui": {"position": {"x": 0, "y": 0}},
            "reads": [{"state": "segments", "required": True}],
            "writes": [{"state": "reports", "mode": "replace"}],
            "config": {"inputModes": {"segments": "batch"}},
        }
    )

    assert node.config.max_concurrency == 4
    assert node.config.retry_count == 3
    assert node.config.continue_on_error is True


def test_batch_node_schema_accepts_template_worker_graph_snapshot() -> None:
    node = _batch_node_with_subgraph_worker()

    assert node.config.worker_source == "subgraph"
    assert node.config.subgraph_worker is not None
    assert node.config.subgraph_worker.template_id == "segment_template"
    assert "segment_input" in node.config.subgraph_worker.graph.nodes


def test_batch_validation_requires_at_least_one_batch_input() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_batch_invalid",
            "name": "Invalid Batch",
            "state_schema": {
                "question": {"type": "text", "value": "q"},
                "reports": {"type": "json", "value": []},
            },
            "nodes": {
                "batch": {
                    "kind": "batch",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "question", "required": True}],
                    "writes": [{"state": "reports"}],
                    "config": {"inputModes": {"question": "shared"}},
                }
            },
        }
    )

    validation = validate_graph(graph)

    assert not validation.valid
    assert "batch_input_missing" in [issue.code for issue in validation.issues]


def test_batch_validation_requires_template_worker_when_source_is_subgraph() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_batch_invalid_template",
            "name": "Invalid Template Batch",
            "state_schema": {
                "segments": {"type": "json", "value": ["a"]},
                "reports": {"type": "json", "value": []},
            },
            "nodes": {
                "batch": {
                    "kind": "batch",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "segments", "required": True}],
                    "writes": [{"state": "reports"}],
                    "config": {
                        "workerSource": "subgraph",
                        "inputModes": {"segments": "batch"},
                    },
                }
            },
        }
    )

    validation = validate_graph(graph)

    assert not validation.valid
    assert "batch_subgraph_worker_missing" in [issue.code for issue in validation.issues]


def test_execute_batch_node_zips_batch_inputs_and_collects_outputs_by_index() -> None:
    calls: list[dict[str, Any]] = []

    def generate_agent_response_func(agent_node, input_values, action_context, runtime_config, **kwargs):
        calls.append(dict(input_values))
        return (
            {"summary": "", "reports": f"{input_values['segments']} / {input_values['question']}"},
            "",
            [],
            runtime_config,
        )

    result = execute_batch_node(
        {
            "segments": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "reports": NodeSystemStateDefinition.model_validate({"type": "json"}),
        },
        _batch_node(),
        {"segments": ["s1", "s2"], "question": "what happened?"},
        {"metadata": {}, "state": {}},
        node_name="batch",
        state={"run_id": "run_batch"},
        generate_agent_response_func=generate_agent_response_func,
    )

    assert calls == [
        {"segments": "s1", "question": "what happened?"},
        {"segments": "s2", "question": "what happened?"},
    ]
    assert result["outputs"] == {"reports": ["s1 / what happened?", "s2 / what happened?"]}
    assert result["batch"]["item_count"] == 2
    assert result["batch"]["success_count"] == 2


def test_execute_batch_node_retries_failed_item_before_collecting_outputs_by_index() -> None:
    node = NodeSystemBatchNode.model_validate(
        {
            **_batch_node().model_dump(by_alias=True),
            "config": {
                **_batch_node().config.model_dump(by_alias=True),
                "maxConcurrency": 1,
                "retryCount": 1,
                "continueOnError": False,
            },
        }
    )
    calls: list[str] = []
    attempts_by_segment: dict[str, int] = {}

    def generate_agent_response_func(agent_node, input_values, action_context, runtime_config, **kwargs):
        segment = str(input_values["segments"])
        calls.append(segment)
        attempts_by_segment[segment] = attempts_by_segment.get(segment, 0) + 1
        if segment == "s1" and attempts_by_segment[segment] == 1:
            raise RuntimeError("temporary provider failure")
        return (
            {"summary": "", "reports": f"ok::{segment}"},
            "",
            [],
            runtime_config,
        )

    result = execute_batch_node(
        {
            "segments": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "reports": NodeSystemStateDefinition.model_validate({"type": "json"}),
        },
        node,
        {"segments": ["s1", "s2"], "question": "what happened?"},
        {"metadata": {}, "state": {}},
        node_name="batch",
        state={"run_id": "run_batch"},
        generate_agent_response_func=generate_agent_response_func,
    )

    assert calls == ["s1", "s1", "s2"]
    assert result["outputs"] == {"reports": ["ok::s1", "ok::s2"]}
    assert result["batch"]["items"][0]["attempts"] == 2
    assert result["batch"]["items"][1]["attempts"] == 1


def test_execute_batch_node_defaults_to_continue_after_retry_exhaustion() -> None:
    node = NodeSystemBatchNode.model_validate(
        {
            "kind": "batch",
            "name": "Analyze Segments",
            "description": "Analyze each segment with shared question context.",
            "ui": {"position": {"x": 0, "y": 0}},
            "reads": [
                {"state": "segments", "required": True},
                {"state": "question", "required": True},
            ],
            "writes": [{"state": "reports", "mode": "replace"}],
            "config": {
                "inputModes": {
                    "segments": "batch",
                    "question": "shared",
                },
                "maxConcurrency": 1,
            },
        }
    )
    calls: list[str] = []

    def generate_agent_response_func(agent_node, input_values, action_context, runtime_config, **kwargs):
        segment = str(input_values["segments"])
        calls.append(segment)
        if segment == "s1":
            raise RuntimeError("permanent provider failure")
        return (
            {"summary": "", "reports": f"ok::{segment}"},
            "",
            [],
            runtime_config,
        )

    result = execute_batch_node(
        {
            "segments": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "reports": NodeSystemStateDefinition.model_validate({"type": "json"}),
        },
        node,
        {"segments": ["s1", "s2"], "question": "what happened?"},
        {"metadata": {}, "state": {}},
        node_name="batch",
        state={"run_id": "run_batch"},
        generate_agent_response_func=generate_agent_response_func,
    )

    assert calls == ["s1", "s1", "s1", "s1", "s2"]
    assert result["outputs"] == {"reports": [None, "ok::s2"]}
    assert result["batch"]["failure_count"] == 1
    assert result["batch"]["items"][0]["attempts"] == 4
    assert "Batch item 1 failed after 4 attempts" in result["warnings"][0]


def test_execute_batch_node_runs_template_worker_for_each_batch_item() -> None:
    calls: list[dict[str, Any]] = []

    def execute_subgraph_worker_func(*, worker_node, item_inputs, item_index, node_name, state):
        calls.append(
            {
                "worker_kind": worker_node.kind,
                "item_index": item_index,
                "node_name": node_name,
                "item_inputs": dict(item_inputs),
                "run_id": state["run_id"],
            }
        )
        return {
            "outputs": {"reports": f"template::{item_inputs['segments']}"},
            "warnings": [],
            "subgraph": {"status": "succeeded"},
        }

    result = execute_batch_node(
        {
            "segments": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "reports": NodeSystemStateDefinition.model_validate({"type": "json"}),
        },
        _batch_node_with_subgraph_worker(),
        {"segments": ["s1", "s2"]},
        {"metadata": {}, "state": {}},
        node_name="batch",
        state={"run_id": "run_batch"},
        execute_subgraph_worker_func=execute_subgraph_worker_func,
    )

    assert [call["item_inputs"] for call in calls] == [{"segments": "s1"}, {"segments": "s2"}]
    assert {call["worker_kind"] for call in calls} == {"subgraph"}
    assert result["outputs"] == {"reports": ["template::s1", "template::s2"]}
    assert result["batch"]["worker_source"] == "subgraph"


def test_execute_batch_node_rejects_mismatched_batch_input_lengths() -> None:
    node = NodeSystemBatchNode.model_validate(
        {
            **_batch_node().model_dump(by_alias=True),
            "reads": [
                {"state": "segments", "required": True},
                {"state": "timestamps", "required": True},
            ],
            "config": {
                **_batch_node().config.model_dump(by_alias=True),
                "inputModes": {"segments": "batch", "timestamps": "batch"},
            },
        }
    )

    with pytest.raises(ValueError, match="same length|相同长度"):
        execute_batch_node(
            {
                "segments": NodeSystemStateDefinition.model_validate({"type": "json"}),
                "timestamps": NodeSystemStateDefinition.model_validate({"type": "json"}),
                "reports": NodeSystemStateDefinition.model_validate({"type": "json"}),
            },
            node,
            {"segments": ["s1", "s2"], "timestamps": [0]},
            {"metadata": {}, "state": {}},
            node_name="batch",
            state={"run_id": "run_batch"},
            generate_agent_response_func=lambda *args, **kwargs: ({}, "", [], {}),
        )


def test_langgraph_runtime_executes_batch_node_with_default_llm_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_generate_agent_response(node, input_values, action_context, runtime_config, **kwargs):
        return (
            {"summary": "", "reports": f"{input_values['segments']}::{input_values['question']}"},
            "",
            [],
            runtime_config,
        )

    monkeypatch.setattr(
        "app.core.runtime.node_system_executor.generate_agent_response",
        fake_generate_agent_response,
    )
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_batch_runtime",
            "name": "Batch Runtime",
            "state_schema": {
                "segments": {"type": "json", "value": ["intro", "middle"]},
                "question": {"type": "text", "value": "summarize"},
                "reports": {"type": "json", "value": []},
            },
            "nodes": {
                "input_segments": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "segments"}],
                    "config": {"value": ["intro", "middle"], "boundaryType": "json"},
                },
                "input_question": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 100}},
                    "writes": [{"state": "question"}],
                    "config": {"value": "summarize"},
                },
                "batch": _batch_node().model_dump(by_alias=True),
                "output_reports": {
                    "kind": "output",
                    "ui": {"position": {"x": 500, "y": 0}},
                    "reads": [{"state": "reports", "required": True}],
                },
            },
            "edges": [
                {"source": "input_segments", "target": "batch"},
                {"source": "input_question", "target": "batch"},
                {"source": "batch", "target": "output_reports"},
            ],
        }
    )

    result = execute_node_system_graph_langgraph(graph, save_final_run=False, emit_lifecycle_events=False)

    assert result["state_values"]["reports"] == ["intro::summarize", "middle::summarize"]
    batch_execution = next(item for item in result["node_executions"] if item["node_id"] == "batch")
    assert batch_execution["artifacts"]["batch"]["item_count"] == 2


def test_langgraph_runtime_executes_batch_node_with_template_worker() -> None:
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_batch_template_runtime",
            "name": "Batch Template Runtime",
            "state_schema": {
                "segments": {"type": "json", "value": ["intro", "middle"]},
                "reports": {"type": "json", "value": []},
            },
            "nodes": {
                "input_segments": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "segments"}],
                    "config": {"value": ["intro", "middle"], "boundaryType": "json"},
                },
                "batch": _batch_node_with_subgraph_worker().model_dump(by_alias=True),
                "output_reports": {
                    "kind": "output",
                    "ui": {"position": {"x": 500, "y": 0}},
                    "reads": [{"state": "reports", "required": True}],
                },
            },
            "edges": [
                {"source": "input_segments", "target": "batch"},
                {"source": "batch", "target": "output_reports"},
            ],
        }
    )

    result = execute_node_system_graph_langgraph(graph, save_final_run=False, emit_lifecycle_events=False)

    assert result["state_values"]["reports"] == ["intro", "middle"]
    batch_execution = next(item for item in result["node_executions"] if item["node_id"] == "batch")
    assert batch_execution["artifacts"]["batch"]["items"][0]["status"] == "succeeded"
    assert batch_execution["artifacts"]["batch"]["items"][0]["subgraph"]["status"] == "completed"
