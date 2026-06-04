from __future__ import annotations

import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "retrieval_ingestion_writer"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("retrieval_ingestion_writer_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load retrieval_ingestion_writer tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RetrievalIngestionWriterToolTests(unittest.TestCase):
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

    def test_catalog_exposes_retrieval_ingestion_writer_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("retrieval_ingestion_writer")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Retrieval Ingestion Writer")
        self.assertIn("retrieval_documents", definition.localized["en-US"].description)
        self.assertEqual(definition.input_presentation["chunks"].mode, "state")
        self.assertEqual(definition.input_presentation["source_kind"].mode, "static")
        self.assertIn("retrieval_ingestion_writer", get_tool_registry(include_disabled=True).keys())

    def test_tool_writes_retrieval_rows_and_queues_embedding_jobs(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model

        module = _load_tool_module()
        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)

        result = module.retrieval_ingestion_writer(
            {
                "source_kind": "knowledge_document",
                "source": {
                    "documents": [
                        {
                            "document_id": "doc_embedding_design",
                            "title": "Embedding Design",
                            "source_revision_id": "rev_1",
                            "content": "A clean retrieval document body.",
                            "metadata": {"collection": "docs"},
                        }
                    ]
                },
                "chunks": [
                    {
                        "chunk_id": "chunk_embedding_design_1",
                        "source_id": "doc_embedding_design",
                        "content": "Retrieval chunks are indexed separately from semantic memory.",
                        "source_locator": {"source_path": "docs/embedding.md", "start_char": 0, "end_char": 64},
                        "metadata": {"section": "overview"},
                    }
                ],
                "embedding_model_refs": [model["embedding_model_id"]],
                "scope": {"workspace": "test"},
            }
        )

        self.assertEqual(result["status"], "succeeded")
        report = result["ingestion_report"]
        self.assertEqual(report["document_count"], 1)
        self.assertEqual(report["chunk_count"], 1)
        self.assertEqual(report["embedding_job_count"], 1)
        self.assertEqual(result["indexed_chunks"][0]["chunk_id"], "chunk_embedding_design_1")
        self.assertEqual(result["embedding_jobs"][0]["chunk_id"], "chunk_embedding_design_1")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            document_row = connection.execute(
                "SELECT source_kind, source_id, title FROM retrieval_documents WHERE source_id = ?",
                ("doc_embedding_design",),
            ).fetchone()
            chunk_row = connection.execute(
                "SELECT source_kind, source_id, content FROM retrieval_chunks WHERE chunk_id = ?",
                ("chunk_embedding_design_1",),
            ).fetchone()
            job_count = connection.execute("SELECT COUNT(*) FROM embedding_jobs").fetchone()[0]

        self.assertEqual(document_row, ("knowledge_document", "doc_embedding_design", "Embedding Design"))
        self.assertEqual(chunk_row[0], "knowledge_document")
        self.assertEqual(chunk_row[1], "doc_embedding_design")
        self.assertIn("semantic memory", chunk_row[2])
        self.assertEqual(job_count, 1)


if __name__ == "__main__":
    unittest.main()
