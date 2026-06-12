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
        self.assertEqual(definition.input_presentation["operation_id"].mode, "static")
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
                "operation_id": "kop_embedding_design",
            }
        )

        self.assertEqual(result["status"], "succeeded")
        report = result["ingestion_report"]
        self.assertEqual(report["document_count"], 1)
        self.assertEqual(report["chunk_count"], 1)
        self.assertEqual(report["embedding_job_count"], 1)
        self.assertEqual(report["operation_id"], "kop_embedding_design")
        self.assertEqual(result["indexed_chunks"][0]["chunk_id"], "chunk_embedding_design_1")
        self.assertEqual(result["embedding_jobs"][0]["chunk_id"], "chunk_embedding_design_1")
        self.assertEqual(result["embedding_jobs"][0]["operation_id"], "kop_embedding_design")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            document_row = connection.execute(
                "SELECT source_kind, source_id, title FROM retrieval_documents WHERE source_id = ?",
                ("doc_embedding_design",),
            ).fetchone()
            chunk_row = connection.execute(
                "SELECT source_kind, source_id, content FROM retrieval_chunks WHERE chunk_id = ?",
                ("chunk_embedding_design_1",),
            ).fetchone()
            job_row = connection.execute("SELECT operation_id FROM embedding_jobs").fetchone()

        self.assertEqual(document_row, ("knowledge_document", "doc_embedding_design", "Embedding Design"))
        self.assertEqual(chunk_row[0], "knowledge_document")
        self.assertEqual(chunk_row[1], "doc_embedding_design")
        self.assertIn("semantic memory", chunk_row[2])
        self.assertEqual(job_row[0], "kop_embedding_design")

    def test_tool_marks_operation_source_files_completed_after_successful_write(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model
        from app.core.storage.knowledge_store import (
            claim_knowledge_ingestion_file_batch,
            import_knowledge_folder,
            knowledge_ingestion_file_stats,
        )

        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            data_dir = Path(temp_dir) / "data"
            source_root = repo_root / "raw_policy"
            source_root.mkdir()
            (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", repo_root / "knowledge"),
            ):
                database.initialize_storage()
                imported = import_knowledge_folder(name="Policy", source_path=str(source_root), collection_id="policy_qa")
                operation_id = imported["operation"]["operation_id"]
                claim_knowledge_ingestion_file_batch(operation_id, batch_size=1, run_id="run_batch")
                model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)

                result = module.retrieval_ingestion_writer(
                    {
                        "source_kind": "knowledge_document",
                        "source": {
                            "documents": [
                                {
                                    "document_id": "doc_policy_guide",
                                    "title": "guide.md",
                                    "source_path": "guide.md",
                                    "content": "Policy guide",
                                    "metadata": {"collection": "policy_qa", "source_path": "guide.md"},
                                }
                            ]
                        },
                        "chunks": [
                            {
                                "chunk_id": "chunk_policy_guide",
                                "source_id": "doc_policy_guide",
                                "content": "Policy guide content.",
                                "metadata": {"source_path": "guide.md"},
                            }
                        ],
                        "embedding_model_refs": [model["embedding_model_id"]],
                        "scope": {"collection": "policy_qa"},
                        "operation_id": operation_id,
                        "sync_mode": "upsert",
                    }
                )
                stats = knowledge_ingestion_file_stats(operation_id)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(stats["completed_source_file_count"], 1)
        self.assertEqual(stats["processing_source_file_count"], 0)

    def test_sync_scope_prunes_documents_chunks_indexes_jobs_and_vectors_missing_from_current_run(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector

        module = _load_tool_module()
        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)

        first = module.retrieval_ingestion_writer(
            {
                "source_kind": "knowledge_document",
                "source": {
                    "documents": [
                        {"document_id": "doc_policy_a", "title": "Policy A", "content": "Policy A body."},
                        {"document_id": "doc_policy_b", "title": "Policy B", "content": "Policy B body."},
                    ]
                },
                "chunks": [
                    {"chunk_id": "chunk_policy_a", "source_id": "doc_policy_a", "content": "Policy A searchable text."},
                    {"chunk_id": "chunk_policy_b", "source_id": "doc_policy_b", "content": "Policy B should disappear."},
                ],
                "embedding_model_refs": [model["embedding_model_id"]],
                "scope": {"collection": "policy_library"},
                "sync_mode": "sync_scope",
            }
        )
        stale_chunk = next(chunk for chunk in first["indexed_chunks"] if chunk["chunk_id"] == "chunk_policy_b")
        upsert_embedding_vector(
            chunk_id="chunk_policy_b",
            model_ref=model["embedding_model_id"],
            vector=[0.0, 1.0, 0.0],
            content_hash=stale_chunk["content_hash"],
        )

        second = module.retrieval_ingestion_writer(
            {
                "source_kind": "knowledge_document",
                "source": {
                    "documents": [
                        {"document_id": "doc_policy_a", "title": "Policy A", "content": "Policy A body."},
                    ]
                },
                "chunks": [
                    {"chunk_id": "chunk_policy_a", "source_id": "doc_policy_a", "content": "Policy A searchable text."},
                ],
                "embedding_model_refs": [model["embedding_model_id"]],
                "scope": {"collection": "policy_library"},
                "sync_mode": "sync_scope",
            }
        )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            documents = connection.execute(
                "SELECT source_id FROM retrieval_documents WHERE source_kind = 'knowledge_document' ORDER BY source_id"
            ).fetchall()
            chunks = connection.execute("SELECT chunk_id FROM retrieval_chunks ORDER BY chunk_id").fetchall()
            stale_fts_count = connection.execute(
                "SELECT COUNT(*) FROM retrieval_chunks_fts WHERE chunk_id = 'chunk_policy_b'"
            ).fetchone()[0]
            stale_trigram_count = connection.execute(
                "SELECT COUNT(*) FROM retrieval_chunks_fts_trigram WHERE chunk_id = 'chunk_policy_b'"
            ).fetchone()[0]
            stale_job_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_jobs WHERE chunk_id = 'chunk_policy_b'"
            ).fetchone()[0]
            stale_vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE chunk_id = 'chunk_policy_b'"
            ).fetchone()[0]

        self.assertEqual(second["status"], "succeeded")
        self.assertEqual(second["ingestion_report"]["pruned_document_count"], 1)
        self.assertEqual(second["ingestion_report"]["pruned_chunk_count"], 1)
        self.assertEqual([row[0] for row in documents], ["doc_policy_a"])
        self.assertEqual([row[0] for row in chunks], ["chunk_policy_a"])
        self.assertEqual(stale_fts_count, 0)
        self.assertEqual(stale_trigram_count, 0)
        self.assertEqual(stale_job_count, 0)
        self.assertEqual(stale_vector_count, 0)


if __name__ == "__main__":
    unittest.main()
