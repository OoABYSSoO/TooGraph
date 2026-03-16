from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langgraph.graph import END, START

from app.core.langgraph.runtime_setup import (
    build_after_breakpoint_passthrough_callable,
    build_after_breakpoint_node_map,
    build_compiled_interrupt_before,
    build_langgraph_execution_edge_indexes,
    build_langgraph_state_schema,
    mark_input_boundaries_success,
    prepare_langgraph_runtime_state,
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

    def test_build_after_breakpoint_node_map_filters_to_runtime_nodes(self) -> None:
        self.assertEqual(
            build_after_breakpoint_node_map(
                ["agent_answer", "input_answer", "missing"],
                runtime_nodes={"agent_answer", "input_answer"},
                after_breakpoint_node_name_func=lambda node_name: f"after::{node_name}",
            ),
            {
                "agent_answer": "after::agent_answer",
                "input_answer": "after::input_answer",
            },
        )

    def test_build_compiled_interrupt_before_merges_before_and_after_nodes(self) -> None:
        self.assertEqual(
            build_compiled_interrupt_before(
                ["agent_answer"],
                {"input_answer": "after::input_answer"},
            ),
            ["after::input_answer", "agent_answer"],
        )
        self.assertIsNone(build_compiled_interrupt_before(None, {}))

    def test_build_langgraph_execution_edge_indexes_groups_edges_and_conditionals(self) -> None:
        regular_edge = SimpleNamespace(id="edge-1", source="input_answer", target="agent_answer", kind="regular", branch=None)
        conditional_edge = SimpleNamespace(
            id="edge-2",
            source="agent_answer",
            target="agent_answer",
            kind="conditional",
            branch="retry",
        )

        outgoing, conditional_ids = build_langgraph_execution_edge_indexes([regular_edge, conditional_edge])

        self.assertEqual(outgoing["input_answer"], [regular_edge])
        self.assertEqual(outgoing["agent_answer"], [conditional_edge])
        self.assertEqual(conditional_ids[("agent_answer", "retry", "agent_answer")], "edge-2")

    def test_mark_input_boundaries_success_only_marks_input_nodes(self) -> None:
        state = {"node_status_map": {"input_answer": "idle", "agent_answer": "idle"}}

        mark_input_boundaries_success(_build_graph(), state)

        self.assertEqual(state["node_status_map"]["input_answer"], "success")
        self.assertEqual(state["node_status_map"]["agent_answer"], "idle")

    def test_build_langgraph_state_schema_includes_graph_state_keys(self) -> None:
        schema = build_langgraph_state_schema(_build_graph())

        self.assertIn("answer", schema.__annotations__)

    def test_prepare_langgraph_runtime_state_initializes_new_run_state(self) -> None:
        state = prepare_langgraph_runtime_state(_build_graph(), None, resume_from_checkpoint=False)

        self.assertEqual(state["runtime_backend"], "langgraph")
        self.assertEqual(state["node_status_map"]["input_answer"], "success")
        self.assertEqual(state["node_status_map"]["agent_answer"], "idle")
        self.assertEqual(state["metadata"]["resolved_runtime_backend"], "langgraph")
        self.assertIn("started_at", state)

    def test_prepare_langgraph_runtime_state_preserves_resume_node_statuses(self) -> None:
        state = {
            "node_status_map": {
                "input_answer": "running",
                "agent_answer": "success",
                "stale_node": "success",
            },
            "state_values": {},
        }

        prepared = prepare_langgraph_runtime_state(_build_graph(), state, resume_from_checkpoint=True)

        self.assertIs(prepared, state)
        self.assertEqual(prepared["node_status_map"], {"input_answer": "success", "agent_answer": "success"})
        self.assertEqual(prepared["metadata"]["resolved_runtime_backend"], "langgraph")


if __name__ == "__main__":
    unittest.main()
