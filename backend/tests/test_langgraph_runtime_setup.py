from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langgraph.graph import END, START

from app.core.langgraph.runtime_setup import (
    build_after_breakpoint_passthrough_callable,
    build_langgraph_state_schema,
    mark_input_boundaries_success,
    runtime_graph_endpoint,
)
from app.core.schemas.node_system import NodeSystemGraphPayload


def _build_graph() -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(
        {
            "name": "Runtime Setup",
            "state_schema": {
                "answer": {
                    "name": "answer",
                    "description": "Answer text.",
                    "type": "text",
                    "value": "",
                    "color": "#2563eb",
                }
            },
            "nodes": {
                "input_answer": {
                    "kind": "input",
                    "name": "Input",
                    "description": "",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "answer", "mode": "replace"}],
                    "config": {"value": "hello"},
                },
                "agent_answer": {
                    "kind": "agent",
                    "name": "Agent",
                    "description": "",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "answer", "required": True}],
                    "writes": [],
                    "config": {"skills": [], "taskInstruction": ""},
                },
            },
            "edges": [{"source": "input_answer", "target": "agent_answer"}],
            "conditional_edges": [],
            "metadata": {},
        }
    )


class LangGraphRuntimeSetupTest(unittest.TestCase):
    def test_runtime_graph_endpoint_maps_sentinels(self) -> None:
        self.assertEqual(runtime_graph_endpoint("__start__"), START)
        self.assertEqual(runtime_graph_endpoint("__end__"), END)
        self.assertEqual(runtime_graph_endpoint("agent_answer"), "agent_answer")

    def test_build_after_breakpoint_passthrough_callable_returns_empty_update(self) -> None:
        self.assertEqual(build_after_breakpoint_passthrough_callable()({"answer": "hello"}), {})

    def test_mark_input_boundaries_success_only_marks_input_nodes(self) -> None:
        state = {"node_status_map": {"input_answer": "idle", "agent_answer": "idle"}}

        mark_input_boundaries_success(_build_graph(), state)

        self.assertEqual(state["node_status_map"]["input_answer"], "success")
        self.assertEqual(state["node_status_map"]["agent_answer"], "idle")

    def test_build_langgraph_state_schema_includes_graph_state_keys(self) -> None:
        schema = build_langgraph_state_schema(_build_graph())

        self.assertIn("answer", schema.__annotations__)


if __name__ == "__main__":
    unittest.main()
