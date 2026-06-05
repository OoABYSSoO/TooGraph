from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "buddy_review_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_review_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("buddy_review_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_review_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddyReviewContextLoaderToolTests(unittest.TestCase):
    def test_official_catalog_exposes_review_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_review_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy Review Context Loader")
        self.assertIn("Buddy 图运行", definition.description)
        self.assertIn("buddy_review_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_reconstructs_review_context_from_source_run_record(self) -> None:
        module = _load_review_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                from app.core.storage.run_store import save_run

                history_ref = {
                    "kind": "context_assembly_ref",
                    "source_refs": [
                        {"source_kind": "buddy_message", "source_id": "msg_q1", "role": "user", "ordinal": 0},
                        {"source_kind": "buddy_message", "source_id": "msg_a1", "role": "assistant", "ordinal": 1},
                    ],
                }
                save_run(
                    {
                        "run_id": "run_visible_1",
                        "graph_id": None,
                        "graph_name": "伙伴主循环",
                        "status": "completed",
                        "runtime_backend": "langgraph",
                        "started_at": "2026-05-27T00:00:00Z",
                        "completed_at": "2026-05-27T00:00:01Z",
                        "lifecycle": {"updated_at": "2026-05-27T00:00:01Z", "resume_count": 0},
                        "checkpoint_metadata": {},
                        "metadata": {
                            "runtime_context": {
                                "buddy_session_id": "session_visible_1",
                                "buddy_current_message_id": "msg_q2",
                            }
                        },
                        "state_snapshot": {
                            "values": {
                                "state_user": "Q2",
                                "state_history": history_ref,
                                "state_request": {"goal": "answer"},
                                "state_capability": {"outputs": {"result": {"value": "tool result"}}},
                                "state_review": {"needs_more": False},
                                "state_public": "A2",
                            },
                            "last_writers": {},
                        },
                        "graph_snapshot": {
                            "state_schema": {
                                "state_user": {"name": "user_message"},
                                "state_history": {"name": "conversation_history"},
                                "state_request": {"name": "request_understanding"},
                                "state_capability": {"name": "capability_result"},
                                "state_review": {"name": "capability_review"},
                                "state_public": {"name": "public_response"},
                            }
                        },
                        "node_status_map": {},
                        "output_previews": [],
                    }
                )

                result = module.buddy_review_context_loader({"source_run_id": "run_visible_1"})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["source_run_id"], "run_visible_1")
        self.assertEqual(result["current_session_id"], "session_visible_1")
        self.assertEqual(result["user_message"], "Q2")
        self.assertEqual(result["conversation_history"], history_ref)
        self.assertEqual(result["request_understanding"], {"goal": "answer"})
        self.assertEqual(result["capability_result"], {"outputs": {"result": {"value": "tool result"}}})
        self.assertEqual(result["capability_review"], {"needs_more": False})
        self.assertEqual(result["public_response"], "A2")
        self.assertEqual(result["review_context_report"]["scope"], "source_run")
        self.assertEqual(result["review_context_report"]["source_run_id"], "run_visible_1")
        self.assertEqual(result["review_context_report"]["current_message_id"], "msg_q2")

    def test_loader_returns_failed_result_without_source_run_id(self) -> None:
        module = _load_review_tool_module()

        result = module.buddy_review_context_loader({})

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error_type"], "missing_source_run_id")
        self.assertEqual(result["source_run_id"], "")
        self.assertEqual(result["user_message"], "")
        self.assertEqual(result["conversation_history"]["kind"], "context_assembly_ref")


if __name__ == "__main__":
    unittest.main()
