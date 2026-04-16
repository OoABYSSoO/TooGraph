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


if __name__ == "__main__":
    unittest.main()
