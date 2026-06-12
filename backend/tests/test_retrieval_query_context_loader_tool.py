from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "retrieval_query_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("retrieval_query_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load retrieval_query_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RetrievalQueryContextLoaderToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_catalog_exposes_retrieval_query_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("retrieval_query_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Retrieval Query Context Loader")
        self.assertIn("context package", definition.localized["en-US"].description)
        self.assertEqual(definition.input_presentation["query"].mode, "state")
        self.assertEqual(definition.input_presentation["filters"].mode, "static")
        self.assertIn("retrieval_query_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_tool_returns_context_package_from_unified_retrieval_chunks(self) -> None:
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        module = _load_tool_module()
        document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_embedding_design",
            title="Embedding Design",
            scope={"workspace": "test"},
            metadata={"collection": "docs"},
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {
                    "chunk_id": "chunk_embedding_design_1",
                    "content": "Retrieval chunks should be searched by one unified query tool.",
                    "metadata": {"authority": "knowledge", "collection": "docs"},
                }
            ],
        )

        with patch(
            "app.core.storage.embedding_model_sync.get_default_embedding_model_ref_from_settings",
            return_value="",
        ):
            result = module.retrieval_query_context_loader(
                {
                    "query": "unified query tool",
                    "filters": {"source_kind": "knowledge_document"},
                    "limits": {"limit": 5, "max_chars": 2000},
                }
            )

        self.assertEqual(result["status"], "succeeded")
        package = result["context_package"]
        self.assertEqual(package["kind"], "context_package")
        self.assertEqual(package["source_kind"], "retrieval")
        self.assertEqual(package["authority"], "evidence")
        self.assertEqual(package["source_count"], 1)
        self.assertEqual(package["source_refs"][0]["source_kind"], "retrieval_chunk")
        self.assertEqual(package["items"][0]["source_ref"]["metadata"]["original_source_kind"], "knowledge_document")
        self.assertIn("chunk_embedding_design_1", [chunk["chunk_id"] for chunk in result["ranked_chunks"]])
        self.assertEqual(result["ranking_report"]["query_text"], "unified query tool")
        self.assertEqual(result["ranking_report"]["result_count"], 1)

    def test_tool_uses_default_embedding_model_and_passes_audit_context(self) -> None:
        module = _load_tool_module()
        captured_calls: list[dict] = []

        def fake_hybrid_search(*args, **kwargs):
            captured_calls.append({"args": args, "kwargs": kwargs})
            return []

        filters = {
            "source_kind": "knowledge_document",
            "metadata_filter": {"collection": "policy_qa"},
        }
        with patch(
            "app.core.storage.embedding_model_sync.get_default_embedding_model_ref_from_settings",
            return_value="local/default-embedding",
        ), patch("app.core.storage.retrieval_store.hybrid_search", side_effect=fake_hybrid_search), patch.dict(
            "os.environ",
            {"TOOGRAPH_ACTION_RUN_ID": "run_knowledge_qa_1"},
            clear=False,
        ):
            result = module.retrieval_query_context_loader(
                {
                    "query": "就业政策",
                    "filters": filters,
                    "limits": {"limit": 5, "max_chars": 2000},
                }
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(captured_calls[0]["args"], ("就业政策",))
        self.assertEqual(captured_calls[0]["kwargs"]["filters"], filters)
        self.assertEqual(captured_calls[0]["kwargs"]["embedding_model_ref"], "local/default-embedding")
        self.assertEqual(captured_calls[0]["kwargs"]["run_id"], "run_knowledge_qa_1")


if __name__ == "__main__":
    unittest.main()
