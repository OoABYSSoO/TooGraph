from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "source_chunker"

sys.path.insert(0, str(BACKEND_ROOT))


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("source_chunker_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load source_chunker tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SourceChunkerToolTests(unittest.TestCase):
    def test_catalog_exposes_source_chunker_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("source_chunker")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Source Chunker")
        self.assertIn("切片候选", definition.description)
        self.assertEqual(definition.input_presentation["source"].mode, "state")
        self.assertEqual(definition.input_presentation["source_kind"].mode, "static")
        self.assertEqual(definition.input_presentation["source_kind"].control, "select")
        self.assertEqual(definition.input_presentation["source_kind"].default, "buddy_messages")
        self.assertEqual(
            [option.label for option in definition.input_presentation["source_kind"].options],
            ["Chat history", "Knowledge documents"],
        )
        self.assertEqual(
            definition.input_presentation["source_kind"].options[1].updates,
            {
                "strategy": "document_section_window",
                "limits": {"max_chars": 1800, "overlap_chars": 200},
            },
        )
        self.assertEqual(
            [option.label for option in definition.input_presentation["strategy"].options],
            ["Conversation turns", "Document sections"],
        )
        self.assertEqual(definition.input_presentation["limits"].control, "object")
        self.assertEqual(
            [property.key for property in definition.input_presentation["limits"].properties],
            ["max_chars", "max_turns_per_chunk", "overlap_messages", "overlap_chars"],
        )
        self.assertEqual([field.key for field in definition.output_schema], ["chunks"])
        self.assertIn("source_chunker", get_tool_registry(include_disabled=True).keys())

    def test_runtime_invocation_preserves_utf8_message_content(self) -> None:
        from app.graph_tools.registry import get_tool_registry
        from app.graph_tools.runtime import invoke_tool

        tool = get_tool_registry(include_disabled=True)["source_chunker"]
        text = "\u8bb0\u5fc6 chunk \u4e0d\u80fd\u4e22\u4e2d\u6587"

        result = invoke_tool(
            tool,
            {
                "source_kind": "buddy_messages",
                "source": {
                    "session_id": "session_utf8",
                    "messages": [
                        {
                            "message_id": "msg_utf8",
                            "role": "user",
                            "content": text,
                            "client_order": 1,
                        }
                    ],
                },
            },
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertIn(f"user: {text}", result["chunks"][0]["content"])

    def test_chunks_buddy_messages_into_conversation_windows(self) -> None:
        module = _load_tool_module()

        result = module.source_chunker(
            {
                "source_kind": "buddy_messages",
                "strategy": "conversation_turn_window",
                "limits": {"max_chars": 700, "max_turns_per_chunk": 2, "overlap_messages": 0},
                "source": {
                    "session_id": "session_chunking",
                    "messages": [
                        {
                            "message_id": "msg_1",
                            "role": "user",
                            "content": "chunk 是什么意思？",
                            "client_order": 1,
                        },
                        {
                            "message_id": "msg_2",
                            "role": "assistant",
                            "content": "chunk 可以理解为文本切片。",
                            "client_order": 2,
                        },
                        {
                            "message_id": "msg_3",
                            "role": "user",
                            "content": "chunk 中文叫什么？",
                            "client_order": 3,
                        },
                        {
                            "message_id": "msg_4",
                            "role": "assistant",
                            "content": "可以叫切片，也可以叫文本块。",
                            "client_order": 4,
                        },
                        {
                            "message_id": "msg_5",
                            "role": "user",
                            "content": "那端口改成 3488。",
                            "client_order": 5,
                        },
                    ],
                },
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["source_kind"], "buddy_messages")
        self.assertEqual(result["strategy"], "conversation_turn_window")
        self.assertEqual(result["chunk_count"], 2)
        first = result["chunks"][0]
        second = result["chunks"][1]
        self.assertEqual(first["source_kind"], "buddy_message_window")
        self.assertEqual(first["source_locator"]["message_ids"], ["msg_1", "msg_2", "msg_3", "msg_4"])
        self.assertEqual(first["metadata"]["turn_count"], 2)
        self.assertIn("user: chunk 是什么意思？", first["content"])
        self.assertIn("assistant: 可以叫切片", first["content"])
        self.assertEqual(second["source_locator"]["message_ids"], ["msg_5"])
        self.assertEqual(second["metadata"]["start_order"], 5)
        self.assertTrue(first["content_hash"].startswith("sha256:"))
        self.assertTrue(first["chunk_id"].startswith("source_chunker:buddy_message_window:"))

    def test_chunks_normalized_documents_with_overlap(self) -> None:
        module = _load_tool_module()
        text = "\n\n".join(
            [
                "# Embedding 设计",
                "第一段说明 source package、document 和 chunk 的关系。",
                "第二段说明 retrieval index 是派生层，可以删除后重建。",
                "第三段说明 embedding job 只应该由显式 ingestion 触发。",
            ]
        )

        result = module.source_chunker(
            {
                "source_kind": "normalized_documents",
                "strategy": "document_section_window",
                "limits": {"max_chars": 80, "overlap_chars": 12},
                "source": {
                    "documents": [
                        {
                            "document_id": "doc_embedding",
                            "title": "Embedding 设计",
                            "source_path": "docs/embedding.md",
                            "mime_type": "text/markdown",
                            "content": text,
                            "metadata": {"knowledge_base_id": "kb_embedding"},
                        }
                    ]
                },
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["source_kind"], "normalized_documents")
        self.assertGreaterEqual(result["chunk_count"], 2)
        first = result["chunks"][0]
        second = result["chunks"][1]
        self.assertEqual(first["source_kind"], "normalized_document_chunk")
        self.assertEqual(first["source_id"], "doc_embedding")
        self.assertEqual(first["title"], "Embedding 设计")
        self.assertEqual(first["source_locator"]["source_path"], "docs/embedding.md")
        self.assertEqual(first["metadata"]["knowledge_base_id"], "kb_embedding")
        self.assertLessEqual(len(first["content"]), 80)
        self.assertLess(second["source_locator"]["start_char"], second["source_locator"]["end_char"])
        self.assertTrue(first["content_hash"].startswith("sha256:"))

    def test_unknown_source_kind_returns_failed_status(self) -> None:
        module = _load_tool_module()

        result = module.source_chunker({"source_kind": "raw_files", "source": {}})

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error_type"], "unsupported_source_kind")
        self.assertEqual(result["chunks"], [])


if __name__ == "__main__":
    unittest.main()
