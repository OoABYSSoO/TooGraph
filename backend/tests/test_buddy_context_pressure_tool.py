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
TOOL_DIR = REPO_ROOT / "tool" / "official" / "buddy_context_pressure_check"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_pressure_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("buddy_context_pressure_check_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_context_pressure_check tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddyContextPressureToolTests(unittest.TestCase):
    def test_official_catalog_exposes_context_pressure_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_context_pressure_check")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy Context Pressure Check")
        self.assertIn("deterministic", definition.description)
        self.assertNotIn("raw_conversation_history", [field.key for field in definition.input_schema])
        self.assertNotIn("page_context", [field.key for field in definition.input_schema])
        self.assertIn("buddy_context_pressure_check", get_tool_registry(include_disabled=True).keys())

    def test_pressure_check_triggers_on_large_history_and_large_result(self) -> None:
        module = _load_pressure_tool_module()

        history_result = module.buddy_context_pressure_check(
            {
                "trigger": "preflight",
                "raw_conversation_history": "raw history should be ignored " * 1400,
                "conversation_history": "history " * 1400,
                "user_message": "continue",
                "existing_session_summary": "",
                "capability_result": {},
                "public_response": "",
            }
        )

        self.assertEqual(history_result["status"], "succeeded")
        self.assertIs(history_result["needs_context_compaction"], True)
        self.assertEqual(history_result["reason"], "history_pressure")
        self.assertEqual(history_result["context_compaction_trigger"], "preflight")
        self.assertNotIn("raw_history_chars", history_result["context_budget_report"])
        self.assertGreaterEqual(history_result["context_budget_report"]["rendered_history_chars"], 9000)

        result_result = module.buddy_context_pressure_check(
            {
                "trigger": "capability_result",
                "conversation_history": "",
                "user_message": "continue",
                "existing_session_summary": "",
                "capability_result": {"kind": "result_package", "outputs": {"answer": {"value": "x" * 7000}}},
                "public_response": "",
            }
        )

        self.assertEqual(result_result["status"], "succeeded")
        self.assertIs(result_result["needs_context_compaction"], True)
        self.assertEqual(result_result["reason"], "result_pressure")
        self.assertEqual(result_result["context_compaction_trigger"], "capability_result")

    def test_pressure_check_measures_context_assembly_ref_rendered_history(self) -> None:
        module = _load_pressure_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                long_history = "统一数据库上下文应该按原始消息展开计量。" * 420
                with sqlite3.connect(database.DB_PATH) as connection:
                    connection.execute(
                        """
                        INSERT INTO buddy_sessions (
                            session_id, title, archived, deleted, source, created_at, updated_at
                        ) VALUES ('session_pressure', '压力测试', 0, 0, 'buddy', ?, ?)
                        """,
                        ("2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z"),
                    )
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
                        ) VALUES ('msg_pressure', 'session_pressure', 'user', ?, 0, 1, NULL, '{}', ?, ?)
                        """,
                        (long_history, "2026-05-26T00:00:01Z", "2026-05-26T00:00:01Z"),
                    )
                    connection.commit()
                ref = {
                    "kind": "context_assembly_ref",
                    "assembly_id": "ctx_pressure_pending",
                    "target_state_key": "conversation_history",
                    "renderer_key": "buddy_history",
                    "renderer_version": "1",
                    "rendered_content_hash": "",
                    "source_count": 1,
                    "source_refs": [
                        {
                            "source_kind": "buddy_message",
                            "source_id": "msg_pressure",
                            "role": "user",
                            "ordinal": 0,
                        }
                    ],
                }

                result = module.buddy_context_pressure_check(
                    {
                        "trigger": "preflight",
                        "conversation_history": ref,
                        "user_message": "继续",
                        "existing_session_summary": "",
                        "capability_result": {},
                        "public_response": "",
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(result["needs_context_compaction"])
        self.assertEqual(result["reason"], "history_pressure")
        self.assertGreaterEqual(result["context_budget_report"]["rendered_history_chars"], 6000)

    def test_pressure_check_does_not_repeat_raw_history_compaction_after_summary_exists(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "trigger": "preflight",
                "conversation_history": "summary plus recent turns",
                "user_message": "continue",
                "existing_session_summary": "",
                "context_compaction_summary": "durable compact summary",
                "capability_result": {},
                "public_response": "",
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], False)
        self.assertEqual(result["reason"], "none")
        self.assertGreater(result["context_budget_report"]["context_compaction_summary_chars"], 0)

    def test_pressure_check_ignores_page_context_pressure(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "trigger": "preflight",
                "conversation_history": "recent",
                "user_message": "hi",
                "page_context": "page-operation " * 700,
                "existing_session_summary": "",
                "capability_result": {},
                "public_response": "",
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], False)
        self.assertEqual(result["reason"], "none")
        self.assertIs(result["context_budget_report"]["should_compact"], False)
        self.assertNotIn("page_context_chars", result["context_budget_report"])
        self.assertEqual(result["context_budget_report"]["pressure_sources"], [])


if __name__ == "__main__":
    unittest.main()
