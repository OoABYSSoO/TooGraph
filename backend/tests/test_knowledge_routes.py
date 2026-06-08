from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.main import app


class KnowledgeRoutesTests(unittest.TestCase):
    def test_knowledge_routes_import_folder_and_record_graph_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            data_dir = Path(temp_dir) / "data"
            source_root = repo_root / "raw_policy"
            source_root.mkdir()
            (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
            knowledge_root = repo_root / "knowledge"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", knowledge_root),
                TestClient(app) as client,
            ):
                database.initialize_storage()

                response = client.post(
                    "/api/knowledge/imports/folder",
                    json={
                        "name": "Xi'an action policy",
                        "source_path": "raw_policy",
                        "collection_id": "xian_policy",
                        "template_id": "knowledge_folder_retrieval_ingestion",
                    },
                )

                self.assertEqual(response.status_code, 200, response.text)
                payload = response.json()
                self.assertEqual(payload["knowledge_base"]["collection_id"], "xian_policy")
                self.assertEqual(payload["folder_package"]["root"], "knowledge/xian_policy/source")

                operation_id = payload["operation"]["operation_id"]
                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event_jobs:
                    run_response = client.post(
                        "/api/knowledge/bases/xian_policy/runs",
                        json={
                            "run_id": "run_knowledge",
                            "template_id": "knowledge_folder_retrieval_ingestion",
                            "operation_id": operation_id,
                        },
                    )

                self.assertEqual(run_response.status_code, 200, run_response.text)
                run_event_jobs.assert_not_called()
                bases_response = client.get("/api/knowledge/bases")
                self.assertEqual(bases_response.status_code, 200, bases_response.text)
                base = next(item for item in bases_response.json()["bases"] if item["collection_id"] == "xian_policy")
                self.assertEqual(base["last_run_id"], "run_knowledge")
                self.assertEqual(base["template_id"], "knowledge_folder_retrieval_ingestion")
                self.assertEqual(base["current_operation"]["operation_id"], operation_id)
                self.assertEqual(base["current_operation"]["ingestion_run_id"], "run_knowledge")
                self.assertEqual(base["current_operation"]["status"], "ingesting")
                self.assertEqual(base["current_operation"]["stage"], "ingestion_run_started")

    def test_knowledge_operation_retry_pause_and_resume_routes_update_state_and_schedule_events(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            data_dir = Path(temp_dir) / "data"
            source_root = repo_root / "raw_policy"
            source_root.mkdir()
            (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
            knowledge_root = repo_root / "knowledge"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", knowledge_root),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                import_response = client.post(
                    "/api/knowledge/imports/folder",
                    json={
                        "name": "Xi'an action policy",
                        "source_path": "raw_policy",
                        "collection_id": "xian_policy",
                        "template_id": "knowledge_folder_retrieval_ingestion",
                    },
                )
                self.assertEqual(import_response.status_code, 200, import_response.text)
                operation_id = import_response.json()["operation"]["operation_id"]
                model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
                document = upsert_retrieval_document(
                    source_kind="knowledge_document",
                    source_id="xian_policy:guide",
                    scope={"collection": "xian_policy"},
                )
                upsert_retrieval_chunks(
                    document["document_id"],
                    [{"chunk_id": "chunk_xian_retry", "content": "Policy retry content."}],
                )
                [job] = queue_embedding_job(
                    "knowledge_document",
                    "xian_policy:guide",
                    model["embedding_model_id"],
                    operation_id=operation_id,
                )
                update_embedding_job_status(
                    job["job_id"],
                    "retry_wait",
                    error="provider timeout",
                    error_type="provider_timeout",
                    next_retry_at="2999-01-01T00:00:00Z",
                )

                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event_jobs:
                    retry_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{operation_id}/retry")

                self.assertEqual(retry_response.status_code, 200, retry_response.text)
                retry_payload = retry_response.json()
                self.assertEqual(retry_payload["current_operation"]["status"], "embedding")
                self.assertEqual(retry_payload["current_operation"]["stage"], "retry_requested")
                self.assertEqual(retry_payload["pending_embedding_job_count"], 1)
                self.assertEqual(retry_payload["retry_wait_embedding_job_count"], 0)
                run_event_jobs.assert_called_once()
                self.assertEqual(run_event_jobs.call_args.args, ("knowledge.ingestion.completed",))
                self.assertEqual(
                    run_event_jobs.call_args.kwargs["event"],
                    {"collection_id": "xian_policy", "operation_id": operation_id},
                )
                self.assertEqual(run_event_jobs.call_args.kwargs["requested_by"], "knowledge_operation_retry")
                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    row = connection.execute(
                        "SELECT status, last_error, last_error_type, next_retry_at FROM embedding_jobs WHERE job_id = ?",
                        (job["job_id"],),
                    ).fetchone()
                self.assertEqual(row, ("pending", "", "", ""))

                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event_jobs:
                    pause_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{operation_id}/pause")

                self.assertEqual(pause_response.status_code, 200, pause_response.text)
                pause_payload = pause_response.json()
                self.assertEqual(pause_payload["current_operation"]["status"], "paused")
                self.assertEqual(pause_payload["current_operation"]["stage"], "user_paused")
                run_event_jobs.assert_not_called()

                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event_jobs:
                    resume_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{operation_id}/resume")

                self.assertEqual(resume_response.status_code, 200, resume_response.text)
                resume_payload = resume_response.json()
                self.assertEqual(resume_payload["current_operation"]["status"], "embedding")
                self.assertEqual(resume_payload["current_operation"]["stage"], "user_resumed")
                run_event_jobs.assert_called_once()
                self.assertEqual(
                    run_event_jobs.call_args.kwargs["event"],
                    {"collection_id": "xian_policy", "operation_id": operation_id},
                )
                self.assertEqual(run_event_jobs.call_args.kwargs["requested_by"], "knowledge_operation_resume")

    def test_knowledge_operation_routes_return_the_target_operation_when_another_operation_is_latest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            data_dir = Path(temp_dir) / "data"
            source_root = repo_root / "raw_policy"
            source_root.mkdir()
            (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
            knowledge_root = repo_root / "knowledge"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", knowledge_root),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                first_import = client.post(
                    "/api/knowledge/imports/folder",
                    json={
                        "name": "Xi'an action policy",
                        "source_path": "raw_policy",
                        "collection_id": "xian_policy",
                        "template_id": "knowledge_folder_retrieval_ingestion",
                    },
                )
                self.assertEqual(first_import.status_code, 200, first_import.text)
                old_operation_id = first_import.json()["operation"]["operation_id"]
                (source_root / "appendix.md").write_text("Policy appendix", encoding="utf-8")
                second_import = client.post(
                    "/api/knowledge/imports/folder",
                    json={
                        "name": "Xi'an action policy",
                        "source_path": "raw_policy",
                        "collection_id": "xian_policy",
                        "template_id": "knowledge_folder_retrieval_ingestion",
                    },
                )
                self.assertEqual(second_import.status_code, 200, second_import.text)
                latest_operation_id = second_import.json()["operation"]["operation_id"]
                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    connection.execute(
                        "UPDATE knowledge_indexing_operations SET updated_at = ? WHERE operation_id = ?",
                        ("2999-01-01T00:00:00Z", latest_operation_id),
                    )
                    connection.commit()

                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs"):
                    retry_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{old_operation_id}/retry")
                pause_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{old_operation_id}/pause")
                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs"):
                    resume_response = client.post(f"/api/knowledge/bases/xian_policy/operations/{old_operation_id}/resume")

                self.assertEqual(retry_response.status_code, 200, retry_response.text)
                self.assertEqual(pause_response.status_code, 200, pause_response.text)
                self.assertEqual(resume_response.status_code, 200, resume_response.text)
                self.assertEqual(retry_response.json()["current_operation"]["operation_id"], old_operation_id)
                self.assertEqual(retry_response.json()["current_operation"]["stage"], "retry_requested")
                self.assertEqual(pause_response.json()["current_operation"]["operation_id"], old_operation_id)
                self.assertEqual(pause_response.json()["current_operation"]["stage"], "user_paused")
                self.assertEqual(resume_response.json()["current_operation"]["operation_id"], old_operation_id)
                self.assertEqual(resume_response.json()["current_operation"]["stage"], "user_resumed")

    def test_knowledge_operation_routes_reject_wrong_collection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            data_dir = Path(temp_dir) / "data"
            source_root = repo_root / "raw_policy"
            source_root.mkdir()
            (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
            knowledge_root = repo_root / "knowledge"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", knowledge_root),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                import_response = client.post(
                    "/api/knowledge/imports/folder",
                    json={
                        "name": "Xi'an action policy",
                        "source_path": "raw_policy",
                        "collection_id": "xian_policy",
                    },
                )
                self.assertEqual(import_response.status_code, 200, import_response.text)
                operation_id = import_response.json()["operation"]["operation_id"]

                with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event_jobs:
                    retry_response = client.post(f"/api/knowledge/bases/other_policy/operations/{operation_id}/retry")

                self.assertEqual(retry_response.status_code, 404, retry_response.text)
                run_event_jobs.assert_not_called()


if __name__ == "__main__":
    unittest.main()
