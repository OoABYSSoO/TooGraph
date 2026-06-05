from __future__ import annotations

import json
import sys
import sqlite3
import threading
import tempfile
import unittest
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.buddy import store as buddy_store
from app.scheduler import runner, store


class CapturingBackgroundTasks:
    def __init__(self) -> None:
        self.tasks: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

    def add_task(self, func: Any, *args: Any, **kwargs: Any) -> None:
        self.tasks.append((func, args, kwargs))


class _FakeEmbeddingHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, Any]] = []

    def do_POST(self) -> None:  # noqa: N802 - http.server hook
        body = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
        payload = json.loads(body.decode("utf-8") or "{}")
        self.__class__.requests.append({"path": self.path, "payload": payload})
        response = {
            "id": "emb_test_1",
            "model": payload.get("model") or "test-embedding",
            "data": [{"index": 0, "embedding": [0.5, 0.25, 0.125]}],
            "usage": {"prompt_tokens": 3, "total_tokens": 3},
        }
        encoded = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:
        return


class FakeEmbeddingServer:
    def __enter__(self) -> "FakeEmbeddingServer":
        _FakeEmbeddingHandler.requests = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeEmbeddingHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    @property
    def base_url(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}/v1"

    @property
    def requests(self) -> list[dict[str, Any]]:
        return _FakeEmbeddingHandler.requests


class SchedulerRunnerTests(unittest.TestCase):
    def test_event_job_resolves_event_input_bindings_and_starts_graph_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                job = store.create_scheduled_graph_job(
                    {
                        "job_id": "event_buddy_message_ingestion",
                        "name": "Buddy message ingestion",
                        "template_id": "buddy_message_retrieval_ingestion",
                        "input_bindings": {"session_id": "{{event.session_id}}"},
                        "schedule_kind": "event",
                        "schedule_expr": "buddy.message.created",
                        "enabled": True,
                    },
                    now="2026-05-27T00:00:00Z",
                )
                background_tasks = CapturingBackgroundTasks()

                result = runner.run_event_scheduled_graph_jobs(
                    "buddy.message.created",
                    event={
                        "session_id": "session_event_1",
                        "message_id": "msg_event_1",
                        "role": "user",
                    },
                    background_tasks=background_tasks,
                    requested_by="buddy_message_created",
                )

        self.assertEqual(result["started_count"], 1)
        self.assertEqual(result["skipped_count"], 0)
        self.assertEqual(result["started"][0]["job"]["job_id"], job["job_id"])
        self.assertEqual(result["started"][0]["job_run"]["trigger_reason"], "event")
        self.assertEqual(
            result["started"][0]["job_run"]["metadata"]["scheduled_graph_event"],
            {
                "name": "buddy.message.created",
                "payload": {
                    "session_id": "session_event_1",
                    "message_id": "msg_event_1",
                    "role": "user",
                },
            },
        )
        self.assertEqual(len(background_tasks.tasks), 1)
        _, task_args, _ = background_tasks.tasks[0]
        graph = task_args[0]
        graph_data = graph.model_dump(by_alias=True, mode="json")
        self.assertEqual(graph_data["state_schema"]["session_id"]["value"], "session_event_1")
        self.assertEqual(graph_data["metadata"]["scheduled_graph_trigger_reason"], "event")
        self.assertEqual(graph_data["metadata"]["scheduled_graph_event"]["name"], "buddy.message.created")
        self.assertEqual(graph_data["metadata"]["scheduled_graph_job"]["applied_input_keys"], ["session_id"])

    def test_buddy_message_event_job_runs_ingestion_graph_and_queues_window_embedding_job(self) -> None:
        embedding_settings = {
            "embedding_model_ref": "local/text-embedding-qwen3-embedding-8b",
            "model_providers": {
                "local": {
                    "label": "Local",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:1234/v1",
                    "enabled": True,
                    "models": [
                        {
                            "model": "text-embedding-qwen3-embedding-8b",
                            "label": "text-embedding-qwen3-embedding-8b",
                            "capabilities": {"chat": False, "embedding": True},
                            "embedding": {"dimensions": 4096},
                        }
                    ],
                }
            },
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            buddy_home = Path(temp_dir) / "buddy_home"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(buddy_store, "BUDDY_HOME_DIR", buddy_home),
            ):
                database.initialize_storage()
                settings_dir = data_dir / "settings"
                settings_dir.mkdir(parents=True, exist_ok=True)
                (settings_dir / "app_settings.json").write_text(
                    json.dumps(embedding_settings, ensure_ascii=False),
                    encoding="utf-8",
                )
                session = buddy_store.create_chat_session({}, changed_by="user", change_reason="test session")
                user_message = buddy_store.append_chat_message(
                    session["session_id"],
                    {
                        "role": "user",
                        "content": "请记住：我正在测试新的 Buddy 消息检索入库链路。",
                    },
                    changed_by="user",
                    change_reason="test append user",
                )
                buddy_store.append_chat_message(
                    session["session_id"],
                    {
                        "role": "assistant",
                        "content": "已记录，我们会通过图模板完成切片和入库。",
                        "run_id": "run_ingestion_check",
                    },
                    changed_by="buddy",
                    change_reason="test append assistant",
                )
                job = store.create_scheduled_graph_job(
                    {
                        "job_id": "event_buddy_message_ingestion",
                        "name": "Buddy message ingestion",
                        "template_id": "buddy_message_retrieval_ingestion",
                        "input_bindings": {"session_id": "{{event.session_id}}"},
                        "schedule_kind": "event",
                        "schedule_expr": "buddy.message.created",
                        "enabled": True,
                    },
                    now="2026-05-27T00:00:00Z",
                )
                background_tasks = CapturingBackgroundTasks()

                result = runner.run_event_scheduled_graph_jobs(
                    "buddy.message.created",
                    event={
                        "session_id": session["session_id"],
                        "message_id": user_message["message_id"],
                        "role": "user",
                    },
                    background_tasks=background_tasks,
                    requested_by="buddy_message_created",
                )
                task_func, task_args, task_kwargs = background_tasks.tasks[0]
                task_func(*task_args, **task_kwargs)
                job_run = store.load_scheduled_graph_job_run(
                    result["started"][0]["job_run"]["job_run_id"]
                )

                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    window_chunks = connection.execute(
                        """
                        SELECT chunk_id, source_id, content
                        FROM retrieval_chunks
                        WHERE source_kind = 'buddy_message'
                          AND chunk_id LIKE 'source_chunker:buddy_message_window:%'
                        ORDER BY ordinal ASC
                        """
                    ).fetchall()
                    embedding_jobs = connection.execute(
                        """
                        SELECT source_kind, source_id, chunk_id, embedding_model_id, status
                        FROM embedding_jobs
                        WHERE source_kind = 'buddy_message'
                          AND chunk_id LIKE 'source_chunker:buddy_message_window:%'
                        ORDER BY chunk_id ASC
                        """
                    ).fetchall()
                    model_row = connection.execute(
                        """
                        SELECT embedding_model_id, provider_key, model, dimensions, enabled
                        FROM embedding_models
                        WHERE provider_key = 'local' AND model = 'text-embedding-qwen3-embedding-8b'
                        """
                    ).fetchone()

        self.assertEqual(result["started_count"], 1)
        self.assertEqual(job_run["job_id"], job["job_id"])
        self.assertEqual(job_run["status"], "completed")
        self.assertGreaterEqual(len(window_chunks), 1)
        self.assertTrue(str(window_chunks[0][0]).startswith("source_chunker:buddy_message_window:"))
        self.assertIn(session["session_id"], str(window_chunks[0][1]))
        self.assertIn("新的 Buddy 消息检索入库链路", str(window_chunks[0][2]))
        self.assertIsNotNone(model_row)
        self.assertEqual(model_row[1:], ("local", "text-embedding-qwen3-embedding-8b", 4096, 1))
        self.assertEqual(len(embedding_jobs), len(window_chunks))
        self.assertEqual(embedding_jobs[0][0], "buddy_message")
        self.assertEqual(embedding_jobs[0][3], model_row[0])
        self.assertEqual(embedding_jobs[0][4], "pending")

    def test_due_embedding_maintenance_job_processes_pending_jobs_into_vectors(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                FakeEmbeddingServer() as embedding_server,
            ):
                database.initialize_storage()
                settings_dir = data_dir / "settings"
                settings_dir.mkdir(parents=True, exist_ok=True)
                (settings_dir / "app_settings.json").write_text(
                    json.dumps(
                        {
                            "model_providers": {
                                "local": {
                                    "label": "Local",
                                    "transport": "openai-compatible",
                                    "base_url": embedding_server.base_url,
                                    "api_key": "sk-test",
                                    "request_timeout_seconds": 5,
                                    "enabled": True,
                                    "models": [
                                        {
                                            "model": "test-embedding",
                                            "label": "test-embedding",
                                            "capabilities": {"chat": False, "embedding": True},
                                            "embedding": {"dimensions": 3},
                                        }
                                    ],
                                }
                            }
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model
                from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

                model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
                document = upsert_retrieval_document(source_kind="buddy_message", source_id="session_1:msg_1:msg_1")
                [chunk] = upsert_retrieval_chunks(
                    document["document_id"],
                    [
                        {
                            "chunk_id": "chunk_maintenance_success",
                            "content": "Maintenance should turn queued jobs into vectors.",
                        }
                    ],
                )
                [embedding_job] = queue_embedding_job(
                    "buddy_message",
                    "session_1:msg_1:msg_1",
                    model["embedding_model_id"],
                )
                job = store.create_scheduled_graph_job(
                    {
                        "job_id": "embedding_maintenance_due",
                        "name": "Embedding maintenance due",
                        "template_id": "embedding_maintenance",
                        "input_bindings": {"model_ref": model["embedding_model_id"], "job_limit": 5},
                        "schedule_kind": "interval",
                        "schedule_expr": "PT1H",
                        "enabled": True,
                    },
                    now="2026-05-27T00:00:00Z",
                )
                background_tasks = CapturingBackgroundTasks()

                result = runner.run_due_scheduled_graph_jobs(
                    background_tasks=background_tasks,
                    now="2026-05-27T01:00:01Z",
                    requested_by="scheduler",
                )
                task_func, task_args, task_kwargs = background_tasks.tasks[0]
                task_func(*task_args, **task_kwargs)
                run_state = task_args[1]
                job_run = store.load_scheduled_graph_job_run(result["started"][0]["job_run"]["job_run_id"])

                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    job_row = connection.execute(
                        "SELECT status, completed_at, last_error FROM embedding_jobs WHERE job_id = ?",
                        (embedding_job["job_id"],),
                    ).fetchone()
                    vector_row = connection.execute(
                        """
                        SELECT chunk_id, embedding_model_id, vector_json, content_hash
                        FROM embedding_vectors
                        WHERE chunk_id = ?
                        """,
                        (chunk["chunk_id"],),
                    ).fetchone()

        self.assertEqual(result["started_count"], 1)
        self.assertEqual(result["started"][0]["job"]["job_id"], job["job_id"])
        self.assertEqual(job_run["status"], "completed")
        self.assertEqual(job_row[0], "completed")
        self.assertTrue(job_row[1])
        self.assertEqual(job_row[2], "")
        self.assertEqual(vector_row[0], chunk["chunk_id"])
        self.assertEqual(vector_row[1], model["embedding_model_id"])
        self.assertEqual(json.loads(vector_row[2]), [0.5, 0.25, 0.125])
        self.assertEqual(vector_row[3], chunk["content_hash"])
        self.assertEqual(run_state["state_values"]["processor_status"], "succeeded")
        self.assertEqual(run_state["state_values"]["completed_count"], 1)
        self.assertEqual(embedding_server.requests[0]["path"], "/v1/embeddings")
        self.assertEqual(embedding_server.requests[0]["payload"]["input"], "Maintenance should turn queued jobs into vectors.")

    def test_message_ingestion_then_embedding_maintenance_enables_hybrid_recall(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            buddy_home = Path(temp_dir) / "buddy_home"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(buddy_store, "BUDDY_HOME_DIR", buddy_home),
                FakeEmbeddingServer() as embedding_server,
            ):
                database.initialize_storage()
                settings_dir = data_dir / "settings"
                settings_dir.mkdir(parents=True, exist_ok=True)
                embedding_settings = {
                    "embedding_model_ref": "local/test-embedding",
                    "model_providers": {
                        "local": {
                            "label": "Local",
                            "transport": "openai-compatible",
                            "base_url": embedding_server.base_url,
                            "api_key": "sk-test",
                            "request_timeout_seconds": 5,
                            "enabled": True,
                            "models": [
                                {
                                    "model": "test-embedding",
                                    "label": "test-embedding",
                                    "capabilities": {"chat": False, "embedding": True},
                                    "embedding": {"dimensions": 3},
                                }
                            ],
                        }
                    },
                }
                (settings_dir / "app_settings.json").write_text(
                    json.dumps(embedding_settings, ensure_ascii=False),
                    encoding="utf-8",
                )
                session = buddy_store.create_chat_session({"title": "Recall source"}, changed_by="user", change_reason="test")
                message = buddy_store.append_chat_message(
                    session["session_id"],
                    {
                        "role": "assistant",
                        "content": "vector-recall-marker should become searchable after maintenance.",
                    },
                    changed_by="buddy",
                    change_reason="test append",
                )
                store.create_scheduled_graph_job(
                    {
                        "job_id": "event_buddy_message_ingestion",
                        "name": "Buddy message ingestion",
                        "template_id": "buddy_message_retrieval_ingestion",
                        "input_bindings": {"session_id": "{{event.session_id}}"},
                        "schedule_kind": "event",
                        "schedule_expr": "buddy.message.created",
                        "enabled": True,
                    },
                    now="2026-05-27T00:00:00Z",
                )
                ingestion_tasks = CapturingBackgroundTasks()
                ingestion_result = runner.run_event_scheduled_graph_jobs(
                    "buddy.message.created",
                    event={"session_id": session["session_id"], "message_id": message["message_id"], "role": "assistant"},
                    background_tasks=ingestion_tasks,
                    requested_by="buddy_message_created",
                )
                ingestion_func, ingestion_args, ingestion_kwargs = ingestion_tasks.tasks[0]
                ingestion_func(*ingestion_args, **ingestion_kwargs)

                maintenance_job = store.create_scheduled_graph_job(
                    {
                        "job_id": "embedding_maintenance_due",
                        "name": "Embedding maintenance due",
                        "template_id": "embedding_maintenance",
                        "input_bindings": {"model_ref": "", "job_limit": 10},
                        "schedule_kind": "interval",
                        "schedule_expr": "PT1H",
                        "enabled": True,
                    },
                    now="2026-05-27T00:00:00Z",
                )
                maintenance_tasks = CapturingBackgroundTasks()
                maintenance_result = runner.run_due_scheduled_graph_jobs(
                    background_tasks=maintenance_tasks,
                    now="2026-05-27T01:00:01Z",
                    requested_by="scheduler",
                )
                maintenance_func, maintenance_args, maintenance_kwargs = maintenance_tasks.tasks[0]
                maintenance_func(*maintenance_args, **maintenance_kwargs)

                with patch("app.tools.model_provider_client.load_app_settings", return_value=embedding_settings):
                    recall = buddy_store.search_chat_sessions(
                        query="vector-recall-marker",
                        embedding_model_ref="local/test-embedding",
                        limit=5,
                    )
                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    vector_count = connection.execute("SELECT COUNT(*) FROM embedding_vectors").fetchone()[0]
                    completed_job_count = connection.execute(
                        "SELECT COUNT(*) FROM embedding_jobs WHERE status = 'completed'"
                    ).fetchone()[0]

        self.assertEqual(ingestion_result["started_count"], 1)
        self.assertEqual(maintenance_result["started_count"], 1)
        self.assertEqual(maintenance_result["started"][0]["job"]["job_id"], maintenance_job["job_id"])
        self.assertGreaterEqual(vector_count, 1)
        self.assertGreaterEqual(completed_job_count, 1)
        self.assertEqual(recall["kind"], "buddy_session_search")
        self.assertEqual(recall["report"]["mode"], "hybrid")
        self.assertEqual(recall["session_count"], 1)
        self.assertEqual(recall["sessions"][0]["session_id"], session["session_id"])
        self.assertEqual(recall["sessions"][0]["match_message_id"], message["message_id"])
        self.assertEqual(recall["sessions"][0]["retrieval"]["mode"], "hybrid")


if __name__ == "__main__":
    unittest.main()
