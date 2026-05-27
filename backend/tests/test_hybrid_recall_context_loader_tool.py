from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "hybrid_recall_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.buddy import store
from app.core.storage import database
from app.core.storage.context_assembly_store import expand_context_package
from app.core.storage.memory_store import create_memory_entry


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("hybrid_recall_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load hybrid_recall_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HybridRecallContextLoaderToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._data_dir = Path(self._temp_dir.name) / "data"
        self._buddy_home_dir = Path(self._temp_dir.name) / "buddy_home"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", self._data_dir),
            patch("app.core.storage.database.DB_PATH", self._data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", self._buddy_home_dir),
            patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(REPO_ROOT)}),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_catalog_exposes_hybrid_recall_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("hybrid_recall_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Hybrid Recall Context Loader")
        self.assertIn("memory_entries", definition.description)
        self.assertIn("buddy_messages", definition.description)
        self.assertIn("hybrid_recall_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_outputs_combined_session_and_memory_context_package(self) -> None:
        module = _load_tool_module()
        current_session = store.create_chat_session({"title": "当前会话"}, changed_by="user", change_reason="测试创建")
        store.append_chat_message(
            current_session["session_id"],
            {"role": "user", "content": "当前会话也提到 hybrid-session-evidence。"},
            changed_by="user",
            change_reason="测试追加",
        )
        recalled_session = store.create_chat_session({"title": "历史偏好"}, changed_by="user", change_reason="测试创建")
        message = store.append_chat_message(
            recalled_session["session_id"],
            {
                "message_id": "msg_eval_hybrid_user",
                "role": "user",
                "content": "hybrid-session-evidence 表示历史对话里用户要求保留证据。",
                "client_order": 0,
            },
            changed_by="user",
            change_reason="测试追加",
        )
        memory = create_memory_entry(
            memory_id="mem_eval_hybrid_preference",
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="证据偏好",
            content="hybrid-memory-evidence 表示用户希望召回时同时引用长期记忆和历史消息。",
            sources=[{"source_kind": "buddy_message", "source_id": message["message_id"]}],
            confidence=0.92,
            salience=0.84,
        )

        result = module.hybrid_recall_context_loader(
            {
                "query": "hybrid evidence",
                "current_session_id": current_session["session_id"],
                "session_limit": 5,
                "memory_limit": 5,
                "window": 1,
                "bookend": 0,
                "max_chars": 6000,
            }
        )
        package = result["hybrid_recall_context"]
        report = result["hybrid_recall_report"]
        expanded = expand_context_package(package)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(package["kind"], "context_package")
        self.assertEqual(package["source_kind"], "memory")
        self.assertEqual(package["authority"], "evidence")
        self.assertEqual(package["context_ref"]["kind"], "context_assembly_ref")
        self.assertIn("hybrid-session-evidence", expanded["text"])
        self.assertIn("hybrid-memory-evidence", expanded["text"])
        self.assertEqual(report["memory_ids"], [memory["memory_id"]])
        self.assertIn(message["message_id"], report["message_ids"])
        self.assertEqual(report["memory_count"], 1)
        self.assertEqual(report["session_count"], 1)
        self.assertIn(
            {"source_kind": "memory_entry", "source_id": memory["memory_id"]},
            report["source_refs"],
        )
        self.assertIn(
            {"source_kind": "buddy_message", "source_id": message["message_id"]},
            report["source_refs"],
        )


if __name__ == "__main__":
    unittest.main()
