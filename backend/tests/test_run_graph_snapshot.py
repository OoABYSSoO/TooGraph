from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.templates.loader import load_template_record


class RunGraphSnapshotTest(unittest.TestCase):
    def test_run_uses_request_payload_without_auto_saving_main_graph(self) -> None:
        template = load_template_record("cycle_counter_demo")
        payload = {
            "graph_id": None,
            "name": template["default_graph_name"],
            "state_schema": {
                **template["state_schema"],
                "counter": {
                    **template["state_schema"]["counter"],
                    "value": 9,
                },
            },
            "nodes": {
                **template["nodes"],
                "increment_counter": {
                    **template["nodes"]["increment_counter"],
                    "config": {
                        **template["nodes"]["increment_counter"]["config"],
                        "taskInstruction": "读取输入 counter，并严格只返回 JSON：{\"counter\": 当前 counter + 9}。不要输出任何解释。",
                    },
                },
            },
            "edges": template["edges"],
            "conditional_edges": template["conditional_edges"],
            "metadata": template["metadata"],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            graph_dir = root / "graphs"
            run_dir = root / "runs"
            checkpoint_dir = root / "checkpoints"
            data_dir = root / "data"
            db_path = data_dir / "graphiteui.db"

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.database.RUN_DATA_DIR", run_dir),
                patch("app.core.storage.database.CHECKPOINT_DATA_DIR", checkpoint_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.run_store.RUN_DATA_DIR", run_dir),
                patch("app.core.langgraph.checkpoints.CHECKPOINT_DATA_DIR", checkpoint_dir),
                patch("app.api.routes_graphs.execute_node_system_graph_langgraph", side_effect=lambda graph, run_state, persist_progress=True: run_state),
            ):
                with TestClient(app) as client:
                    response = client.post("/api/graphs/run", json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    run_id = response.json()["run_id"]

                    self.assertFalse(graph_dir.exists() and any(graph_dir.iterdir()))

                    detail_response = client.get(f"/api/runs/{run_id}")
                    self.assertEqual(detail_response.status_code, 200, detail_response.text)
                    run_detail = detail_response.json()
                    graph_snapshot = run_detail.get("graph_snapshot")
                    self.assertIsInstance(graph_snapshot, dict)
                    self.assertEqual(graph_snapshot["state_schema"]["counter"]["value"], 9)
                    self.assertEqual(
                        graph_snapshot["nodes"]["increment_counter"]["config"]["taskInstruction"],
                        "读取输入 counter，并严格只返回 JSON：{\"counter\": 当前 counter + 9}。不要输出任何解释。",
                    )


if __name__ == "__main__":
    unittest.main()
