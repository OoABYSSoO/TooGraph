from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.run import RunDetail, RunSummary


class RunSchemaNullableGraphIdTests(unittest.TestCase):
    def test_run_summary_accepts_null_graph_id(self) -> None:
        summary = RunSummary.model_validate(
            {
                "run_id": "run_test",
                "graph_id": None,
                "graph_name": "Unsaved Graph",
                "status": "completed",
                "started_at": "2026-04-16T12:00:00Z",
            }
        )

        self.assertIsNone(summary.graph_id)
        self.assertEqual(summary.graph_name, "Unsaved Graph")

    def test_run_detail_accepts_null_graph_id(self) -> None:
        detail = RunDetail.model_validate(
            {
                "run_id": "run_test",
                "graph_id": None,
                "graph_name": "Unsaved Graph",
                "status": "completed",
                "started_at": "2026-04-16T12:00:00Z",
                "node_executions": [],
                "artifacts": {},
            }
        )

        self.assertIsNone(detail.graph_id)
        self.assertEqual(detail.graph_name, "Unsaved Graph")

    def test_run_detail_accepts_run_snapshots(self) -> None:
        detail = RunDetail.model_validate(
            {
                "run_id": "run_test",
                "graph_id": None,
                "graph_name": "Unsaved Graph",
                "status": "completed",
                "started_at": "2026-04-16T12:00:00Z",
                "node_executions": [],
                "artifacts": {},
                "run_snapshots": [
                    {
                        "snapshot_id": "completed_1",
                        "kind": "completed",
                        "label": "Completed",
                        "created_at": "2026-04-16T12:00:30Z",
                        "status": "completed",
                        "current_node_id": None,
                        "checkpoint_metadata": {
                            "available": True,
                            "checkpoint_id": "checkpoint-1",
                            "thread_id": "run_test",
                            "checkpoint_ns": "",
                            "saver": "json_checkpoint_saver",
                        },
                        "state_snapshot": {"values": {}, "last_writers": {}},
                        "graph_snapshot": {},
                        "artifacts": {},
                        "node_status_map": {},
                        "output_previews": [],
                    }
                ],
            }
        )

        self.assertEqual(detail.run_snapshots[0].snapshot_id, "completed_1")
        self.assertEqual(detail.run_snapshots[0].checkpoint_metadata.checkpoint_id, "checkpoint-1")


if __name__ == "__main__":
    unittest.main()
