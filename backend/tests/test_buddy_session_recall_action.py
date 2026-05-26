from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.core.storage import database
from app.core.schemas.actions import ActionLlmNodeEligibility, ActionSourceScope
from app.actions.definitions import _parse_native_action_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
SESSION_RECALL_ACTION_DIR = REPO_ROOT / "action" / "official" / "buddy_session_recall"


def _load_action_module():
    spec = importlib.util.spec_from_file_location(
        "test_buddy_session_recall_after_llm",
        SESSION_RECALL_ACTION_DIR / "after_llm.py",
    )
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_session_recall action script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddySessionRecallActionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._data_dir = Path(self._temp_dir.name) / "data"
        self._buddy_home_dir = Path(self._temp_dir.name) / "buddy_home"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", self._data_dir),
            patch("app.core.storage.database.DB_PATH", self._data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", self._buddy_home_dir),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_manifest_exposes_browse_discover_scroll_contract(self) -> None:
        definition = _parse_native_action_manifest(
            SESSION_RECALL_ACTION_DIR / "action.json",
            ActionSourceScope.OFFICIAL,
        ).definition

        self.assertEqual(definition.action_key, "buddy_session_recall")
        self.assertEqual(definition.llm_node_eligibility, ActionLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["buddy_session_read"])
        manifest = json.loads((SESSION_RECALL_ACTION_DIR / "action.json").read_text(encoding="utf-8"))
        self.assertNotIn("你已绑定", manifest["llmInstruction"])
        self.assertNotIn("不要", manifest["llmInstruction"])
        self.assertNotIn("不得", manifest["llmInstruction"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["recall_request"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            [
                "mode",
                "query",
                "session_id",
                "anchor_message_id",
                "direction",
                "limit",
                "window",
                "bookend",
                "sort",
                "role_filter",
                "current_session_id",
                "embedding_model_ref",
            ],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "session_recall_context", "sessions", "memories", "run_outputs", "context_assembly_ref", "result"],
        )

    def test_discover_returns_real_buddy_messages_from_db(self) -> None:
        recall = _load_action_module()
        session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
        store.append_chat_message(
            session["session_id"],
            {"role": "user", "content": "今天讨论 Buddy 记忆方案。", "client_order": 0},
            changed_by="user",
            change_reason="测试追加用户消息",
        )
        store.append_chat_message(
            session["session_id"],
            {"role": "assistant", "content": "会话召回使用统一数据库的 FTS。", "client_order": 1},
            changed_by="buddy",
            change_reason="测试追加伙伴消息",
        )

        result = recall.buddy_session_recall(mode="discover", query="统一数据库", limit=5, window=1, bookend=1)

        self.assertEqual(result["success"], True)
        self.assertEqual(result["session_recall_context"]["kind"], "buddy_session_recall")
        self.assertEqual(result["session_recall_context"]["mode"], "discover")
        self.assertEqual(result["sessions"][0]["session_id"], session["session_id"])
        self.assertIn("统一数据库", result["sessions"][0]["snippet"])
        self.assertEqual(
            [message["content"] for message in result["sessions"][0]["messages"]],
            [
                "今天讨论 Buddy 记忆方案。",
                "会话召回使用统一数据库的 FTS。",
            ],
        )
        self.assertIn("1 session", result["result"])

    def test_discover_excludes_current_session_lineage_when_requested(self) -> None:
        recall = _load_action_module()
        current_session = store.create_chat_session(
            {"title": "当前会话"},
            changed_by="user",
            change_reason="测试创建当前会话",
        )
        store.append_chat_message(
            current_session["session_id"],
            {"role": "user", "content": "当前会话提到 session-search-alignment。", "client_order": 0},
            changed_by="user",
            change_reason="测试追加当前消息",
        )
        recalled_session = store.create_chat_session(
            {"title": "历史会话"},
            changed_by="user",
            change_reason="测试创建历史会话",
        )
        store.append_chat_message(
            recalled_session["session_id"],
            {"role": "assistant", "content": "历史会话也提到 session-search-alignment。", "client_order": 0},
            changed_by="buddy",
            change_reason="测试追加历史消息",
        )

        result = recall.buddy_session_recall(
            mode="discover",
            query="session-search-alignment",
            limit=5,
            current_session_id=current_session["session_id"],
        )

        self.assertEqual(result["success"], True)
        self.assertEqual(
            {entry["session_id"] for entry in result["sessions"]},
            {recalled_session["session_id"]},
        )

    def test_discover_returns_memories_run_outputs_and_context_source_refs(self) -> None:
        from app.core.storage.context_assembly_store import load_context_assembly
        from app.core.storage.memory_store import create_memory_entry
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        recall = _load_action_module()
        session = store.create_chat_session({"title": "设计讨论"}, changed_by="user", change_reason="测试创建会话")
        message = store.append_chat_message(
            session["session_id"],
            {"role": "user", "content": "数据库事实源需要服务记忆召回。", "client_order": 0},
            changed_by="user",
            change_reason="测试追加用户消息",
        )
        memory = create_memory_entry(
            scope_kind="buddy_session",
            scope_id=session["session_id"],
            layer="long_term",
            memory_type="preference",
            title="记忆召回偏好",
            content="用户偏好完整 embedding 方案服务记忆召回。",
            sources=[{"source_kind": "buddy_message", "source_id": message["message_id"]}],
        )
        document = upsert_retrieval_document(
            source_kind="graph_output",
            source_id="output_1",
            source_revision_id="run_1",
            title="运行输出",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_output_1", "content": "图运行输出记录了数据库事实源和记忆召回。"}],
        )

        result = recall.buddy_session_recall(
            mode="discover",
            query="记忆召回",
            limit=5,
            current_session_id="other_session",
        )

        source_kinds = {
            source["source_kind"]
            for source in result["session_recall_context"]["context_sources"]
        }
        assembly = load_context_assembly(result["context_assembly_ref"]["assembly_id"])

        self.assertEqual(result["success"], True)
        self.assertEqual(result["memories"][0]["memory_id"], memory["memory_id"])
        self.assertEqual(result["memories"][0]["source_ref"]["source_kind"], "memory_entry")
        self.assertEqual(result["run_outputs"][0]["source_ref"]["source_kind"], "graph_output")
        self.assertIn("buddy_message", source_kinds)
        self.assertIn("memory_entry", source_kinds)
        self.assertIn("graph_output", source_kinds)
        self.assertEqual(result["context_assembly_ref"]["kind"], "context_assembly_ref")
        self.assertEqual(
            [source["source_kind"] for source in assembly["sources"]],
            ["buddy_message", "memory_entry", "graph_output"],
        )

    def test_discover_uses_embedding_model_ref_for_hybrid_memory_and_run_output_recall(self) -> None:
        from app.core.storage.embedding_store import build_local_text_embedding, register_embedding_model, upsert_embedding_vector
        from app.core.storage.memory_store import create_memory_entry
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document
        from app.core.storage.database import get_connection

        recall = _load_action_module()
        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=16)
        memory = create_memory_entry(
            scope_kind="buddy_session",
            scope_id="session_embedding",
            layer="long_term",
            memory_type="preference",
            title="Hybrid 召回偏好",
            content="用户希望 hybrid embedding 记忆召回用于长期偏好。",
        )
        with get_connection() as connection:
            memory_chunk = connection.execute(
                "SELECT chunk_id, content_hash FROM retrieval_chunks WHERE source_id = ?",
                (memory["memory_id"],),
            ).fetchone()
        upsert_embedding_vector(
            str(memory_chunk["chunk_id"]),
            model["embedding_model_id"],
            build_local_text_embedding(memory["content"], dimensions=16),
            str(memory_chunk["content_hash"]),
        )
        document = upsert_retrieval_document(
            source_kind="graph_output",
            source_id="output_embedding",
            source_revision_id="run_embedding",
            title="Hybrid 输出",
        )
        [output_chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_output_embedding", "content": "图运行输出也支持 hybrid embedding 召回。"}],
        )
        upsert_embedding_vector(
            output_chunk["chunk_id"],
            model["embedding_model_id"],
            build_local_text_embedding(output_chunk["content"], dimensions=16),
            output_chunk["content_hash"],
        )

        result = recall.buddy_session_recall(
            mode="discover",
            query="hybrid embedding 召回",
            limit=5,
            embedding_model_ref=model["embedding_model_id"],
        )

        self.assertEqual(result["success"], True)
        self.assertEqual(result["memories"][0]["memory_id"], memory["memory_id"])
        self.assertEqual(result["memories"][0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(result["memories"][0]["retrieval"]["vector_score"], 0)
        self.assertEqual(result["run_outputs"][0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(result["run_outputs"][0]["retrieval"]["vector_score"], 0)


if __name__ == "__main__":
    unittest.main()
