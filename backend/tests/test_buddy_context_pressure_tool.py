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


def _context_item(state: str, value: object, *, value_type: str = "json", required: bool = False) -> dict[str, object]:
    return {
        "state": state,
        "name": state,
        "description": "",
        "type": value_type,
        "required": required,
        "value": value,
    }


class BuddyContextPressureToolTests(unittest.TestCase):
    def test_official_catalog_exposes_target_llm_context_pressure_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_context_pressure_check")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy Context Pressure Check")
        self.assertIn("deterministic", definition.description)
        self.assertFalse(definition.dynamic_state_inputs)
        self.assertEqual(definition.input_schema, [])
        self.assertEqual([field.key for field in definition.output_schema], ["needs_context_compaction"])
        self.assertIn("buddy_context_pressure_check", get_tool_registry(include_disabled=True).keys())

    def test_pressure_check_uses_provider_usage_against_model_budget(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "context_items": [
                    _context_item(
                        "conversation_history",
                        {
                            "kind": "context_package",
                            "source_kind": "session",
                            "authority": "history",
                            "source_refs": [
                                {"source_kind": "buddy_message", "source_id": "msg_1", "ordinal": 0}
                            ],
                            "budget": {"source_chars": 2400, "used_chars": 2400, "omitted_count": 0},
                            "metadata": {"history_view": "raw"},
                            "items": [],
                        },
                    ),
                    _context_item("user_message", "continue", value_type="text", required=True),
                ],
                "model_budget": {
                    "context_window_tokens": 100000,
                    "compression_threshold": 0.9,
                },
                "provider_usage": {"prompt_tokens": 91000},
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], True)
        self.assertEqual(result["reason"], "provider_usage_pressure")
        report = result["context_budget_report"]
        self.assertEqual(report["provider_prompt_tokens"], 91000)
        self.assertEqual(report["token_source"], "provider_usage")
        self.assertEqual(report["model_context_window_tokens"], 100000)
        self.assertEqual(report["compression_threshold"], 0.9)
        self.assertGreaterEqual(report["prompt_token_pressure"], 0.9)

    def test_pressure_check_falls_back_to_context_assembly_token_estimate(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "context_items": [
                    _context_item(
                        "conversation_history",
                        {
                            "kind": "context_package",
                            "source_kind": "session",
                            "authority": "history",
                            "source_refs": [
                                {"source_kind": "buddy_message", "source_id": "msg_1", "ordinal": 0}
                            ],
                            "budget": {"source_chars": 2500, "used_chars": 2500, "omitted_count": 0},
                            "metadata": {"history_view": "raw"},
                            "items": [],
                        },
                    ),
                    _context_item("buddy_context", "stable home context", value_type="file"),
                ],
                "model_budget": {
                    "context_window_tokens": 100000,
                    "compression_threshold": 0.9,
                },
                "context_assembly_report": {"totals": {"token_estimate": 89000}},
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], False)
        self.assertEqual(result["reason"], "none")
        report = result["context_budget_report"]
        self.assertEqual(report["provider_prompt_tokens"], 89000)
        self.assertEqual(report["token_source"], "context_assembly_estimate")
        self.assertAlmostEqual(report["prompt_token_pressure"], 0.89)

    def test_pressure_check_counts_all_dynamic_context_but_only_compacts_history(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "context_items": [
                    _context_item("user_message", "please continue " * 200, value_type="text", required=True),
                    _context_item("buddy_context", "stable Buddy Home " * 200, value_type="file"),
                    _context_item(
                        "conversation_history",
                        {
                            "kind": "context_package",
                            "source_kind": "session",
                            "authority": "history",
                            "source_refs": [
                                {"source_kind": "buddy_message", "source_id": f"msg_{index}", "ordinal": index}
                                for index in range(24)
                            ],
                            "budget": {"source_chars": 9000, "used_chars": 9000, "omitted_count": 0},
                            "metadata": {"history_view": "raw"},
                            "items": [],
                        },
                    ),
                ]
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], True)
        self.assertEqual(result["reason"], "history_pressure")
        report = result["context_budget_report"]
        self.assertGreater(report["total_context_chars"], report["history_used_chars"])
        self.assertGreater(report["user_message_chars"], 0)
        self.assertGreater(report["buddy_context_chars"], 0)
        self.assertIn("history", report["pressure_sources"])

    def test_pressure_check_does_not_compact_when_only_non_history_context_is_large(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "context_items": [
                    _context_item("user_message", "large current request " * 600, value_type="text", required=True),
                    _context_item("buddy_context", "large Buddy Home " * 600, value_type="file"),
                    _context_item(
                        "conversation_history",
                        {
                            "kind": "context_package",
                            "source_kind": "session",
                            "authority": "history",
                            "source_refs": [
                                {"source_kind": "buddy_session_summary", "source_id": "summary_1", "ordinal": 0}
                            ],
                            "budget": {"source_chars": 1200, "used_chars": 1200, "omitted_count": 0},
                            "metadata": {"history_view": "compacted", "summary_id": "summary_1"},
                            "items": [],
                        },
                    ),
                ]
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["needs_context_compaction"], False)
        self.assertEqual(result["reason"], "non_history_pressure")
        self.assertIn("non_history", result["context_budget_report"]["pressure_sources"])

    def test_pressure_check_measures_context_package_rendered_history(self) -> None:
        module = _load_pressure_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                long_history = "context package should be measured after expansion. " * 180
                connection = sqlite3.connect(database.DB_PATH)
                try:
                    connection.execute(
                        """
                        INSERT INTO buddy_sessions (
                            session_id, title, archived, deleted, source, created_at, updated_at
                        ) VALUES ('session_package_pressure', 'pressure', 0, 0, 'buddy', ?, ?)
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
                        ) VALUES ('msg_package_pressure', 'session_package_pressure', 'user', ?, 0, 1, NULL, '{}', ?, ?)
                        """,
                        (long_history, "2026-05-26T00:00:01Z", "2026-05-26T00:00:01Z"),
                    )
                    connection.commit()
                finally:
                    connection.close()
                package = {
                    "kind": "context_package",
                    "source_kind": "session",
                    "authority": "history",
                    "items": [
                        {
                            "id": "msg_package_pressure",
                            "source_ref": {
                                "source_kind": "buddy_message",
                                "source_id": "msg_package_pressure",
                                "role": "user",
                                "ordinal": 0,
                            },
                        }
                    ],
                    "context_ref": {
                        "kind": "context_assembly_ref",
                        "assembly_id": "ctx_package_pressure_pending",
                        "target_state_key": "conversation_history",
                        "renderer_key": "buddy_history",
                        "renderer_version": "1",
                        "rendered_content_hash": "",
                        "source_count": 1,
                        "source_refs": [
                            {
                                "source_kind": "buddy_message",
                                "source_id": "msg_package_pressure",
                                "role": "user",
                                "ordinal": 0,
                            }
                        ],
                    },
                    "budget": {"used_chars": 0, "source_chars": 0, "omitted_count": 0},
                    "metadata": {"history_view": "raw"},
                    "warnings": [],
                }

                result = module.buddy_context_pressure_check(
                    {
                        "context_items": [
                            _context_item("conversation_history", package),
                            _context_item("user_message", "continue", value_type="text", required=True),
                        ]
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(result["needs_context_compaction"])
        self.assertEqual(result["reason"], "history_pressure")
        self.assertGreaterEqual(result["context_budget_report"]["history_used_chars"], 6000)

    def test_pressure_check_triggers_on_cropped_history_source_chars(self) -> None:
        module = _load_pressure_tool_module()

        result = module.buddy_context_pressure_check(
            {
                "context_items": [
                    _context_item(
                        "conversation_history",
                        {
                            "kind": "context_package",
                            "source_kind": "session",
                            "authority": "history",
                            "items": [],
                            "source_refs": [
                                {"source_kind": "buddy_message", "source_id": "msg_overflow_1", "role": "user", "ordinal": 0}
                            ],
                            "budget": {
                                "max_chars": 4000,
                                "source_chars": 18000,
                                "used_chars": 4000,
                                "omitted_count": 9,
                            },
                            "metadata": {"history_view": "raw"},
                            "warnings": [],
                        },
                    ),
                    _context_item("user_message", "continue", value_type="text", required=True),
                ]
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(result["needs_context_compaction"])
        self.assertEqual(result["context_budget_report"]["history_source_chars"], 18000)
        self.assertEqual(result["context_budget_report"]["history_omitted_count"], 9)
        self.assertIn("history", result["context_budget_report"]["pressure_sources"])


if __name__ == "__main__":
    unittest.main()
