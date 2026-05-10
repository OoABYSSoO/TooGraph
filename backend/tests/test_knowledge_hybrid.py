from __future__ import annotations

import json
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.knowledge import loader
from app.knowledge.loader import (
    KnowledgeBaseRecord,
    KnowledgeDocument,
    list_knowledge_bases,
    rebuild_knowledge_base_embeddings,
    search_knowledge,
)
from app.main import app


class KnowledgeHybridTests(unittest.TestCase):
    @contextmanager
    def isolated_knowledge_store(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "data"
            db_path = data_dir / "toograph.db"
            kb_root = data_dir / "kb"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch("app.knowledge.loader.KNOWLEDGE_ROOT", kb_root),
                patch("app.knowledge.loader.DOWNLOAD_ROOT", kb_root / "_downloads"),
            ):
                database.initialize_storage()
                yield root

    def test_rebuild_knowledge_embeddings_records_provider_model_and_content_hash(self) -> None:
        with self.isolated_knowledge_store():
            imported = self.seed_knowledge_base()

            report = rebuild_knowledge_base_embeddings(
                "hybrid-test",
                provider="local-hash",
                model="hashing-v1",
                dimension=64,
            )

            self.assertEqual(report["kb_id"], "hybrid-test")
            self.assertEqual(report["provider"], "local-hash")
            self.assertEqual(report["model"], "hashing-v1")
            self.assertEqual(report["dimension"], 64)
            self.assertEqual(report["embeddingCount"], imported["chunkCount"])

            [base] = list_knowledge_bases()
            self.assertEqual(base["embeddingProvider"], "local-hash")
            self.assertEqual(base["embeddingModel"], "hashing-v1")
            self.assertEqual(base["embeddingDimension"], 64)
            self.assertEqual(base["embeddingCount"], imported["chunkCount"])
            self.assertTrue(base["embeddingUpdatedAt"])

            with database.get_connection() as connection:
                rows = connection.execute(
                    """
                    SELECT embedding_provider, embedding_model, embedding_dimension, content_hash, embedding_json
                    FROM knowledge_chunk_embeddings
                    WHERE kb_id = ?
                    """,
                    ("hybrid-test",),
                ).fetchall()

            self.assertEqual(len(rows), imported["chunkCount"])
            self.assertTrue(rows[0]["content_hash"])
            self.assertEqual(rows[0]["embedding_provider"], "local-hash")
            self.assertEqual(rows[0]["embedding_model"], "hashing-v1")
            self.assertEqual(rows[0]["embedding_dimension"], 64)
            self.assertEqual(len(json.loads(rows[0]["embedding_json"])), 64)

    def test_search_knowledge_exposes_hybrid_citations_and_metadata_filter(self) -> None:
        with self.isolated_knowledge_store():
            self.seed_knowledge_base()
            rebuild_knowledge_base_embeddings("hybrid-test", dimension=48)

            results = search_knowledge(
                "refund audit",
                knowledge_base="hybrid-test",
                limit=5,
                metadata_filter={"source_path_prefix": "docs/policies/"},
            )

            self.assertGreaterEqual(len(results), 1)
            self.assertTrue(all(str(item["metadata"]["source_path"]).startswith("docs/policies/") for item in results))
            self.assertEqual(results[0]["citation_id"], "kb:hybrid-test:1")
            self.assertEqual(results[0]["retrieval"]["mode"], "hybrid")
            self.assertGreater(results[0]["retrieval"]["vector_score"], 0)
            self.assertIn("chunk_id", results[0])

    def test_rebuild_endpoint_returns_embedding_report(self) -> None:
        with self.isolated_knowledge_store():
            self.seed_knowledge_base()
            with TestClient(app) as client:
                response = client.post(
                    "/api/knowledge/bases/hybrid-test/rebuild",
                    json={"provider": "local-hash", "model": "hashing-v1", "dimension": 32},
                )

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(payload["kb_id"], "hybrid-test")
            self.assertEqual(payload["embeddingCount"], payload["chunkCount"])
            self.assertEqual(payload["provider"], "local-hash")
            self.assertEqual(payload["model"], "hashing-v1")
            self.assertEqual(payload["dimension"], 32)

    def test_search_endpoint_returns_empty_list_without_imported_knowledge_bases(self) -> None:
        with self.isolated_knowledge_store():
            with TestClient(app) as client:
                response = client.get("/api/knowledge", params={"query": "TooGraph"})

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), [])

    def seed_knowledge_base(self) -> dict[str, object]:
        record = KnowledgeBaseRecord(
            kb_id="hybrid-test",
            label="Hybrid Test",
            description="Hybrid RAG test knowledge base.",
            source_kind="unit_test",
            source_url="",
            version="v1",
            payload={"fixture": True},
        )
        documents = [
            KnowledgeDocument(
                doc_id="refund-policy",
                title="Refund Policy",
                url="https://example.test/refund",
                section="Refund audit rules",
                content=(
                    "Refund audit policy requires support tickets, purchase timestamp, "
                    "approval notes, and citation-ready evidence before a reimbursement is accepted. "
                    "The refund window is thirty days."
                ),
                source_path="docs/policies/refund.md",
                metadata={"source_path": "docs/policies/refund.md", "source_kind": "policy"},
            ),
            KnowledgeDocument(
                doc_id="release-notes",
                title="Release Notes",
                url="https://example.test/release",
                section="Product release",
                content=(
                    "Release notes describe feature rollout dates, deployment owners, "
                    "and migration reminders for the internal dashboard."
                ),
                source_path="docs/releases/may.md",
                metadata={"source_path": "docs/releases/may.md", "source_kind": "release"},
            ),
        ]
        return loader._replace_knowledge_base(record, documents)


if __name__ == "__main__":
    unittest.main()
