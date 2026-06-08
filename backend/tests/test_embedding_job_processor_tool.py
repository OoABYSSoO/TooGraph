from __future__ import annotations

import importlib.util
import json
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

    def test_manifest_exposes_all_scoped_drain_inputs(self) -> None:
        manifest = json.loads((TOOL_DIR / "tool.json").read_text(encoding="utf-8"))
        input_keys = {field["key"] for field in manifest["inputSchema"]}
        output_keys = {field["key"] for field in manifest["outputSchema"]}

        self.assertGreaterEqual(manifest["timeoutSeconds"], 300)
        self.assertGreaterEqual(manifest["runtime"]["timeoutSeconds"], 300)
        self.assertTrue(
            {
                "retry_failed",
                "collection_id",
                "operation_id",
                "source_kind",
                "source_id",
                "time_budget_seconds",
                "include_retry_wait",
            }.issubset(input_keys)
        )
        self.assertTrue({"retry_wait_count", "blocked_count"}.issubset(output_keys))

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

    def test_tool_can_retry_failed_embedding_jobs(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        module = _load_tool_module()
        model = register_embedding_model(provider_key="local", model="retry-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_tool_retry")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_tool_retry", "content": "Retry failed jobs through the tool."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_tool_retry", model["embedding_model_id"])
        update_embedding_job_status(job["job_id"], "failed", error="provider offline")

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.1, 0.2, 0.3], {"provider_id": "local", "model": "retry-embedding"}),
        ):
            result = module.embedding_job_processor(
                {"model_ref": model["embedding_model_id"], "limit": 5, "retry_failed": True}
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["retried_failed_count"], 1)
        self.assertEqual(result["completed_count"], 1)
        self.assertEqual(result["failed_count"], 0)

    def test_tool_accepts_collection_and_operation_scope(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        module = _load_tool_module()
        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        target_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="policy_qa:doc_target",
            scope={"collection": "policy_qa"},
        )
        other_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="policy_qa:doc_other",
            scope={"collection": "policy_qa"},
        )
        upsert_retrieval_chunks(
            target_document["document_id"],
            [{"chunk_id": "chunk_policy_tool_target", "content": "Tool target policy content."}],
        )
        upsert_retrieval_chunks(
            other_document["document_id"],
            [{"chunk_id": "chunk_policy_tool_other", "content": "Tool other policy content."}],
        )
        queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_target",
            model["embedding_model_id"],
            operation_id="kop_policy",
        )
        queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_other",
            model["embedding_model_id"],
            operation_id="kop_other",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([1.0, 0.0, 0.0], {"provider_id": "local", "model": "test-embedding"}),
        ):
            result = module.embedding_job_processor(
                {
                    "model_ref": model["embedding_model_id"],
                    "limit": 5,
                    "collection_id": "policy_qa",
                    "operation_id": "kop_policy",
                    "time_budget_seconds": 60,
                }
            )

        self.assertIn(result["status"], {"succeeded", "paused_retrying", "blocked", "failed"})
        self.assertEqual(result["scope"]["collection_id"], "policy_qa")
        self.assertEqual(result["scope"]["operation_id"], "kop_policy")
        self.assertEqual(result["processed_count"], 1)
        self.assertEqual(result["processed_jobs"][0]["chunk_id"], "chunk_policy_tool_target")

    def test_tool_failure_fallback_matches_processor_report_shape(self) -> None:
        module = _load_tool_module()

        with patch(
            "app.core.storage.embedding_store.process_pending_embedding_jobs",
            side_effect=RuntimeError("processor unavailable"),
        ):
            result = module.embedding_job_processor(
                {
                    "collection_id": "policy_qa",
                    "operation_id": "kop_policy",
                    "source_kind": "knowledge_document",
                    "source_id": "doc_policy",
                }
            )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["retry_wait_count"], 0)
        self.assertEqual(result["blocked_count"], 0)
        self.assertEqual(result["scope"]["collection_id"], "policy_qa")
        self.assertEqual(result["scope"]["source_kind"], "knowledge_document")


if __name__ == "__main__":
    unittest.main()
