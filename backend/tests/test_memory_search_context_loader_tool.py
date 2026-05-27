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
TOOL_DIR = REPO_ROOT / "tool" / "official" / "memory_search_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.buddy import store
from app.core.storage import database
from app.core.storage.context_assembly_store import expand_context_package
from app.core.storage.memory_store import create_memory_entry


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("memory_search_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load memory_search_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MemorySearchContextLoaderToolTests(unittest.TestCase):
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

    def test_catalog_exposes_memory_search_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("memory_search_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Memory Search Context Loader")
        self.assertIn("memory_entries", definition.description)
        self.assertIn("memory_search_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_outputs_memory_context_package_with_source_refs_and_report(self) -> None:
        module = _load_tool_module()
        memory = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="回复偏好",
            content="memory-loader-evidence 表示用户希望技术方案先给结论，再展开。",
            sources=[{"source_kind": "buddy_message", "source_id": "msg_memory_loader"}],
            confidence=0.92,
            salience=0.84,
        )

        result = module.memory_search_context_loader(
            {
                "query": "memory-loader-evidence",
                "limit": 5,
                "max_chars": 4000,
            }
        )
        package = result["memory_search_context"]
        expanded = expand_context_package(package)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(package["kind"], "context_package")
        self.assertEqual(package["source_kind"], "memory")
        self.assertEqual(package["authority"], "memory")
        self.assertEqual(package["context_ref"]["kind"], "context_assembly_ref")
        self.assertEqual(package["items"][0]["source_ref"]["source_kind"], "memory_entry")
        self.assertEqual(package["items"][0]["source_ref"]["source_id"], memory["memory_id"])
        self.assertIn("memory-loader-evidence", expanded["text"])
        self.assertEqual(result["memory_search_report"]["query"], "memory-loader-evidence")
        self.assertEqual(result["memory_search_report"]["memory_count"], 1)
        self.assertIn(memory["memory_id"], result["memory_search_report"]["memory_ids"])
        self.assertIn(
            {"source_kind": "buddy_message", "source_id": "msg_memory_loader"},
            result["memory_search_report"]["source_refs"],
        )

    def test_context_package_rebuilds_memory_context_from_memory_rows(self) -> None:
        module = _load_tool_module()
        memory = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="可重建记忆",
            content="原始 memory rebuild evidence。",
        )

        result = module.memory_search_context_loader({"query": "rebuild evidence", "limit": 5})
        package = result["memory_search_context"]
        first_expanded = expand_context_package(package)

        self._delete_blob(first_expanded["assembly"]["rendered_content_hash"])
        self._update_memory(memory["memory_id"], "更新后的 memory rebuild evidence。")

        rebuilt = expand_context_package(package)

        self.assertIn("更新后的 memory rebuild evidence。", rebuilt["text"])
        self.assertEqual(rebuilt["package"]["source_kind"], "memory")

    def test_loader_passes_reranker_model_ref_to_memory_search(self) -> None:
        module = _load_tool_module()
        captured: dict[str, object] = {}

        def fake_search_memories(**kwargs):
            captured.update(kwargs)
            return {
                "kind": "memory_search",
                "embedding_model_ref": kwargs.get("embedding_model_ref", ""),
                "reranker_model_ref": kwargs.get("reranker_model_ref", ""),
                "memories": [],
                "report": {
                    "mode": "hybrid",
                    "filters": {},
                    "retrieval_modes": {},
                    "query_ids": [],
                    "ranking_reports": [],
                },
            }

        with patch("app.buddy.store.search_memories", side_effect=fake_search_memories):
            result = module.memory_search_context_loader(
                {
                    "query": "rerank memory evidence",
                    "embedding_model_ref": "emodel_local_hashing",
                    "reranker_model_ref": "local-rerank/bge-reranker-v2",
                    "limit": 3,
                }
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(captured["embedding_model_ref"], "emodel_local_hashing")
        self.assertEqual(captured["reranker_model_ref"], "local-rerank/bge-reranker-v2")
        self.assertEqual(result["memory_search_report"]["reranker_model_ref"], "local-rerank/bge-reranker-v2")

    def _delete_blob(self, content_hash: str) -> None:
        with sqlite3.connect(database.DB_PATH) as connection:
            connection.execute("DELETE FROM content_blobs WHERE content_hash = ?", (content_hash,))
            connection.commit()

    def _update_memory(self, memory_id: str, content: str) -> None:
        with sqlite3.connect(database.DB_PATH) as connection:
            connection.execute("UPDATE memory_entries SET content = ? WHERE memory_id = ?", (content, memory_id))
            connection.commit()


if __name__ == "__main__":
    unittest.main()
