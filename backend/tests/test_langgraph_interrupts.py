from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.interrupts import (
    after_breakpoint_node_name,
    apply_waiting_state,
    clear_pending_interrupt_metadata,
    is_waiting_for_human,
    next_run_snapshot_id,
    resolve_interrupt_configuration,
    serialize_pending_interrupts,
    source_node_from_after_breakpoint,
)
from app.core.schemas.node_system import NodeSystemGraphDocument


class LangGraphInterruptsTests(unittest.TestCase):
    def test_breakpoint_node_names_round_trip(self) -> None:
        wrapped = after_breakpoint_node_name("draft")

        self.assertNotEqual(wrapped, "draft")
        self.assertEqual(source_node_from_after_breakpoint(wrapped), "draft")
        self.assertEqual(source_node_from_after_breakpoint("draft"), "draft")

    def test_resolve_interrupt_configuration_uses_only_interrupt_after_metadata(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph",
                "name": "Graph",
                "state_schema": {},
                "nodes": {},
                "edges": [],
                "conditional_edges": [],
                "metadata": {
                    "interrupt_before": ["draft", "missing"],
                    "interruptAfter": "legacy_review",
                    "interrupt_after": ["review", "missing"],
                },
            }
        )

        interrupt_after = resolve_interrupt_configuration(graph, allowed_nodes={"draft", "review"})

        self.assertEqual(interrupt_after, ["review"])

    def test_waiting_detection_and_interrupt_serialization(self) -> None:
        interrupt = SimpleNamespace(id="interrupt-1", value={"prompt": "Review"})
        snapshot = SimpleNamespace(
            next=(),
            tasks=(SimpleNamespace(name=after_breakpoint_node_name("review"), interrupts=(interrupt,)),),
        )

        self.assertTrue(is_waiting_for_human(snapshot))
        self.assertEqual(
            serialize_pending_interrupts(snapshot),
            (
                ["review"],
                [{"node_id": "review", "interrupt_id": "interrupt-1", "value": {"prompt": "Review"}}],
            ),
        )
        self.assertFalse(is_waiting_for_human(None))
        self.assertEqual(
            serialize_pending_interrupts(SimpleNamespace(next=(after_breakpoint_node_name("fallback"),), tasks=())),
            (["fallback"], []),
        )

    def test_apply_waiting_state_updates_metadata_status_and_snapshot(self) -> None:
        calls: list[tuple[str, object]] = []
        state = {"metadata": {}, "node_status_map": {"review": "idle"}, "run_snapshots": []}
        snapshot = SimpleNamespace(
            values={"answer": "draft"},
            next=(),
            tasks=(SimpleNamespace(name=after_breakpoint_node_name("review"), interrupts=()),),
        )

        apply_waiting_state(
            state,
            snapshot,
            graph=SimpleNamespace(),
            checkpoint_saver=SimpleNamespace(),
            checkpoint_lookup_config={"configurable": {"thread_id": "run-1"}},
            started_perf=10.0,
            node_outputs={"review": {"outputs": {}}},
            active_edge_ids={"edge-1"},
            set_run_status_func=lambda current_state, status, *, pause_reason: calls.append(
                ("status", {"status": status, "pause_reason": pause_reason})
            ) or current_state.update({"status": status, "pause_reason": pause_reason}),
            collect_output_boundaries_func=lambda graph, current_state, active_edge_ids: calls.append(
                ("boundaries", active_edge_ids)
            ),
            sync_checkpoint_metadata_func=lambda current_state, saver, lookup: calls.append(("sync", lookup)),
            refresh_run_artifacts_func=lambda *args, **kwargs: calls.append(("refresh", (args, kwargs))),
            append_run_snapshot_func=lambda current_state, **kwargs: calls.append(("snapshot", kwargs)),
        )

        self.assertEqual(state["state_values"], {"answer": "draft"})
        self.assertEqual(state["current_node_id"], "review")
        self.assertEqual(state["node_status_map"]["review"], "paused")
        self.assertEqual(state["metadata"]["pending_interrupt_nodes"], ["review"])
        self.assertEqual(state["metadata"]["pending_interrupts"], [])
        self.assertEqual(state["metadata"]["resolved_runtime_backend"], "langgraph")
        self.assertEqual(calls[0], ("status", {"status": "awaiting_human", "pause_reason": "breakpoint"}))
        self.assertEqual(calls[-1][0], "snapshot")
        self.assertEqual(calls[-1][1]["snapshot_id"], "pause_1")

    def test_clear_pending_interrupt_metadata_and_next_snapshot_id(self) -> None:
        state = {
            "metadata": {"pending_interrupt_nodes": ["review"], "pending_interrupts": [{"id": "i"}]},
            "run_snapshots": [{"kind": "pause"}, {"kind": "completed"}],
        }

        clear_pending_interrupt_metadata(state)

        self.assertNotIn("pending_interrupt_nodes", state["metadata"])
        self.assertNotIn("pending_interrupts", state["metadata"])
        self.assertEqual(next_run_snapshot_id(state, "pause"), "pause_2")


if __name__ == "__main__":
    unittest.main()
