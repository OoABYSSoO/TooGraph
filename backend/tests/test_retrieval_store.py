from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


class RetrievalStoreTests(unittest.TestCase):
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

    def test_upsert_documents_and_chunks_for_supported_source_kinds(self) -> None:
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        source_kinds = ["buddy_message", "graph_output", "node_summary", "memory_entry"]
        for index, source_kind in enumerate(source_kinds):
            document = upsert_retrieval_document(
                source_kind=source_kind,
                source_id=f"{source_kind}_1",
                source_revision_id=f"rev_{index}",
                title=f"{source_kind} title",
                content=f"{source_kind} content",
                scope={"workspace": "test"},
                metadata={"kind": source_kind},
            )
            chunks = upsert_retrieval_chunks(
                document["document_id"],
                [
                    {
                        "chunk_id": f"chunk_{source_kind}",
                        "content": f"{source_kind} chunk body",
                        "source_locator": {"field": "content"},
                        "metadata": {"ordinal": index},
                    }
                ],
            )
            self.assertEqual(chunks[0]["source_ref"]["source_kind"], source_kind)
            self.assertEqual(chunks[0]["source_ref"]["source_id"], f"{source_kind}_1")
            self.assertEqual(chunks[0]["source_ref"]["source_revision_id"], f"rev_{index}")

        with sqlite3.connect(database.DB_PATH) as connection:
            document_count = connection.execute("SELECT COUNT(*) FROM retrieval_documents").fetchone()[0]
            chunk_count = connection.execute("SELECT COUNT(*) FROM retrieval_chunks").fetchone()[0]

        self.assertEqual(document_count, 4)
        self.assertEqual(chunk_count, 4)

    def test_search_retrieval_fts_returns_snippet_score_and_source_ref(self) -> None:
        from app.core.storage.retrieval_store import (
            search_retrieval_fts,
            upsert_retrieval_chunks,
            upsert_retrieval_document,
        )

        document = upsert_retrieval_document(
            source_kind="buddy_message",
            source_id="msg_1",
            source_revision_id="rev_1",
            title="Refund discussion",
            content="",
            scope={"session_id": "session_1"},
            metadata={},
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {
                    "chunk_id": "chunk_refund",
                    "content": "Refund audit requires purchase timestamp and support ticket evidence.",
                    "source_locator": {"message_id": "msg_1"},
                    "metadata": {"role": "user"},
                }
            ],
        )

        results = search_retrieval_fts("refund audit", filters={"source_kind": "buddy_message"}, limit=5)

        self.assertEqual(results[0]["chunk_id"], "chunk_refund")
        self.assertIn("snippet", results[0])
        self.assertIsInstance(results[0]["score"], float)
        self.assertEqual(
            results[0]["source_ref"],
            {
                "source_kind": "buddy_message",
                "source_id": "msg_1",
                "source_revision_id": "rev_1",
                "source_locator": {"message_id": "msg_1"},
            },
        )

    def test_trigram_fts_supports_chinese_substring_query(self) -> None:
        from app.core.storage.retrieval_store import (
            search_retrieval_fts,
            upsert_retrieval_chunks,
            upsert_retrieval_document,
        )

        document = upsert_retrieval_document(
            source_kind="memory_entry",
            source_id="mem_1",
            title="偏好记忆",
            content="",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_cn", "content": "用户喜欢先看结论，然后再看细节。"}],
        )

        results = search_retrieval_fts("先看结论", filters={}, limit=5)

        self.assertEqual(results[0]["chunk_id"], "chunk_cn")
        self.assertEqual(results[0]["retrieval"]["mode"], "trigram")

    def test_short_cjk_query_uses_like_fallback_with_context_window(self) -> None:
        from app.core.storage.retrieval_store import (
            search_retrieval_fts,
            upsert_retrieval_chunks,
            upsert_retrieval_document,
        )

        document = upsert_retrieval_document(
            source_kind="graph_output",
            source_id="output_1",
            title="运行输出",
            content="",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_like", "content": "这次运行输出提到了预算和召回。"}],
        )

        results = search_retrieval_fts("预算", filters={}, limit=5)

        self.assertEqual(results[0]["chunk_id"], "chunk_like")
        self.assertEqual(results[0]["retrieval"]["mode"], "like")
        self.assertIn(">>>预算<<<", results[0]["snippet"])

    def test_rebuild_retrieval_indexes_restores_search_without_changing_fact_rows(self) -> None:
        from app.core.storage.retrieval_store import (
            rebuild_retrieval_indexes,
            search_retrieval_fts,
            upsert_retrieval_chunks,
            upsert_retrieval_document,
        )

        document = upsert_retrieval_document(
            source_kind="node_summary",
            source_id="node_1",
            title="Node summary",
            content="",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_node", "content": "Node summary contains planning evidence."}],
        )
        with sqlite3.connect(database.DB_PATH) as connection:
            before = connection.execute("SELECT COUNT(*) FROM retrieval_chunks").fetchone()[0]
            connection.execute("DELETE FROM retrieval_chunks_fts")
            connection.execute("DELETE FROM retrieval_chunks_fts_trigram")
            connection.commit()

        self.assertEqual(search_retrieval_fts("planning evidence", filters={}, limit=5), [])

        report = rebuild_retrieval_indexes()
        results = search_retrieval_fts("planning evidence", filters={}, limit=5)

        with sqlite3.connect(database.DB_PATH) as connection:
            after = connection.execute("SELECT COUNT(*) FROM retrieval_chunks").fetchone()[0]

        self.assertEqual(report["chunk_count"], 1)
        self.assertEqual(before, after)
        self.assertEqual(results[0]["chunk_id"], "chunk_node")


if __name__ == "__main__":
    unittest.main()
