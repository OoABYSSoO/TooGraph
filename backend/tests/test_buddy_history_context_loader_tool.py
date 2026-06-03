from __future__ import annotations

import importlib.util
import json
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
from app.core.storage.context_assembly_store import expand_context_package


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
        self.assertEqual(definition.name, "Buddy Session History Loader")
        self.assertIn("对话历史", definition.description)
        self.assertIn("buddy_history_context_loader", get_tool_registry(include_disabled=True).keys())
        manifest = json.loads((TOOL_DIR / "tool.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["inputSchema"], [])
        self.assertNotIn("user_message", json.dumps(manifest, ensure_ascii=False))
        self.assertNotIn("max_messages", json.dumps(manifest, ensure_ascii=False))
        self.assertNotIn("max_chars", json.dumps(manifest, ensure_ascii=False))
        self.assertEqual([field["key"] for field in manifest["outputSchema"]], ["conversation_history"])

    def test_loader_outputs_context_package_from_runtime_session_context(self) -> None:
        module = _load_history_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                connection = sqlite3.connect(database.DB_PATH)
                try:
                    _insert_session(connection, "session_history")
                    for index in range(15):
                        role = "user" if index % 2 == 0 else "assistant"
                        _insert_message(connection, f"msg_{index:02d}", "session_history", role, f"H{index:02d}", index)
                    _insert_message(connection, "msg_current", "session_history", "user", "CURRENT", 15)
                    connection.commit()
                finally:
                    connection.close()

                result = module.buddy_history_context_loader(
                    {},
                    context={
                        "run_id": "run_history",
                        "buddy_session_id": "session_history",
                        "buddy_current_message_id": "msg_current",
                    },
                )
                history_package = result["conversation_history"]
                expanded = expand_context_package(history_package)

        expected_message_ids = [f"msg_{index:02d}" for index in range(15)]
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(history_package["kind"], "context_package")
        self.assertEqual(history_package["source_kind"], "session")
        self.assertEqual(history_package["authority"], "history")
        self.assertEqual(history_package["context_ref"]["kind"], "context_assembly_ref")
        self.assertEqual([item["source_ref"]["source_id"] for item in history_package["items"]], expected_message_ids)
        self.assertEqual([ref["source_id"] for ref in history_package["source_refs"]], expected_message_ids)
        self.assertEqual(history_package["budget"]["omitted_count"], 0)
        self.assertNotIn("max_messages", history_package["budget"])
        self.assertNotIn("max_chars", history_package["budget"])
        self.assertNotIn("max_messages", history_package["context_ref"]["budget"])
        self.assertNotIn("max_chars", history_package["context_ref"]["budget"])
        self.assertEqual(history_package["metadata"]["current_session_id"], "session_history")
        self.assertEqual(history_package["metadata"]["current_message_id"], "msg_current")
        self.assertEqual(history_package["metadata"]["source_run_id"], "run_history")
        self.assertEqual(history_package["metadata"]["history_view"], "raw")
        self.assertEqual(history_package["context_ref"]["metadata"]["source_run_id"], "run_history")
        self.assertGreater(history_package["budget"]["source_chars"], 0)
        self.assertGreater(history_package["budget"]["used_chars"], 0)
        self.assertIn("H00", expanded["text"])
        self.assertIn("H14", expanded["text"])
        self.assertNotIn("CURRENT", expanded["text"])
        self.assertEqual(set(result), {"status", "conversation_history"})

    def test_loader_outputs_compacted_history_when_session_summary_exists(self) -> None:
        module = _load_history_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                connection = sqlite3.connect(database.DB_PATH)
                try:
                    _insert_session(connection, "session_compacted")
                    for index in range(15):
                        role = "user" if index % 2 == 0 else "assistant"
                        _insert_message(connection, f"msg_{index:02d}", "session_compacted", role, f"H{index:02d}", index)
                    _insert_message(connection, "msg_current", "session_compacted", "user", "CURRENT", 15)
                    covered_refs = [
                        {"source_kind": "buddy_message", "source_id": f"msg_{index:02d}", "role": "user"}
                        for index in range(10)
                    ]
                    _insert_session_summary(
                        connection,
                        "summary_compacted",
                        "session_compacted",
                        "COMPACTED HISTORY",
                        covered_refs,
                    )
                    connection.commit()
                finally:
                    connection.close()

                result = module.buddy_history_context_loader(
                    {},
                    context={
                        "run_id": "run_compacted",
                        "buddy_session_id": "session_compacted",
                        "buddy_current_message_id": "msg_current",
                    },
                )
                history_package = result["conversation_history"]
                expanded = expand_context_package(history_package)

        self.assertEqual(history_package["metadata"]["history_view"], "compacted")
        self.assertEqual(history_package["metadata"]["summary_id"], "summary_compacted")
        self.assertEqual(history_package["budget"]["omitted_count"], 10)
        self.assertEqual(
            [ref["source_id"] for ref in history_package["source_refs"]],
            ["summary_compacted", "msg_10", "msg_11", "msg_12", "msg_13", "msg_14"],
        )
        self.assertIn("COMPACTED HISTORY", expanded["text"])
        self.assertIn("H10", expanded["text"])
        self.assertIn("H14", expanded["text"])
        self.assertNotIn("H00", expanded["text"])
        self.assertNotIn("H09", expanded["text"])
        self.assertNotIn("CURRENT", expanded["text"])
        self.assertEqual(set(result), {"status", "conversation_history"})

    def test_loader_returns_empty_history_without_buddy_session_context(self) -> None:
        module = _load_history_tool_module()

        result = module.buddy_history_context_loader({}, context={})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["conversation_history"]["kind"], "context_package")
        self.assertEqual(result["conversation_history"]["source_kind"], "session")
        self.assertEqual(result["conversation_history"]["authority"], "history")
        self.assertEqual(result["conversation_history"]["context_ref"]["kind"], "context_assembly_ref")
        self.assertEqual(result["conversation_history"]["items"], [])
        self.assertEqual(result["conversation_history"]["source_refs"], [])
        self.assertEqual(result["conversation_history"]["budget"]["omitted_count"], 0)
        self.assertNotIn("max_messages", result["conversation_history"]["budget"])
        self.assertNotIn("max_chars", result["conversation_history"]["budget"])
        self.assertEqual(result["conversation_history"]["warnings"][0]["code"], "missing_buddy_session")
        self.assertEqual(result["conversation_history"]["metadata"]["current_session_id"], "")
        self.assertEqual(result["conversation_history"]["context_ref"]["metadata"]["scope"], "standalone_run")
        self.assertEqual(set(result), {"status", "conversation_history"})


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


def _insert_session_summary(
    connection: sqlite3.Connection,
    summary_id: str,
    session_id: str,
    content: str,
    source_refs: list[dict[str, str]],
) -> None:
    connection.execute(
        """
        INSERT INTO buddy_session_summaries (
            summary_id,
            session_id,
            lineage_root_session_id,
            content,
            source_refs_json,
            source_run_id,
            source_revision_id,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            summary_id,
            session_id,
            session_id,
            content,
            json.dumps(source_refs),
            "run_summary",
            "rev_summary",
            "2026-05-26T00:00:02Z",
            "2026-05-26T00:00:02Z",
        ),
    )


if __name__ == "__main__":
    unittest.main()
