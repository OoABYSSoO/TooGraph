from __future__ import annotations

import sys
import tempfile
import unittest
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.core.storage import database
from app.core.storage.graph_run_db_store import load_run_state, save_run_state


@contextmanager
def _temporary_run_database():
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir) / "data"
        with (
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
        ):
            database.initialize_storage()
            yield


def _run_state_with_permission_approval(secret_value: str) -> dict:
    return {
        "run_id": "run_permission_audit",
        "graph_id": "graph_permission_audit",
        "graph_name": "Permission Audit",
        "status": "completed",
        "started_at": "2026-05-28T00:00:00Z",
        "completed_at": "2026-05-28T00:00:02Z",
        "duration_ms": 2000,
        "runtime_backend": "langgraph",
        "metadata": {"origin": "test"},
        "lifecycle": {},
        "checkpoint_metadata": {},
        "graph_snapshot": {},
        "permission_approvals": [
            {
                "kind": "capability_permission_approval",
                "approval_id": "approval-1",
                "node_id": "execute_capability",
                "capability_kind": "action",
                "capability_key": "local_workspace_executor",
                "binding_source": "capability_state",
                "permissions": ["file_write"],
                "inputs": {"operation": "write", "content": f"OPENAI_API_KEY={secret_value}"},
                "input_preview": f"OPENAI_API_KEY={secret_value}",
                "status": "approved",
                "resume_payload": {"permission_approval": {"decision": "approved", "token": secret_value}},
                "approved_at": "2026-05-28T00:00:01Z",
            }
        ],
    }


class GraphRunDbStorePermissionAuditTests(unittest.TestCase):
    def test_permission_approval_audit_persists_without_secret_plaintext(self) -> None:
        secret_value = "sk-approvalsecretvalue1234567890"
        with _temporary_run_database():
            save_run_state(_run_state_with_permission_approval(secret_value))
            loaded = load_run_state("run_permission_audit")

        approvals = loaded["permission_approvals"]
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0]["approval_id"], "approval-1")
        self.assertEqual(approvals[0]["status"], "approved")
        self.assertEqual(approvals[0]["permissions"], ["file_write"])
        serialized = str(approvals[0])
        self.assertNotIn(secret_value, serialized)
        self.assertIn("[REDACTED_SECRET]", serialized)

    def test_run_detail_api_returns_permission_approval_audit(self) -> None:
        secret_value = "sk-apisecretvalue1234567890"
        with _temporary_run_database():
            save_run_state(_run_state_with_permission_approval(secret_value))
            with TestClient(app) as client:
                response = client.get("/api/runs/run_permission_audit")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        approvals = payload["permission_approvals"]
        self.assertEqual(approvals[0]["approval_id"], "approval-1")
        self.assertEqual(approvals[0]["status"], "approved")
        serialized = str(approvals[0])
        self.assertNotIn(secret_value, serialized)
        self.assertIn("[REDACTED_SECRET]", serialized)

    def test_run_record_runtime_logs_persist_without_secret_plaintext(self) -> None:
        secret_value = "sk-runrecordsecretvalue1234567890"
        run_state = {
            "run_id": "run_secret_runtime_logs",
            "graph_id": "graph_secret_runtime_logs",
            "graph_name": "Secret Runtime Logs",
            "status": "failed",
            "started_at": "2026-05-28T00:00:00Z",
            "completed_at": "2026-05-28T00:00:02Z",
            "duration_ms": 2000,
            "runtime_backend": "langgraph",
            "metadata": {"diagnostic": f"OPENAI_API_KEY={secret_value}"},
            "lifecycle": {},
            "checkpoint_metadata": {},
            "graph_snapshot": {},
            "state_values": {"raw_error": f"provider returned OPENAI_API_KEY={secret_value}"},
            "warnings": [f"warning leaked {secret_value}"],
            "errors": [f"error leaked {secret_value}"],
            "activity_events": [
                {
                    "kind": "action_invocation",
                    "summary": f"Action failed with {secret_value}",
                    "detail": {"stderr": f"OPENAI_API_KEY={secret_value}"},
                }
            ],
            "node_executions": [
                {
                    "execution_id": "exec_secret",
                    "node_id": "agent",
                    "node_type": "agent",
                    "status": "failed",
                    "input_summary": f"input {secret_value}",
                    "output_summary": f"output {secret_value}",
                    "artifacts": {"stderr": f"OPENAI_API_KEY={secret_value}"},
                    "warnings": [f"node warning {secret_value}"],
                    "errors": [f"node error {secret_value}"],
                }
            ],
            "action_outputs": [
                {
                    "node_id": "execute_capability",
                    "action_key": "web_search",
                    "status": "failed",
                    "error_type": "tool_runtime_error",
                    "error": f"OPENAI_API_KEY={secret_value}",
                    "outputs": {"stderr": f"OPENAI_API_KEY={secret_value}"},
                }
            ],
            "output_previews": [
                {
                    "node_id": "output",
                    "source_kind": "state",
                    "source_key": "raw_error",
                    "display_mode": "markdown",
                    "value": f"OPENAI_API_KEY={secret_value}",
                }
            ],
        }
        with _temporary_run_database():
            save_run_state(run_state)
            loaded = load_run_state("run_secret_runtime_logs")
            with sqlite3.connect(database.DB_PATH) as connection:
                connection.row_factory = sqlite3.Row
                graph_run = connection.execute(
                    "SELECT metadata_json, detail_json, final_result FROM graph_runs WHERE run_id = ?",
                    ("run_secret_runtime_logs",),
                ).fetchone()
                node_execution = connection.execute(
                    "SELECT input_summary, output_summary, artifacts_json, warnings_json, errors_json FROM graph_node_executions WHERE run_id = ?",
                    ("run_secret_runtime_logs",),
                ).fetchone()
                run_event = connection.execute(
                    "SELECT payload_json FROM graph_run_events WHERE run_id = ?",
                    ("run_secret_runtime_logs",),
                ).fetchone()
                capability = connection.execute(
                    "SELECT output_json, error_json FROM graph_capability_invocations WHERE run_id = ?",
                    ("run_secret_runtime_logs",),
                ).fetchone()
                usage = connection.execute(
                    "SELECT error_message, summary, detail_json FROM capability_usage_events WHERE run_id = ?",
                    ("run_secret_runtime_logs",),
                ).fetchone()

        serialized = "\n".join(
            [
                str(loaded),
                str(dict(graph_run)),
                str(dict(node_execution)),
                str(dict(run_event)),
                str(dict(capability)),
                str(dict(usage)),
            ]
        )
        self.assertNotIn(secret_value, serialized)
        self.assertIn("[REDACTED_SECRET]", serialized)


if __name__ == "__main__":
    unittest.main()
