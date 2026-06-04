from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "embedding_job_processor"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("embedding_job_processor_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load embedding_job_processor tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EmbeddingJobProcessorToolTests(unittest.TestCase):
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

    def test_catalog_exposes_embedding_job_processor_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("embedding_job_processor")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Embedding Job Processor")
        self.assertIn("pending embedding jobs", definition.localized["en-US"].description)
        self.assertIn("embedding_job_processor", get_tool_registry(include_disabled=True).keys())

    def test_tool_processes_pending_provider_embedding_jobs(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        module = _load_tool_module()
        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="memory_entry", source_id="mem_tool")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_tool", "content": "Tool driven embedding processing for recall."}],
        )
        queue_embedding_job("memory_entry", "mem_tool", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
        ):
            result = module.embedding_job_processor({"model_ref": model["embedding_model_id"], "limit": 5})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["completed_count"], 1)
        self.assertEqual(result["failed_count"], 0)
        self.assertEqual(result["processed_jobs"][0]["chunk_id"], "chunk_tool")
        self.assertNotIn("query_vector", result["processed_jobs"][0])


if __name__ == "__main__":
    unittest.main()
