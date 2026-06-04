from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "buddy_message_source_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.buddy import store
from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("buddy_message_source_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_message_source_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddyMessageSourceLoaderToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", Path(self._temp_dir.name) / "buddy_home"),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_catalog_exposes_buddy_message_source_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("buddy_message_source_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Buddy Message Source Loader")
        self.assertIn("Buddy", definition.localized["en-US"].description)
        self.assertEqual(definition.input_presentation["session_id"].mode, "state")
        self.assertEqual(definition.input_presentation["limit"].mode, "static")
        self.assertEqual(definition.input_presentation["limit"].control, "number")
        self.assertEqual(definition.input_presentation["after_client_order"].mode, "static")
        self.assertEqual([field.key for field in definition.output_schema], ["source_package"])
        self.assertIn("buddy_message_source_loader", get_tool_registry(include_disabled=True).keys())

    def test_tool_loads_ordered_buddy_messages_as_source_package(self) -> None:
        module = _load_tool_module()
        session = store.create_chat_session(
            {"session_id": "session_source_loader", "title": "Embedding history"},
            changed_by="user",
            change_reason="test",
        )
        first = store.append_chat_message(
            session["session_id"],
            {
                "message_id": "msg_loader_1",
                "role": "user",
                "content": "How should memory chunks be prepared?",
                "client_order": 1,
                "metadata": {"topic": "memory"},
            },
            changed_by="user",
            change_reason="test",
        )
        second = store.append_chat_message(
            session["session_id"],
            {
                "message_id": "msg_loader_2",
                "role": "assistant",
                "content": "Preserve turn order and source refs before chunking.",
                "client_order": 2,
            },
            changed_by="buddy",
            change_reason="test",
        )

        result = module.buddy_message_source_loader(
            {"session_id": session["session_id"], "limit": 20, "after_client_order": 0}
        )

        self.assertEqual(result["status"], "succeeded")
        package = result["source_package"]
        self.assertEqual(package["kind"], "buddy_message_source_package")
        self.assertEqual(package["source_kind"], "buddy_messages")
        self.assertEqual(package["session_id"], session["session_id"])
        self.assertEqual([message["message_id"] for message in package["messages"]], ["msg_loader_1", "msg_loader_2"])
        self.assertEqual(package["messages"][0]["metadata"]["topic"], "memory")
        self.assertEqual(package["message_count"], 2)
        self.assertEqual(
            package["source_refs"],
            [
                {
                    "source_kind": "buddy_message",
                    "source_id": first["message_id"],
                    "session_id": session["session_id"],
                    "role": "user",
                    "client_order": 1,
                },
                {
                    "source_kind": "buddy_message",
                    "source_id": second["message_id"],
                    "session_id": session["session_id"],
                    "role": "assistant",
                    "client_order": 2,
                },
            ],
        )
        self.assertEqual(result["next_after_client_order"], 2)

    def test_missing_session_id_returns_failed_status(self) -> None:
        module = _load_tool_module()

        result = module.buddy_message_source_loader({"session_id": ""})

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error_type"], "missing_session_id")
        self.assertEqual(result["source_package"]["messages"], [])


if __name__ == "__main__":
    unittest.main()
