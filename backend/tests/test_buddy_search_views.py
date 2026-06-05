from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.buddy import commands
from app.core.storage import database
from app.core.storage.context_assembly_store import create_context_assembly
from app.core.storage.run_store import save_run
from app.main import app


def _project_memory_for_test_recall(memory: dict[str, object]) -> dict[str, object]:
    from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

    document = upsert_retrieval_document(
        document_id=f"test_memory_doc_{memory['memory_id']}",
        source_kind="memory_entry",
        source_id=str(memory["memory_id"]),
        source_revision_id=str(memory.get("latest_revision_id") or ""),
        title=str(memory.get("title") or ""),
        content=str(memory.get("content") or ""),
        scope={
            "scope_kind": memory.get("scope_kind"),
            "scope_id": memory.get("scope_id"),
            "layer": memory.get("layer"),
        },
        metadata={"memory_type": memory.get("memory_type"), "status": memory.get("status")},
    )
    [chunk] = upsert_retrieval_chunks(
        document["document_id"],
        [
            {
                "chunk_id": f"test_memory_chunk_{memory['memory_id']}",
                "content": str(memory.get("content") or ""),
                "source_locator": {"field": "content"},
                "metadata": {
                    "scope_kind": memory.get("scope_kind"),
                    "scope_id": memory.get("scope_id"),
                    "layer": memory.get("layer"),
                    "memory_type": memory.get("memory_type"),
                    "status": memory.get("status"),
                },
            }
        ],
    )
    return chunk


def _project_buddy_message_window_for_test_recall(message: dict[str, object]) -> dict[str, object]:
    from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

    message_id = str(message["message_id"])
    session_id = str(message["session_id"])
    source_id = f"{session_id}:{message_id}:{message_id}"
    content = str(message.get("content") or "")
    document = upsert_retrieval_document(
        document_id=f"test_buddy_message_window_doc_{message_id}",
        source_kind="buddy_message",
        source_id=source_id,
        title="Buddy message window",
        content=content,
        scope={"session_id": session_id},
        metadata={"role": "buddy_message_window", "message_ids": [message_id]},
    )
    [chunk] = upsert_retrieval_chunks(
        document["document_id"],
        [
            {
                "chunk_id": f"test_buddy_message_window_chunk_{message_id}",
                "content": content,
                "source_locator": {
                    "session_id": session_id,
                    "message_ids": [message_id],
                    "primary_message_ids": [message_id],
                },
                "metadata": {
                    "strategy": "conversation_turn_window",
                    "session_id": session_id,
                    "message_ids": [message_id],
                    "primary_message_ids": [message_id],
                },
            }
        ],
    )
    return chunk


class BuddySearchViewTests(unittest.TestCase):
    def test_search_sessions_returns_lineage_aware_message_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                current = store.create_chat_session({"title": "当前会话"}, changed_by="user", change_reason="test")
                current_child = store.create_chat_session(
                    {"title": "当前分支", "parent_session_id": current["session_id"]},
                    changed_by="user",
                    change_reason="test",
                )
                other = store.create_chat_session({"title": "证据会话"}, changed_by="user", change_reason="test")
                store.append_chat_message(
                    current_child["session_id"],
                    {"role": "user", "content": "当前分支里的 evidence-alpha 不应被召回"},
                    changed_by="user",
                    change_reason="test",
                )
                hit_message = store.append_chat_message(
                    other["session_id"],
                    {"role": "assistant", "content": "这里保存了 evidence-alpha 的历史结论。"},
                    changed_by="buddy",
                    change_reason="test",
                )

                result = store.search_chat_sessions(
                    query="evidence-alpha",
                    current_session_id=current["session_id"],
                    limit=5,
                )

        self.assertEqual(result["kind"], "buddy_session_search")
        self.assertEqual(result["query"], "evidence-alpha")
        self.assertEqual(result["session_count"], 1)
        self.assertEqual(result["sessions"][0]["session_id"], other["session_id"])
        self.assertEqual(result["sessions"][0]["match_message_id"], hit_message["message_id"])
        self.assertIn(hit_message["message_id"], result["message_ids"])
        self.assertIn("evidence-alpha", result["sessions"][0]["snippet"])

    def test_search_sessions_uses_embedding_hybrid_retrieval_for_message_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model

                model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
                session = store.create_chat_session({"title": "Hybrid session"}, changed_by="user", change_reason="test")
                message = store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "session-hybrid-evidence refund audit details should be semantically searchable."},
                    changed_by="buddy",
                    change_reason="test",
                )
                chunk = _project_buddy_message_window_for_test_recall(message)
                queue_embedding_job("buddy_message", str(chunk["source_id"]), model["embedding_model_id"])
                with patch(
                    "app.core.storage.embedding_store.embed_text_with_model_ref",
                    return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
                ):
                    embedding_report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

                with patch(
                    "app.core.storage.retrieval_store.embed_text_with_model_ref",
                    return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
                ):
                    result = store.search_chat_sessions(
                        query="refund audit",
                        embedding_model_ref=model["embedding_model_id"],
                        limit=5,
                    )

        self.assertGreaterEqual(embedding_report["completed_count"], 1)
        self.assertEqual(result["kind"], "buddy_session_search")
        self.assertEqual(result["embedding_model_ref"], model["embedding_model_id"])
        self.assertEqual(result["report"]["mode"], "hybrid")
        self.assertEqual(result["session_count"], 1)
        self.assertEqual(result["sessions"][0]["session_id"], session["session_id"])
        self.assertEqual(result["sessions"][0]["match_message_id"], message["message_id"])
        self.assertEqual(result["sessions"][0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(result["sessions"][0]["retrieval"]["vector_score"], 0)
        ranking_report = result["report"]["ranking_reports"][0]
        self.assertEqual(ranking_report["kind"], "retrieval_ranking_report")
        self.assertEqual(ranking_report["query_text"], "refund audit")
        self.assertEqual(ranking_report["mode"], "hybrid")
        self.assertEqual(ranking_report["embedding_model_ref"], model["embedding_model_id"])
        self.assertGreaterEqual(ranking_report["result_count"], 1)
        self.assertEqual(ranking_report["ranked_results"][0]["rank"], 1)
        self.assertIn(
            message["message_id"],
            ranking_report["ranked_results"][0]["source_ref"]["source_locator"]["message_ids"],
        )
        self.assertIn("lexical_score + vector_score", ranking_report["score_formula"])

    def test_search_sessions_expands_hit_message_and_run_source_refs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                session = store.create_chat_session({"title": "source refs"}, changed_by="user", change_reason="test")
                message = store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "source-ref-evidence came from a graph run.", "run_id": "run_source_ref"},
                    changed_by="buddy",
                    change_reason="test",
                )

                result = store.search_chat_sessions(query="source-ref-evidence", limit=5)

        source_refs = result["sessions"][0]["source_refs"]
        self.assertIn(
            {"source_kind": "buddy_message", "source_id": message["message_id"], "role": "assistant"},
            source_refs,
        )
        self.assertIn(
            {"source_kind": "graph_run", "source_id": "run_source_ref", "relation": "primary", "message_id": message["message_id"]},
            source_refs,
        )

    def test_search_sessions_expands_per_session_summary_source_refs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                session = store.create_chat_session({"title": "summary refs"}, changed_by="user", change_reason="test")
                message = store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "summary-ref-evidence should remain traceable after compaction."},
                    changed_by="buddy",
                    change_reason="test",
                )
                save_run(
                    {
                        "run_id": "run_summary_ref",
                        "graph_id": "graph_summary_ref",
                        "graph_name": "Summary Ref Source",
                        "status": "completed",
                        "started_at": "2026-05-28T00:00:00Z",
                        "completed_at": "2026-05-28T00:00:01Z",
                        "metadata": {"runtime_context": {"buddy_session_id": session["session_id"]}},
                    }
                )
                command = commands.execute_command(
                    {
                        "action": "session_summary.update",
                        "payload": {
                            "content": "摘要保留 summary-ref-evidence 的任务结论。",
                            "source_refs": [
                                {
                                    "source_kind": "buddy_message",
                                    "source_id": message["message_id"],
                                    "role": "assistant",
                                }
                            ],
                        },
                        "run_id": "run_summary_ref",
                        "change_reason": "test summary ref",
                    }
                )

                result = store.search_chat_sessions(query="summary-ref-evidence", limit=5)

        summary_refs = result["sessions"][0]["summary_refs"]
        self.assertEqual(summary_refs[0]["source_kind"], "buddy_session_summary")
        self.assertEqual(summary_refs[0]["session_id"], session["session_id"])
        self.assertEqual(summary_refs[0]["lineage_root_session_id"], session["session_id"])
        self.assertEqual(summary_refs[0]["source_run_id"], "run_summary_ref")
        self.assertEqual(summary_refs[0]["source_revision_id"], command["revision"]["revision_id"])
        self.assertEqual(summary_refs[0]["source_refs"][0]["source_id"], message["message_id"])
        self.assertIn(summary_refs[0], result["sessions"][0]["source_refs"])

    def test_search_run_context_expands_context_package_sources_from_run_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                session = store.create_chat_session({"title": "来源会话"}, changed_by="user", change_reason="test")
                message = store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "stable-source 是可复用证据。"},
                    changed_by="buddy",
                    change_reason="test",
                )
                context_ref = create_context_assembly(
                    target_state_key="conversation_history",
                    renderer_key="buddy_history_context_loader",
                    renderer_version="1",
                    rendered_text="历史证据：stable-source 是可复用证据。",
                    sources=[
                        {
                            "source_kind": "buddy_message",
                            "source_id": message["message_id"],
                            "role": "assistant",
                            "label": "历史消息",
                            "metadata": {"session_id": session["session_id"], "authority": "history"},
                        }
                    ],
                    budget={"used_chars": 24},
                )
                save_run(
                    {
                        "run_id": "run_context_search",
                        "graph_id": "graph_context_search",
                        "graph_name": "Run Context Search",
                        "status": "completed",
                        "started_at": "2026-05-28T00:00:00Z",
                        "completed_at": "2026-05-28T00:00:01Z",
                        "state_values": {
                            "conversation_history": {
                                "kind": "context_package",
                                "source_kind": "session",
                                "authority": "history",
                                "items": [],
                                "context_ref": context_ref,
                            }
                        },
                        "state_snapshot": {
                            "values": {
                                "conversation_history": {
                                    "kind": "context_package",
                                    "source_kind": "session",
                                    "authority": "history",
                                    "items": [],
                                    "context_ref": context_ref,
                                }
                            }
                        },
                    }
                )

                result = store.search_run_context("run_context_search", query="stable-source", limit=10)

        self.assertEqual(result["kind"], "run_context_search")
        self.assertEqual(result["run_id"], "run_context_search")
        self.assertEqual(result["match_count"], 1)
        match = result["matches"][0]
        self.assertEqual(match["state_key"], "conversation_history")
        self.assertEqual(match["assembly_id"], context_ref["assembly_id"])
        self.assertEqual(match["source_kind"], "buddy_message")
        self.assertEqual(match["source_id"], message["message_id"])
        self.assertIn("stable-source", match["snippet"])
        self.assertEqual(match["metadata"]["session_id"], session["session_id"])

    def test_buddy_search_routes_expose_session_and_run_context_views(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                session = store.create_chat_session({"title": "API 证据"}, changed_by="user", change_reason="test")
                store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "api-evidence 在这里"},
                    changed_by="user",
                    change_reason="test",
                )
                context_ref = create_context_assembly(
                    target_state_key="runtime_context",
                    renderer_key="runtime_context_view",
                    renderer_version="1",
                    rendered_text="api-context-evidence",
                    sources=[
                        {
                            "source_kind": "runtime_context_item",
                            "source_id": "runtime:key",
                            "label": "runtime key",
                            "metadata": {"key": "runtime_key", "value": "api-context-evidence"},
                        }
                    ],
                )
                save_run(
                    {
                        "run_id": "run_context_api",
                        "graph_id": "graph_context_api",
                        "graph_name": "Run Context API",
                        "status": "completed",
                        "started_at": "2026-05-28T00:00:00Z",
                        "state_values": {"runtime_context": context_ref},
                        "state_snapshot": {"values": {"runtime_context": context_ref}},
                    }
                )

                sessions_response = client.get("/api/buddy/search/sessions", params={"query": "api-evidence"})
                context_response = client.get(
                    "/api/buddy/search/run-context",
                    params={"run_id": "run_context_api", "query": "api-context-evidence"},
                )

        self.assertEqual(sessions_response.status_code, 200)
        self.assertEqual(context_response.status_code, 200)
        self.assertEqual(sessions_response.json()["session_count"], 1)
        self.assertEqual(context_response.json()["match_count"], 1)

    def test_search_memories_returns_retrieval_scores_sources_and_embedding_models(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
            ):
                database.initialize_storage()
                from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector
                from app.core.storage.memory_store import create_memory_entry

                model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
                memory = create_memory_entry(
                    scope_kind="buddy_session",
                    scope_id="session_memory_search",
                    layer="long_term",
                    memory_type="preference",
                    title="召回偏好",
                    content="用户希望 memory-search-evidence 使用 embedding 召回并展示证据来源。",
                    sources=[{"source_kind": "buddy_message", "source_id": "msg_memory_search"}],
                    confidence=0.8,
                    salience=0.7,
                )
                chunk = _project_memory_for_test_recall(memory)
                upsert_embedding_vector(
                    str(chunk["chunk_id"]),
                    model["embedding_model_id"],
                    [1.0, 0.0, 0.0],
                    str(chunk["content_hash"]),
                )

                with patch(
                    "app.core.storage.retrieval_store.embed_text_with_model_ref",
                    return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
                ):
                    result = store.search_memories(
                        query="memory-search-evidence embedding",
                        embedding_model_ref=model["embedding_model_id"],
                        limit=5,
                    )

        self.assertEqual(result["kind"], "memory_search")
        self.assertEqual(result["embedding_model_ref"], model["embedding_model_id"])
        self.assertEqual(result["match_count"], 1)
        self.assertEqual(result["memories"][0]["memory_id"], memory["memory_id"])
        self.assertEqual(result["memories"][0]["sources"][0]["source_kind"], "buddy_message")
        self.assertEqual(result["memories"][0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(result["memories"][0]["retrieval"]["vector_score"], 0)
        self.assertEqual(result["embedding_models"][0]["embedding_model_id"], model["embedding_model_id"])
        self.assertIn("query_ids", result["report"])
        ranking_report = result["report"]["ranking_reports"][0]
        self.assertEqual(ranking_report["kind"], "retrieval_ranking_report")
        self.assertEqual(ranking_report["query_text"], "memory-search-evidence embedding")
        self.assertEqual(ranking_report["embedding_model_ref"], model["embedding_model_id"])
        self.assertEqual(ranking_report["ranked_results"][0]["source_ref"]["source_id"], memory["memory_id"])

    def test_buddy_search_routes_expose_memory_search_view(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                from app.core.storage.memory_store import create_memory_entry

                memory = create_memory_entry(
                    scope_kind="buddy",
                    scope_id="default",
                    layer="long_term",
                    memory_type="preference",
                    title="API 记忆",
                    content="api-memory-evidence 应该通过只读 API 展开。",
                )
                _project_memory_for_test_recall(memory)

                response = client.get(
                    "/api/buddy/search/memories",
                    params={"query": "api-memory-evidence", "limit": 5},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["kind"], "memory_search")
        self.assertEqual(payload["memory_count"], 1)
        self.assertEqual(payload["memories"][0]["memory_id"], memory["memory_id"])


if __name__ == "__main__":
    unittest.main()
