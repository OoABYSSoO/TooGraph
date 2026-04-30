from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.run_progress import persist_run_progress


class RuntimeProgressPersistenceTests(unittest.TestCase):
    def test_persist_run_progress_refreshes_saves_and_publishes_update_event(self) -> None:
        calls: list[tuple[str, object]] = []
        state = {
            "run_id": "run-1",
            "status": "running",
            "current_node_id": "agent",
            "duration_ms": 123,
            "lifecycle": {"updated_at": "now"},
        }
        node_outputs = {"agent": {"outputs": {"answer": "ok"}}}
        active_edge_ids = {"edge-1"}

        persist_run_progress(
            state,
            node_outputs,
            active_edge_ids,
            started_perf=10.0,
            refresh_run_artifacts_func=lambda *args, **kwargs: calls.append(("refresh", (args, kwargs))),
            touch_run_lifecycle_func=lambda current_state: calls.append(("touch", current_state)),
            save_run_func=lambda current_state: calls.append(("save", current_state)),
            publish_run_event_func=lambda run_id, event_type, payload: calls.append(
                ("publish", {"run_id": run_id, "event_type": event_type, "payload": payload})
            ),
        )

        refresh_args, refresh_kwargs = calls[0][1]
        self.assertEqual(refresh_args, (state, node_outputs, active_edge_ids))
        self.assertEqual(refresh_kwargs, {"started_perf": 10.0})
        self.assertEqual(calls[1], ("touch", state))
        self.assertEqual(calls[2], ("save", state))
        self.assertEqual(
            calls[3],
            (
                "publish",
                {
                    "run_id": "run-1",
                    "event_type": "run.updated",
                    "payload": {
                        "status": "running",
                        "current_node_id": "agent",
                        "duration_ms": 123,
                        "updated_at": "now",
                    },
                },
            ),
        )


if __name__ == "__main__":
    unittest.main()
