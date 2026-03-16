from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.finalization import (
    finalize_completed_langgraph_state,
    finalize_failed_langgraph_state,
)


class LangGraphFinalizationTest(unittest.TestCase):
    def test_finalize_completed_state_runs_completion_side_effects_in_order(self) -> None:
        calls: list[tuple[str, object]] = []
        state = {"run_id": "run-1", "current_node_id": "agent"}
        graph = SimpleNamespace(name="graph")
        active_edge_ids = {"edge-1"}
        cycle_tracker = {"has_cycle": False}
        node_outputs = {"agent": {"answer": "ok"}}
        checkpoint_saver = SimpleNamespace(name="saver")
        checkpoint_lookup_config = {"configurable": {"thread_id": "run-1"}}

        result = finalize_completed_langgraph_state(
            graph,
            state,
            active_edge_ids,
            cycle_tracker,
            node_outputs,
            started_perf=9.5,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            append_snapshot=True,
            clear_pending_interrupt_metadata_func=lambda current_state: calls.append(("clear", current_state)),
            set_run_status_func=lambda current_state, status: (
                current_state.__setitem__("status", status),
                calls.append(("status", status)),
            ),
            collect_output_boundaries_func=lambda current_graph, current_state, edges: calls.append(
                ("outputs", (current_graph, current_state, edges))
            ),
            finalize_cycle_summary_func=lambda current_state, tracker, edges: calls.append(
                ("cycle", (current_state, tracker, edges))
            ),
            sync_checkpoint_metadata_func=lambda current_state, saver, lookup: calls.append(
                ("sync", (current_state, saver, lookup))
            ),
            refresh_run_artifacts_func=lambda current_state, outputs, edges, *, started_perf: calls.append(
                ("refresh", (current_state, outputs, edges, started_perf))
            ),
            next_run_snapshot_id_func=lambda current_state, kind: f"{kind}-snapshot",
            append_run_snapshot_func=lambda current_state, **kwargs: calls.append(("snapshot", kwargs)),
            save_run_func=lambda current_state: calls.append(("save", current_state)),
            publish_run_event_func=lambda run_id, event_type, payload: calls.append(
                ("event", (run_id, event_type, payload))
            ),
        )

        self.assertIs(result, state)
        self.assertIsNone(state["current_node_id"])
        self.assertEqual(state["status"], "completed")
        self.assertEqual(
            [call[0] for call in calls],
            ["clear", "status", "outputs", "cycle", "sync", "refresh", "snapshot", "save", "event"],
        )
        self.assertEqual(calls[-1][1], ("run-1", "run.completed", {"status": "completed"}))

    def test_finalize_failed_state_records_error_and_failure_snapshot(self) -> None:
        calls: list[tuple[str, object]] = []
        state = {"run_id": "run-1", "errors": ["existing"]}
        node_outputs = {"agent": {}}
        active_edge_ids = {"edge-1"}
        checkpoint_saver = SimpleNamespace(name="saver")
        checkpoint_lookup_config = {"configurable": {"thread_id": "run-1"}}

        finalize_failed_langgraph_state(
            state,
            node_outputs,
            active_edge_ids,
            exc=ValueError("boom"),
            started_perf=4.0,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            set_run_status_func=lambda current_state, status: (
                current_state.__setitem__("status", status),
                calls.append(("status", status)),
            ),
            sync_checkpoint_metadata_func=lambda current_state, saver, lookup: calls.append(
                ("sync", (current_state, saver, lookup))
            ),
            refresh_run_artifacts_func=lambda current_state, outputs, edges, *, started_perf: calls.append(
                ("refresh", (current_state, outputs, edges, started_perf))
            ),
            next_run_snapshot_id_func=lambda current_state, kind: f"{kind}-snapshot",
            append_run_snapshot_func=lambda current_state, **kwargs: calls.append(("snapshot", kwargs)),
            save_run_func=lambda current_state: calls.append(("save", current_state)),
            publish_run_event_func=lambda run_id, event_type, payload: calls.append(
                ("event", (run_id, event_type, payload))
            ),
        )

        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["errors"], ["existing", "boom"])
        self.assertEqual([call[0] for call in calls], ["status", "sync", "refresh", "snapshot", "save", "event"])
        self.assertEqual(calls[-1][1], ("run-1", "run.failed", {"status": "failed", "error": "boom"}))


if __name__ == "__main__":
    unittest.main()
