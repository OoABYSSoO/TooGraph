from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.progress import persist_langgraph_progress


class LangGraphProgressTest(unittest.TestCase):
    def test_persist_langgraph_progress_syncs_checkpoint_before_run_progress(self) -> None:
        calls: list[tuple[str, object, object, object, object | None]] = []
        state = {"run_id": "run-1"}
        node_outputs = {"agent": {"answer": "ok"}}
        active_edge_ids = {"edge-1"}
        checkpoint_saver = SimpleNamespace(name="saver")
        checkpoint_lookup_config = {"configurable": {"thread_id": "run-1"}}

        persist_langgraph_progress(
            state,
            node_outputs,
            active_edge_ids,
            started_perf=12.5,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            sync_checkpoint_metadata_func=lambda current_state, saver, lookup: calls.append(
                ("sync", current_state, saver, lookup, None)
            ),
            persist_run_progress_func=lambda current_state, outputs, edges, *, started_perf: calls.append(
                ("persist", current_state, outputs, edges, started_perf)
            ),
        )

        self.assertEqual(
            calls,
            [
                ("sync", state, checkpoint_saver, checkpoint_lookup_config, None),
                ("persist", state, node_outputs, active_edge_ids, 12.5),
            ],
        )


if __name__ == "__main__":
    unittest.main()
