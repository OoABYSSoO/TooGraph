from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.cycle_tracker import (
    ensure_cycle_iteration_record,
    finalize_langgraph_cycle_summary,
    record_cycle_activity,
    resolve_cycle_summary_max_iterations,
    serialize_cycle_records,
)


class LangGraphCycleTrackerTests(unittest.TestCase):
    def test_resolve_cycle_summary_max_iterations_uses_minimum_finite_limit(self) -> None:
        self.assertEqual(resolve_cycle_summary_max_iterations({}), -1)
        self.assertEqual(resolve_cycle_summary_max_iterations({"a": -1, "b": 0}), -1)
        self.assertEqual(resolve_cycle_summary_max_iterations({"a": 5, "b": 2}), 2)

    def test_ensure_cycle_iteration_record_merges_incoming_edges(self) -> None:
        tracker: dict[str, object] = {"records": {}}

        record = ensure_cycle_iteration_record(tracker, 1, ["b", "a"])
        record_again = ensure_cycle_iteration_record(tracker, 1, ["c", "a"])

        self.assertIs(record_again, record)
        self.assertEqual(record_again["incoming_edge_ids"], ["a", "b", "c"])

    def test_record_cycle_activity_stops_when_back_edge_has_no_state_change(self) -> None:
        tracker = {
            "has_cycle": True,
            "back_edges": ["condition→agent"],
            "back_edge_ids": {"edge-back"},
            "back_edges_by_id": {"edge-back": SimpleNamespace(source="condition")},
            "loop_limits_by_source": {"condition": 5},
            "loop_iterations_by_source": {},
            "max_iterations": 5,
            "records": {},
        }
        state: dict[str, object] = {}

        with self.assertRaisesRegex(RuntimeError, "no state progress"):
            record_cycle_activity(
                state=state,
                cycle_tracker=tracker,
                iteration=1,
                node_name="agent",
                selected_edge_ids={"edge-back"},
                state_writes=[],
            )

        self.assertEqual(state["cycle_summary"]["stop_reason"], "no_state_change")
        self.assertEqual(serialize_cycle_records(tracker, final_stop_reason="no_state_change")[-1]["stop_reason"], "no_state_change")

    def test_finalize_non_cycle_summary_uses_node_executions_and_active_edges(self) -> None:
        state = {"node_executions": [{"node_id": "input"}, {"node_id": "agent"}]}

        finalize_langgraph_cycle_summary(state, {"has_cycle": False}, {"edge-2", "edge-1"})

        self.assertEqual(
            state["cycle_summary"],
            {
                "has_cycle": False,
                "back_edges": [],
                "iteration_count": 1,
                "max_iterations": 0,
                "stop_reason": "completed",
            },
        )
        self.assertEqual(state["cycle_iterations"][0]["executed_node_ids"], ["input", "agent"])
        self.assertEqual(state["cycle_iterations"][0]["activated_edge_ids"], ["edge-1", "edge-2"])


if __name__ == "__main__":
    unittest.main()
