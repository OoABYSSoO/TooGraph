from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph import execute_node_system_graph_langgraph
from app.core.schemas.node_system import NodeSystemGraphDocument


def _workspace_write_inputs() -> dict[str, object]:
    return {
        "operation": "write",
        "path": "action/user/demo/ACTION.md",
        "content": "# Demo",
        "query": "",
        "old_string": "",
        "new_string": "",
        "replace_all": False,
        "expected_sha256": "",
        "expected_mtime_ns": "",
        "args": [],
    }


def _workspace_read_inputs() -> dict[str, object]:
    return {
        "operation": "read",
        "path": "README.md",
        "content": "",
        "query": "",
        "old_string": "",
        "new_string": "",
        "replace_all": False,
        "expected_sha256": "",
        "expected_mtime_ns": "",
        "args": [],
    }


def _approval_graph() -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_permission_approval_runtime",
            "name": "Permission Approval Runtime",
            "state_schema": {
                "selected_capability": {
                    "type": "capability",
                    "value": {"kind": "action", "key": "local_workspace_executor"},
                },
                "request": {"type": "text", "value": "write a user action file"},
                "dynamic_result": {"type": "result_package"},
            },
            "nodes": {
                "capability_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "selected_capability"}],
                    "config": {"value": {"kind": "action", "key": "local_workspace_executor"}},
                },
                "request_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 160}},
                    "writes": [{"state": "request"}],
                    "config": {"value": "write a user action file"},
                },
                "execute_capability": {
                    "kind": "agent",
                    "name": "Execute Capability",
                    "ui": {"position": {"x": 320, "y": 80}},
                    "reads": [{"state": "selected_capability"}, {"state": "request"}],
                    "writes": [{"state": "dynamic_result"}],
                    "config": {"actionKey": ""},
                },
                "output_result": {
                    "kind": "output",
                    "ui": {"position": {"x": 680, "y": 80}},
                    "reads": [{"state": "dynamic_result"}],
                },
            },
            "edges": [
                {"source": "capability_input", "target": "execute_capability"},
                {"source": "request_input", "target": "execute_capability"},
                {"source": "execute_capability", "target": "output_result"},
            ],
            "conditional_edges": [],
            "metadata": {
                "graph_permission_mode": "ask_first",
                "buddy_requires_approval": True,
            },
        }
    )


def _subgraph_approval_graph() -> NodeSystemGraphDocument:
    inner_graph = {
        "state_schema": {
            "selected_capability": {
                "type": "capability",
                "value": {"kind": "action", "key": "local_workspace_executor"},
            },
            "request": {"type": "text", "value": "write a user action file"},
            "dynamic_result": {"type": "result_package"},
        },
        "nodes": {
            "capability_input": {
                "kind": "input",
                "ui": {"position": {"x": 0, "y": 0}},
                "writes": [{"state": "selected_capability"}],
                "config": {"value": {"kind": "action", "key": "local_workspace_executor"}},
            },
            "request_input": {
                "kind": "input",
                "ui": {"position": {"x": 0, "y": 160}},
                "writes": [{"state": "request"}],
                "config": {"value": "write a user action file"},
            },
            "execute_capability": {
                "kind": "agent",
                "name": "Execute Capability",
                "ui": {"position": {"x": 320, "y": 80}},
                "reads": [{"state": "selected_capability"}, {"state": "request"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            },
            "output_result": {
                "kind": "output",
                "ui": {"position": {"x": 680, "y": 80}},
                "reads": [{"state": "dynamic_result"}],
            },
        },
        "edges": [
            {"source": "capability_input", "target": "execute_capability"},
            {"source": "request_input", "target": "execute_capability"},
            {"source": "execute_capability", "target": "output_result"},
        ],
        "conditional_edges": [],
        "metadata": {"role": "capability_cycle"},
    }
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_nested_permission_approval_runtime",
            "name": "Nested Permission Approval Runtime",
            "state_schema": {
                "selected_capability": {
                    "type": "capability",
                    "value": {"kind": "action", "key": "local_workspace_executor"},
                },
                "request": {"type": "text", "value": "write a user action file"},
                "dynamic_result": {"type": "result_package"},
            },
            "nodes": {
                "capability_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "selected_capability"}],
                    "config": {"value": {"kind": "action", "key": "local_workspace_executor"}},
                },
                "request_input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 160}},
                    "writes": [{"state": "request"}],
                    "config": {"value": "write a user action file"},
                },
                "run_capability_cycle": {
                    "kind": "subgraph",
                    "name": "Run Capability Cycle",
                    "ui": {"position": {"x": 320, "y": 80}},
                    "reads": [{"state": "selected_capability"}, {"state": "request"}],
                    "writes": [{"state": "dynamic_result"}],
                    "config": {"graph": inner_graph},
                },
                "output_result": {
                    "kind": "output",
                    "ui": {"position": {"x": 680, "y": 80}},
                    "reads": [{"state": "dynamic_result"}],
                },
            },
            "edges": [
                {"source": "capability_input", "target": "run_capability_cycle"},
                {"source": "request_input", "target": "run_capability_cycle"},
                {"source": "run_capability_cycle", "target": "output_result"},
            ],
            "conditional_edges": [],
            "metadata": {
                "graph_permission_mode": "ask_first",
                "buddy_requires_approval": True,
            },
        }
    )


def test_langgraph_runtime_pauses_before_risky_action_permission(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module
    import app.core.runtime.node_system_executor as executor_module

    invoked: list[dict[str, object]] = []

    monkeypatch.setattr(runtime_module, "save_run", lambda _state: None)
    monkeypatch.setattr(
        executor_module,
        "_generate_agent_action_inputs",
        lambda **kwargs: (
            {"local_workspace_executor": _workspace_write_inputs()},
            {},
            "planned action inputs",
            [],
            kwargs["runtime_config"],
        ),
    )
    monkeypatch.setattr(
        executor_module,
        "_invoke_action",
        lambda action_func, action_inputs, **kwargs: invoked.append(dict(action_inputs))
        or {"status": "succeeded", "success": True, "result": "wrote file"},
    )

    result = execute_node_system_graph_langgraph(_approval_graph())

    assert result["status"] == "awaiting_human"
    assert result["current_node_id"] == "execute_capability"
    assert result["node_status_map"]["execute_capability"] == "paused"
    assert invoked == []
    pending = result["metadata"]["pending_permission_approval"]
    assert pending["kind"] == "capability_permission_approval"
    assert pending["capability_key"] == "local_workspace_executor"
    assert pending["permissions"] == ["file_write"]
    assert pending["inputs"]["path"] == "action/user/demo/ACTION.md"
    assert result["lifecycle"]["pause_reason"] == "permission_approval"


def test_langgraph_runtime_does_not_pause_for_workspace_read_operation(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module
    import app.core.runtime.node_system_executor as executor_module

    invoked: list[dict[str, object]] = []

    monkeypatch.setattr(runtime_module, "save_run", lambda _state: None)
    monkeypatch.setattr(
        executor_module,
        "_generate_agent_action_inputs",
        lambda **kwargs: (
            {"local_workspace_executor": _workspace_read_inputs()},
            {},
            "planned read action inputs",
            [],
            kwargs["runtime_config"],
        ),
    )
    monkeypatch.setattr(
        executor_module,
        "_invoke_action",
        lambda action_func, action_inputs, **kwargs: invoked.append(dict(action_inputs))
        or {"status": "succeeded", "success": True, "result": "read file"},
    )

    result = execute_node_system_graph_langgraph(_approval_graph())

    assert result["status"] == "completed"
    assert invoked == [_workspace_read_inputs()]
    assert "pending_permission_approval" not in result["metadata"]
    assert result.get("permission_approvals") in (None, [])


def test_langgraph_runtime_resumes_permission_approval_with_stored_inputs(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module
    import app.core.runtime.node_system_executor as executor_module

    planned_inputs_calls = 0
    invoked: list[dict[str, object]] = []

    def generate_action_inputs(**kwargs):
        nonlocal planned_inputs_calls
        planned_inputs_calls += 1
        return (
            {"local_workspace_executor": _workspace_write_inputs()},
            {},
            "planned action inputs",
            [],
            kwargs["runtime_config"],
        )

    monkeypatch.setattr(runtime_module, "save_run", lambda _state: None)
    monkeypatch.setattr(executor_module, "_generate_agent_action_inputs", generate_action_inputs)
    monkeypatch.setattr(
        executor_module,
        "_invoke_action",
        lambda action_func, action_inputs, **kwargs: invoked.append(dict(action_inputs))
        or {"status": "succeeded", "success": True, "result": "wrote file"},
    )

    graph = _approval_graph()
    paused = execute_node_system_graph_langgraph(graph)
    paused["metadata"]["pending_permission_approval_resume_payload"] = {}

    resumed = execute_node_system_graph_langgraph(
        graph,
        paused,
        resume_from_checkpoint=True,
        resume_command=None,
    )

    assert resumed["status"] == "completed"
    assert planned_inputs_calls == 1
    assert invoked == [_workspace_write_inputs()]
    assert "pending_permission_approval" not in resumed["metadata"]
    assert resumed["permission_approvals"][0]["status"] == "approved"
    package = resumed["state_values"]["dynamic_result"]
    assert package["kind"] == "result_package"
    assert package["sourceKey"] == "local_workspace_executor"
    assert package["inputs"]["path"] == "action/user/demo/ACTION.md"


def test_langgraph_runtime_propagates_permission_approval_through_subgraph(monkeypatch) -> None:
    import app.core.langgraph.runtime as runtime_module
    import app.core.runtime.node_system_executor as executor_module

    planned_inputs_calls = 0
    invoked: list[dict[str, object]] = []

    def generate_action_inputs(**kwargs):
        nonlocal planned_inputs_calls
        planned_inputs_calls += 1
        return (
            {"local_workspace_executor": _workspace_write_inputs()},
            {},
            "planned action inputs",
            [],
            kwargs["runtime_config"],
        )

    monkeypatch.setattr(runtime_module, "save_run", lambda _state: None)
    monkeypatch.setattr(executor_module, "_generate_agent_action_inputs", generate_action_inputs)
    monkeypatch.setattr(
        executor_module,
        "_invoke_action",
        lambda action_func, action_inputs, **kwargs: invoked.append(dict(action_inputs))
        or {"status": "succeeded", "success": True, "result": "wrote file"},
    )

    graph = _subgraph_approval_graph()
    policy = {
        "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
        "approval_required_permission_tiers": ["risky"],
    }
    graph.metadata["capability_permission_policy"] = policy
    paused = execute_node_system_graph_langgraph(graph)

    assert paused["status"] == "awaiting_human"
    assert paused["current_node_id"] == "run_capability_cycle"
    pending_subgraph = paused["metadata"]["pending_subgraph_breakpoint"]
    assert pending_subgraph["inner_node_id"] == "execute_capability"
    assert pending_subgraph["metadata"]["capability_permission_policy"] == policy
    assert pending_subgraph["metadata"]["pending_permission_approval"]["capability_key"] == "local_workspace_executor"
    assert invoked == []

    paused["metadata"]["pending_subgraph_resume_payload"] = {}
    resumed = execute_node_system_graph_langgraph(
        graph,
        paused,
        resume_from_checkpoint=True,
        resume_command=None,
    )

    assert resumed["status"] == "completed"
    assert planned_inputs_calls == 1
    assert invoked == [_workspace_write_inputs()]
    assert resumed["state_values"]["dynamic_result"]["sourceKey"] == "local_workspace_executor"
