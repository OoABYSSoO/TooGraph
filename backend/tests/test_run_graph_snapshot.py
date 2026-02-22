from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.storage.run_store import save_run
from app.templates.loader import load_template_record


class RunGraphSnapshotTest(unittest.TestCase):
    def test_run_list_exposes_restore_flag_only_for_valid_graph_snapshots(self) -> None:
        restorable_run = create_initial_run_state(
            graph_id="graph_valid",
            graph_name="可恢复运行",
            max_revision_round=1,
        )
        restorable_run["runtime_backend"] = "langgraph"
        restorable_run["graph_snapshot"] = {
            "graph_id": "graph_valid",
            "name": "可恢复运行",
            "state_schema": {},
            "nodes": {},
            "edges": [],
            "conditional_edges": [],
            "metadata": {},
        }
        set_run_status(restorable_run, "completed")
        touch_run_lifecycle(restorable_run)

        malformed_run = create_initial_run_state(
            graph_id="graph_invalid",
            graph_name="不可恢复运行",
            max_revision_round=1,
        )
        malformed_run["runtime_backend"] = "langgraph"
        malformed_run["graph_snapshot"] = {}
        set_run_status(malformed_run, "completed")
        touch_run_lifecycle(malformed_run)

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
                patch("app.core.storage.run_store.RUN_DATA_DIR", run_dir),
                patch("app.core.langgraph.checkpoints.CHECKPOINT_DATA_DIR", checkpoint_dir),
            ):
                save_run(restorable_run)
                save_run(malformed_run)

                with TestClient(app) as client:
                    response = client.get("/api/runs")

                self.assertEqual(response.status_code, 200, response.text)
                runs = {item["run_id"]: item for item in response.json()}
                self.assertTrue(runs[restorable_run["run_id"]]["restorable_snapshot_available"])
                self.assertFalse(runs[malformed_run["run_id"]]["restorable_snapshot_available"])

    def test_run_list_exposes_lightweight_snapshot_restore_options(self) -> None:
        run = create_initial_run_state(
            graph_id="graph_valid",
            graph_name="可切换快照运行",
            max_revision_round=1,
        )
        run["runtime_backend"] = "langgraph"
        run["graph_snapshot"] = {
            "graph_id": "graph_valid",
            "name": "可切换快照运行",
            "state_schema": {},
            "nodes": {},
            "edges": [],
            "conditional_edges": [],
            "metadata": {},
        }
        run["run_snapshots"] = [
            {
                "snapshot_id": "pause_1",
                "kind": "pause",
                "label": "Paused at writer",
                "created_at": "2026-04-16T12:00:10Z",
                "status": "awaiting_human",
                "current_node_id": "writer",
                "checkpoint_metadata": {"available": True},
                "state_snapshot": {"values": {}, "last_writers": {}},
                "graph_snapshot": run["graph_snapshot"],
                "artifacts": {},
                "node_status_map": {},
                "output_previews": [],
            },
            {
                "snapshot_id": "completed_1",
                "kind": "completed",
                "label": "Completed",
                "created_at": "2026-04-16T12:00:20Z",
                "status": "completed",
                "current_node_id": None,
                "checkpoint_metadata": {"available": True},
                "state_snapshot": {"values": {}, "last_writers": {}},
                "graph_snapshot": run["graph_snapshot"],
                "artifacts": {},
                "node_status_map": {},
                "output_previews": [],
            },
        ]
        set_run_status(run, "completed")
        touch_run_lifecycle(run)

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
                patch("app.core.storage.run_store.RUN_DATA_DIR", run_dir),
                patch("app.core.langgraph.checkpoints.CHECKPOINT_DATA_DIR", checkpoint_dir),
            ):
                save_run(run)

                with TestClient(app) as client:
                    response = client.get("/api/runs")

                self.assertEqual(response.status_code, 200, response.text)
                [run_summary] = response.json()
                self.assertEqual(
                    run_summary["run_snapshot_options"],
                    [
                        {
                            "snapshot_id": "pause_1",
                            "kind": "pause",
                            "label": "Paused at writer",
                            "status": "awaiting_human",
                            "current_node_id": "writer",
                        },
                        {
                            "snapshot_id": "completed_1",
                            "kind": "completed",
                            "label": "Completed",
                            "status": "completed",
                            "current_node_id": None,
                        },
                    ],
                )

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
                        "thinkingMode": "low",
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
                    self.assertEqual(graph_snapshot["nodes"]["increment_counter"]["config"]["thinkingMode"], "low")
                    self.assertEqual(
                        graph_snapshot["nodes"]["increment_counter"]["config"]["taskInstruction"],
                        "读取输入 counter，并严格只返回 JSON：{\"counter\": 当前 counter + 9}。不要输出任何解释。",
                    )

    def test_resume_uses_saved_run_snapshot_instead_of_current_graph_store(self) -> None:
        template = load_template_record("hello_world")
        graph_snapshot = {
            "graph_id": "runtime_snapshot_graph",
            "name": template["default_graph_name"],
            "state_schema": template["state_schema"],
            "nodes": template["nodes"],
            "edges": template["edges"],
            "conditional_edges": template["conditional_edges"],
            "metadata": template["metadata"],
        }
        previous_run = create_initial_run_state(
            graph_id="missing_saved_graph",
            graph_name=template["default_graph_name"],
            max_revision_round=1,
        )
        previous_run["runtime_backend"] = "langgraph"
        previous_run["graph_snapshot"] = graph_snapshot
        previous_run["checkpoint_metadata"] = {
            "available": True,
            "checkpoint_id": "checkpoint-1",
            "thread_id": "thread-1",
            "checkpoint_ns": "",
            "saver": "json_checkpoint_saver",
        }
        set_run_status(previous_run, "awaiting_human", pause_reason="breakpoint")
        previous_run["node_status_map"] = {
            "input_name": "success",
            "greeting_agent": "success",
            "output_greeting": "success",
        }
        previous_run["output_previews"] = [
            {
                "node_id": "output_greeting",
                "label": "greeting",
                "source_kind": "state",
                "source_key": "greeting",
                "display_mode": "markdown",
                "persist_enabled": False,
                "persist_format": "auto",
                "value": "上一轮输出",
            }
        ]
        previous_run["artifacts"] = {
            **previous_run.get("artifacts", {}),
            "output_previews": list(previous_run["output_previews"]),
            "exported_outputs": [
                {
                    **previous_run["output_previews"][0],
                    "saved_file": None,
                }
            ],
            "active_edge_ids": ["edge:greeting_agent:output_greeting"],
        }
        touch_run_lifecycle(previous_run)

        captured: dict[str, object] = {}

        def _capture_resume(graph, initial_state=None, persist_progress=True, resume_from_checkpoint=False, resume_command=None):
            captured["graph_id"] = graph.graph_id
            captured["graph_name"] = graph.name
            captured["state_keys"] = sorted(graph.state_schema.keys())
            captured["resume_command"] = resume_command
            captured["initial_state"] = initial_state
            return initial_state

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
                patch("app.core.storage.run_store.RUN_DATA_DIR", run_dir),
                patch("app.core.langgraph.checkpoints.CHECKPOINT_DATA_DIR", checkpoint_dir),
                patch("app.api.routes_runs.execute_node_system_graph_langgraph", side_effect=_capture_resume),
            ):
                save_run(previous_run)

                with TestClient(app) as client:
                    response = client.post(
                        f"/api/runs/{previous_run['run_id']}/resume",
                        json={"resume": {"name": "人工确认"}},
                    )

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["run_id"], previous_run["run_id"])
                self.assertEqual(captured["graph_id"], "runtime_snapshot_graph")
                self.assertEqual(captured["graph_name"], "Hello World")
                self.assertEqual(captured["state_keys"], ["greeting", "name"])
                self.assertEqual(captured["resume_command"], {"name": "人工确认"})
                initial_state = captured["initial_state"]
                self.assertIsInstance(initial_state, dict)
                self.assertEqual(initial_state["node_status_map"]["greeting_agent"], "success")
                self.assertEqual(initial_state["output_previews"][0]["node_id"], "output_greeting")
                self.assertEqual(initial_state["artifacts"]["exported_outputs"][0]["node_id"], "output_greeting")
                self.assertEqual(initial_state["artifacts"]["active_edge_ids"], ["edge:greeting_agent:output_greeting"])

    def test_resume_can_target_a_historical_pause_snapshot(self) -> None:
        template = load_template_record("hello_world")
        graph_snapshot = {
            "graph_id": "runtime_snapshot_graph",
            "name": template["default_graph_name"],
            "state_schema": template["state_schema"],
            "nodes": template["nodes"],
            "edges": template["edges"],
            "conditional_edges": template["conditional_edges"],
            "metadata": template["metadata"],
        }
        previous_run = create_initial_run_state(
            graph_id="runtime_snapshot_graph",
            graph_name=template["default_graph_name"],
            max_revision_round=1,
        )
        previous_run["runtime_backend"] = "langgraph"
        previous_run["graph_snapshot"] = graph_snapshot
        previous_run["checkpoint_metadata"] = {
            "available": True,
            "checkpoint_id": "checkpoint-final",
            "thread_id": previous_run["run_id"],
            "checkpoint_ns": "",
            "saver": "json_checkpoint_saver",
        }
        previous_run["run_snapshots"] = [
            {
                "snapshot_id": "pause_1",
                "kind": "pause",
                "label": "Paused at greeting_agent",
                "created_at": "2026-04-24T00:00:00Z",
                "status": "awaiting_human",
                "current_node_id": "greeting_agent",
                "checkpoint_metadata": {
                    "available": True,
                    "checkpoint_id": "checkpoint-pause",
                    "thread_id": previous_run["run_id"],
                    "checkpoint_ns": "",
                    "saver": "json_checkpoint_saver",
                },
                "state_snapshot": {
                    "values": {
                        "name": "GraphiteUI",
                        "greeting": "draft",
                    },
                    "last_writers": {},
                },
                "graph_snapshot": graph_snapshot,
                "artifacts": {
                    "output_previews": [
                        {
                            "node_id": "output_greeting",
                            "label": "Greeting",
                            "source_kind": "state",
                            "source_key": "greeting",
                            "display_mode": "text",
                            "persist_enabled": False,
                            "persist_format": "auto",
                            "value": "draft",
                        }
                    ],
                    "exported_outputs": [],
                    "active_edge_ids": ["edge:input_name:greeting_agent"],
                },
                "node_status_map": {
                    "input_name": "success",
                    "greeting_agent": "paused",
                },
                "output_previews": [
                    {
                        "node_id": "output_greeting",
                        "label": "Greeting",
                        "source_kind": "state",
                        "source_key": "greeting",
                        "display_mode": "text",
                        "persist_enabled": False,
                        "persist_format": "auto",
                        "value": "draft",
                    }
                ],
                "final_result": "draft",
            }
        ]
        set_run_status(previous_run, "completed")
        previous_run["final_result"] = "final"
        previous_run["output_previews"] = [
            {
                "node_id": "output_greeting",
                "label": "Greeting",
                "source_kind": "state",
                "source_key": "greeting",
                "display_mode": "text",
                "persist_enabled": False,
                "persist_format": "auto",
                "value": "final",
            }
        ]
        previous_run["artifacts"] = {
            "output_previews": list(previous_run["output_previews"]),
            "exported_outputs": [],
            "active_edge_ids": ["edge:greeting_agent:output_greeting"],
        }
        touch_run_lifecycle(previous_run)

        captured: dict[str, object] = {}

        def _capture_resume(graph, initial_state=None, persist_progress=True, resume_from_checkpoint=False, resume_command=None):
            captured["initial_state"] = initial_state
            captured["resume_command"] = resume_command
            return initial_state

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
                patch("app.core.storage.run_store.RUN_DATA_DIR", run_dir),
                patch("app.core.langgraph.checkpoints.CHECKPOINT_DATA_DIR", checkpoint_dir),
                patch("app.api.routes_runs.execute_node_system_graph_langgraph", side_effect=_capture_resume),
            ):
                save_run(previous_run)

                with TestClient(app) as client:
                    response = client.post(
                        f"/api/runs/{previous_run['run_id']}/resume",
                        json={"snapshot_id": "pause_1", "resume": {"name": "人工确认"}},
                    )

                self.assertEqual(response.status_code, 200, response.text)
                initial_state = captured["initial_state"]
                self.assertIsInstance(initial_state, dict)
                self.assertEqual(initial_state["status"], "resuming")
                self.assertEqual(initial_state["current_node_id"], "greeting_agent")
                self.assertEqual(initial_state["checkpoint_metadata"]["checkpoint_id"], "checkpoint-pause")
                self.assertEqual(initial_state["output_previews"][0]["value"], "draft")
                self.assertEqual(initial_state["final_result"], "draft")
                self.assertEqual(captured["resume_command"], {"name": "人工确认"})


if __name__ == "__main__":
    unittest.main()
