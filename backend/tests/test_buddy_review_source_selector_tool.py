from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "buddy_review_source_selector"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_selector_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("buddy_review_source_selector_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_review_source_selector tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _save_buddy_run(run_id: str, *, started_at: str, status: str = "completed", metadata: dict | None = None) -> None:
    from app.core.storage.run_store import save_run

    save_run(
        {
            "run_id": run_id,
            "graph_id": None,
            "graph_name": "Buddy",
            "template_id": "buddy_autonomous_loop",
            "status": status,
            "runtime_backend": "langgraph",
            "started_at": started_at,
            "completed_at": started_at if status == "completed" else "",
            "lifecycle": {"updated_at": started_at, "resume_count": 0},
            "checkpoint_metadata": {},
            "metadata": metadata if metadata is not None else {"origin": "buddy", "runtime_context": {"buddy_session_id": "session_auto"}},
            "state_snapshot": {"values": {"user_message": run_id, "public_response": "ok"}, "last_writers": {}},
            "graph_snapshot": {"state_schema": {}},
            "node_status_map": {},
            "output_previews": [],
        }
    )


class BuddyReviewSourceSelectorToolTests(unittest.TestCase):
    def test_official_catalog_exposes_review_source_selector_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_review_source_selector")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy Review Source Selector")
        self.assertIn("unreviewed Buddy run", definition.description)
        self.assertIn("buddy_review_source_selector", get_tool_registry(include_disabled=True).keys())

    def test_selector_auto_detects_oldest_unreviewed_completed_buddy_run_and_claims_review(self) -> None:
        module = _load_selector_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                from app.buddy import store as buddy_store

                _save_buddy_run("run_reviewed", started_at="2026-05-27T00:00:00Z")
                _save_buddy_run("run_oldest_unreviewed", started_at="2026-05-27T00:01:00Z")
                _save_buddy_run("run_newest_unreviewed", started_at="2026-05-27T00:02:00Z")
                _save_buddy_run("run_non_buddy", started_at="2026-05-27T00:03:00Z", metadata={})
                _save_buddy_run("run_running", started_at="2026-05-27T00:04:00Z", status="running")
                buddy_store.create_background_review_run(
                    source_run_id="run_reviewed",
                    review_run_id="review_run_existing",
                    template_id="buddy_autonomous_review",
                    trigger_reason="test",
                )

                result = module.buddy_review_source_selector(
                    {"mode": "auto_unreviewed"},
                    context={"run_id": "run_scheduled_review"},
                )
                review_records = buddy_store.list_background_review_runs(source_run_id="run_oldest_unreviewed")

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["has_source_run"], True)
        self.assertEqual(result["selected_source_run_id"], "run_oldest_unreviewed")
        self.assertEqual(result["selection_report"]["selection_mode"], "auto_unreviewed")
        self.assertEqual(result["selection_report"]["skipped_reviewed_source_run_ids"], ["run_reviewed"])
        self.assertEqual(len(review_records), 1)
        self.assertEqual(result["review_id"], review_records[0]["review_id"])
        self.assertEqual(review_records[0]["review_run_id"], "run_scheduled_review")
        self.assertEqual(review_records[0]["status"], "running")

    def test_selector_returns_noop_when_no_unreviewed_completed_buddy_run_exists(self) -> None:
        module = _load_selector_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                from app.buddy import store as buddy_store

                _save_buddy_run("run_reviewed", started_at="2026-05-27T00:00:00Z")
                buddy_store.create_background_review_run(
                    source_run_id="run_reviewed",
                    review_run_id="review_run_existing",
                    template_id="buddy_autonomous_review",
                    trigger_reason="test",
                )

                result = module.buddy_review_source_selector(
                    {"mode": "auto_unreviewed"},
                    context={"run_id": "run_scheduled_review"},
                )
                review_records = buddy_store.list_background_review_runs()

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["has_source_run"], False)
        self.assertEqual(result["selected_source_run_id"], "")
        self.assertEqual(result["review_id"], "")
        self.assertEqual(result["selection_report"]["skipped_reason"], "no_unreviewed_completed_buddy_run")
        self.assertEqual(len(review_records), 1)

    def test_selector_explicit_mode_claims_provided_source_run(self) -> None:
        module = _load_selector_tool_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                database.initialize_storage()
                from app.buddy import store as buddy_store

                _save_buddy_run("run_explicit", started_at="2026-05-27T00:00:00Z")
                result = module.buddy_review_source_selector(
                    {"mode": "explicit", "source_run_id": "run_explicit"},
                    context={"run_id": "run_manual_review"},
                )
                review_records = buddy_store.list_background_review_runs(source_run_id="run_explicit")

        self.assertEqual(result["status"], "succeeded")
        self.assertIs(result["has_source_run"], True)
        self.assertEqual(result["selected_source_run_id"], "run_explicit")
        self.assertEqual(result["selection_report"]["selection_mode"], "explicit")
        self.assertEqual(len(review_records), 1)
        self.assertEqual(review_records[0]["review_run_id"], "run_manual_review")
        self.assertEqual(review_records[0]["status"], "running")


if __name__ == "__main__":
    unittest.main()
