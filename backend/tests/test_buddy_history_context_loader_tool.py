from __future__ import annotations

import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "buddy_history_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database
from app.core.storage.context_assembly_store import expand_context_assembly_ref


def _load_history_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("buddy_history_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_history_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddyHistoryContextLoaderToolTests(unittest.TestCase):
    def test_official_catalog_exposes_history_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_history_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy History Context Loader")
        self.assertIn("conversation history", definition.description)
        self.assertIn("buddy_history_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_outputs_context_assembly_ref_from_runtime_session_context(self) -> None:
        module = _load_history_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                with sqlite3.connect(database.DB_PATH) as connection:
                    _insert_session(connection, "session_history")
                    _insert_message(connection, "msg_q1", "session_history", "user", "Q1", 0)
                    _insert_message(connection, "msg_a1", "session_history", "assistant", "A1", 1)
                    _insert_message(connection, "msg_q2", "session_history", "user", "Q2", 2)
                    connection.commit()

                result = module.buddy_history_context_loader(
                    {"user_message": "Q2", "max_messages": 12, "max_chars": 4000},
                    context={
                        "run_id": "run_history",
                        "buddy_session_id": "session_history",
                        "buddy_current_message_id": "msg_q2",
                    },
                )
                history_ref = result["conversation_history"]
                expanded = expand_context_assembly_ref(history_ref)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(history_ref["kind"], "context_assembly_ref")
        self.assertEqual([ref["source_id"] for ref in history_ref["source_refs"]], ["msg_q1", "msg_a1"])
        self.assertIn("Q1", expanded["text"])
        self.assertIn("A1", expanded["text"])
        self.assertNotIn("Q2", expanded["text"])
        self.assertEqual(result["current_session_id"], "session_history")
        self.assertEqual(result["source_run_id"], "run_history")
        self.assertEqual(result["history_context_report"]["current_message_id"], "msg_q2")
        self.assertEqual(result["history_context_report"]["source_run_id"], "run_history")

    def test_loader_returns_empty_history_without_buddy_session_context(self) -> None:
        module = _load_history_tool_module()

        result = module.buddy_history_context_loader({"user_message": "standalone"}, context={})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["conversation_history"]["kind"], "context_assembly_ref")
        self.assertEqual(result["conversation_history"]["source_refs"], [])
        self.assertEqual(result["current_session_id"], "")
        self.assertEqual(result["history_context_report"]["scope"], "standalone_run")


def _insert_session(connection: sqlite3.Connection, session_id: str) -> None:
    connection.execute(
        """
        INSERT INTO buddy_sessions (
            session_id, title, archived, deleted, source, created_at, updated_at
        ) VALUES (?, ?, 0, 0, 'buddy', ?, ?)
        """,
        (session_id, "历史测试", "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z"),
    )


def _insert_message(
    connection: sqlite3.Connection,
    message_id: str,
    session_id: str,
    role: str,
    content: str,
    client_order: int,
) -> None:
    connection.execute(
        """
        INSERT INTO buddy_messages (
            message_id,
            session_id,
            role,
            content,
            client_order,
            include_in_context,
            run_id,
            metadata_json,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, NULL, '{}', ?, ?)
        """,
        (message_id, session_id, role, content, client_order, "2026-05-26T00:00:01Z", "2026-05-26T00:00:01Z"),
    )


if __name__ == "__main__":
    unittest.main()
