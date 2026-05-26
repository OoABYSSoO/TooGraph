from __future__ import annotations

import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.run_progress import persist_run_progress
from app.core.storage import database


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

    def test_persist_run_progress_writes_running_run_and_node_execution_to_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            state = {
                "run_id": "run-progress-db",
                "root_run_id": "run-progress-db",
                "run_path": ["run-progress-db"],
                "graph_id": "graph_progress",
                "graph_name": "Progress Graph",
                "status": "running",
                "runtime_backend": "langgraph",
                "current_node_id": "agent",
                "started_at": "2026-05-26T00:00:00Z",
                "lifecycle": {"updated_at": "2026-05-26T00:00:00Z"},
                "checkpoint_metadata": {},
                "node_executions": [
                    {
                        "execution_id": "exec-agent",
                        "node_id": "agent",
                        "node_type": "agent",
                        "status": "running",
                        "started_at": "2026-05-26T00:00:00Z",
                        "finished_at": None,
                        "duration_ms": 0,
                        "warnings": ["slow"],
                        "errors": [],
                    }
                ],
            }

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            ):
                database.initialize_storage()
                persist_run_progress(
                    state,
                    {"agent": {"answer": "ok"}},
                    {"edge-1"},
                    started_perf=time.perf_counter(),
                    publish_run_event_func=lambda *_args, **_kwargs: None,
                )
                with sqlite3.connect(data_dir / "toograph.db") as connection:
                    run_row = connection.execute(
                        "SELECT status, current_node_id FROM graph_runs WHERE run_id = ?",
                        ("run-progress-db",),
                    ).fetchone()
                    execution_row = connection.execute(
                        """
                        SELECT order_index, node_id, node_type, duration_ms, warnings_json, errors_json
                        FROM graph_node_executions
                        WHERE run_id = ?
                        """,
                        ("run-progress-db",),
                    ).fetchone()

        self.assertEqual(run_row, ("running", "agent"))
        self.assertEqual(execution_row[0:4], (0, "agent", "agent", 0))
        self.assertEqual(execution_row[4], '["slow"]')
        self.assertEqual(execution_row[5], "[]")

    def test_persist_run_progress_writes_capability_invocations_to_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            state = {
                "run_id": "run-capability-db",
                "root_run_id": "run-capability-db",
                "run_path": ["run-capability-db"],
                "graph_id": "graph_capability",
                "graph_name": "Capability Graph",
                "status": "running",
                "started_at": "2026-05-26T00:00:00Z",
                "lifecycle": {"updated_at": "2026-05-26T00:00:00Z"},
                "capability_outputs": [
                    {
                        "invocation_id": "invoke-search",
                        "node_id": "execute_capability",
                        "capability_key": "web_search",
                        "status": "completed",
                        "outputs": {"results": []},
                    }
                ],
            }

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            ):
                database.initialize_storage()
                persist_run_progress(
                    state,
                    {},
                    set(),
                    started_perf=time.perf_counter(),
                    publish_run_event_func=lambda *_args, **_kwargs: None,
                )
                with sqlite3.connect(data_dir / "toograph.db") as connection:
                    row = connection.execute(
                        """
                        SELECT capability_kind, capability_key, status
                        FROM graph_capability_invocations
                        WHERE invocation_id = ?
                        """,
                        ("invoke-search",),
                    ).fetchone()

        self.assertEqual(row, ("capability", "web_search", "completed"))


if __name__ == "__main__":
    unittest.main()
