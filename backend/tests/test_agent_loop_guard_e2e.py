from __future__ import annotations

import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph import execute_node_system_graph_langgraph
from app.core.runtime.state import create_initial_run_state
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage import database
from app.main import app


@contextmanager
def isolated_run_database():
    old_data_dir = database.DATA_DIR
    old_db_path = database.DB_PATH
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir) / "data"
        database.DATA_DIR = data_dir
        database.DB_PATH = data_dir / "toograph.db"
        try:
            database.initialize_storage()
            yield
        finally:
            database.DATA_DIR = old_data_dir
            database.DB_PATH = old_db_path


def _state_definition(state_type: str, value: object, binding: dict[str, object] | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": state_type,
        "description": "",
        "type": state_type,
        "value": value,
        "color": "#475569",
    }
    if binding is not None:
        payload["binding"] = binding
    return payload


def _tool_output_binding(field_key: str) -> dict[str, object]:
    return {
        "kind": "tool_output",
        "toolKey": "agent_loop_guard",
        "nodeId": "guard_agent_loop",
        "fieldKey": field_key,
        "managed": True,
    }


def _tool_input_binding(field_key: str) -> dict[str, object]:
    return {
        "kind": "tool_input",
        "toolKey": "agent_loop_guard",
        "fieldKey": field_key,
        "managed": True,
    }


def _input_node(state_key: str, y: int) -> dict[str, object]:
    return {
        "kind": "input",
        "name": state_key,
        "description": "",
        "ui": {"position": {"x": 0, "y": y}},
        "reads": [],
        "writes": [{"state": state_key, "mode": "replace"}],
        "config": {"boundaryType": "text"},
    }


def _agent_loop_guard_graph() -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "agent_loop_guard_e2e",
            "name": "Agent Loop Guard E2E",
            "state_schema": {
                "agent_loop_control": _state_definition(
                    "json",
                    {
                        "iteration_index": 0,
                        "max_iterations": 4,
                        "capability_call_count": 0,
                        "max_capability_calls": 1,
                        "retry_budget": 0,
                    },
                    _tool_output_binding("agent_loop_control"),
                ),
                "selected_capability": _state_definition(
                    "capability",
                    {"kind": "tool", "toolKey": "web_search", "key": "web_search"},
                ),
                "capability_result": _state_definition("json", {"status": "succeeded"}),
                "agent_loop_report": _state_definition("json", {}, _tool_output_binding("agent_loop_report")),
                "agent_loop_stop_reason": _state_definition(
                    "text",
                    "",
                    _tool_output_binding("agent_loop_stop_reason"),
                ),
                "agent_loop_should_continue": _state_definition(
                    "boolean",
                    False,
                    _tool_output_binding("agent_loop_should_continue"),
                ),
                "agent_loop_should_retry": _state_definition(
                    "boolean",
                    False,
                    _tool_output_binding("agent_loop_should_retry"),
                ),
            },
            "nodes": {
                "input_loop_control": _input_node("agent_loop_control", 0),
                "input_selected_capability": _input_node("selected_capability", 120),
                "input_capability_result": _input_node("capability_result", 240),
                "guard_agent_loop": {
                    "kind": "tool",
                    "name": "Agent Loop Guard",
                    "description": "",
                    "ui": {"position": {"x": 360, "y": 80}},
                    "reads": [
                        {
                            "state": "agent_loop_control",
                            "required": True,
                            "binding": _tool_input_binding("agent_loop_control"),
                        },
                        {
                            "state": "selected_capability",
                            "required": True,
                            "binding": _tool_input_binding("selected_capability"),
                        },
                        {
                            "state": "capability_result",
                            "required": True,
                            "binding": _tool_input_binding("capability_result"),
                        },
                    ],
                    "writes": [
                        {"state": "agent_loop_control", "mode": "replace"},
                        {"state": "agent_loop_report", "mode": "replace"},
                        {"state": "agent_loop_stop_reason", "mode": "replace"},
                        {"state": "agent_loop_should_continue", "mode": "replace"},
                        {"state": "agent_loop_should_retry", "mode": "replace"},
                    ],
                    "config": {"toolKey": "agent_loop_guard"},
                },
                "output_guard_report": {
                    "kind": "output",
                    "name": "Guard Report",
                    "description": "",
                    "ui": {"position": {"x": 760, "y": 80}},
                    "reads": [{"state": "agent_loop_report", "required": True}],
                    "writes": [],
                    "config": {
                        "displayMode": "json",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                },
            },
            "edges": [
                {"source": "input_loop_control", "target": "guard_agent_loop"},
                {"source": "input_selected_capability", "target": "guard_agent_loop"},
                {"source": "input_capability_result", "target": "guard_agent_loop"},
                {"source": "guard_agent_loop", "target": "output_guard_report"},
            ],
            "conditional_edges": [],
            "metadata": {"role": "agent_loop_guard_e2e"},
        }
    )


class AgentLoopGuardE2ETests(unittest.TestCase):
    def test_actual_graph_run_projects_agent_loop_event_to_run_detail_api(self) -> None:
        with isolated_run_database():
            graph = _agent_loop_guard_graph()
            run_state = create_initial_run_state(graph_id=graph.graph_id, graph_name=graph.name)
            run_state["runtime_backend"] = "langgraph"
            run_state["metadata"] = {"resolved_runtime_backend": "langgraph"}
            run_state["graph_snapshot"] = graph.model_dump(by_alias=True, mode="json")
            run_state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}

            executed = execute_node_system_graph_langgraph(
                graph,
                run_state,
                persist_progress=True,
                save_final_run=True,
                emit_lifecycle_events=False,
            )

            with TestClient(app) as client:
                response = client.get(f"/api/runs/{executed['run_id']}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["stop_reason"], "capability_budget_exhausted")
        self.assertEqual(payload["artifacts"]["state_values"]["agent_loop_stop_reason"], "capability_budget_exhausted")

        events = payload["agent_loop_events"]
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["node_id"], "guard_agent_loop")
        self.assertEqual(event["event_kind"], "stop")
        self.assertEqual(event["capability_kind"], "tool")
        self.assertEqual(event["capability_key"], "web_search")
        self.assertEqual(event["stop_reason"], "capability_budget_exhausted")
        self.assertEqual(event["budget_snapshot"]["capability_call_count"], 1)
        self.assertEqual(event["budget_snapshot"]["max_capability_calls"], 1)
        self.assertEqual(event["detail"]["decision"], "stop")
        self.assertEqual(event["detail"]["selected_capability_ref"], "tool:web_search")

        guard_execution = next(item for item in payload["node_executions"] if item["node_id"] == "guard_agent_loop")
        self.assertEqual(
            guard_execution["artifacts"]["outputs"]["agent_loop_report"]["stop_reason"],
            "capability_budget_exhausted",
        )


if __name__ == "__main__":
    unittest.main()
