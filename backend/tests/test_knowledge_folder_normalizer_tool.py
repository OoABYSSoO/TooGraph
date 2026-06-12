from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "knowledge_folder_normalizer"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("knowledge_folder_normalizer_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load knowledge_folder_normalizer tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KnowledgeFolderNormalizerToolTests(unittest.TestCase):
    def test_catalog_exposes_knowledge_folder_normalizer_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("knowledge_folder_normalizer")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Knowledge Folder Normalizer")
        self.assertEqual(definition.input_presentation["folder"].mode, "state")
        self.assertEqual(definition.input_presentation["collection"].mode, "static")
        self.assertEqual(definition.output_schema[0].key, "source_package")
        self.assertIn("knowledge_folder_normalizer", get_tool_registry(include_disabled=True).keys())

    def test_normalizes_entire_local_folder_into_normalized_documents(self) -> None:
        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            folder = workspace / "policy_library"
            folder.mkdir()
            (folder / "A.md").write_text("Policy A body.", encoding="utf-8")
            (folder / "B.txt").write_text("Policy B body.", encoding="utf-8")
            (folder / "image.bin").write_bytes(b"\x00\x01\x02")

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                result = module.knowledge_folder_normalizer(
                    {
                        "folder": {
                            "kind": "local_folder",
                            "root": str(folder),
                            "selection_mode": "all",
                            "selected": [],
                        },
                        "collection": "policy_library",
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["source_package"]["source_kind"], "normalized_documents")
        documents = result["source_package"]["documents"]
        self.assertEqual([document["source_path"] for document in documents], ["A.md", "B.txt"])
        self.assertEqual([document["content"] for document in documents], ["Policy A body.", "Policy B body."])
        self.assertEqual(result["report"]["selection_mode"], "all")
        self.assertEqual(result["report"]["skipped_binary_count"], 1)

    def test_normalizes_only_selected_local_folder_files(self) -> None:
        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            folder = workspace / "policy_library"
            folder.mkdir()
            (folder / "A.md").write_text("Policy A body.", encoding="utf-8")
            (folder / "B.md").write_text("Policy B body.", encoding="utf-8")

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                result = module.knowledge_folder_normalizer(
                    {
                        "folder": {
                            "kind": "local_folder",
                            "root": str(folder),
                            "selection_mode": "selected",
                            "selected": ["B.md"],
                        },
                        "collection": "policy_library",
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        documents = result["source_package"]["documents"]
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]["source_path"], "B.md")
        self.assertEqual(documents[0]["content"], "Policy B body.")
        self.assertEqual(result["report"]["selection_mode"], "selected")

    def test_markdown_front_matter_becomes_metadata_not_embedding_content(self) -> None:
        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            folder = workspace / "policy_library"
            folder.mkdir()
            (folder / "policy.md").write_text(
                "\n".join(
                    [
                        "---",
                        'title: "就业支持政策"',
                        'source_url: "https://www.gov.cn/zhengce/example.htm"',
                        'agency: "人力资源社会保障部"',
                        'published_at: "2025-04-12"',
                        'policy_domain: ["就业", "社保"]',
                        "---",
                        "",
                        "# 就业支持政策",
                        "",
                        "这里是清洗后的政策正文。",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                result = module.knowledge_folder_normalizer(
                    {
                        "folder": {
                            "kind": "local_folder",
                            "root": str(folder),
                            "selection_mode": "all",
                            "selected": [],
                        },
                        "collection": "policy_library",
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        [document] = result["source_package"]["documents"]
        self.assertEqual(document["title"], "就业支持政策")
        self.assertNotIn("source_url:", document["content"])
        self.assertNotIn("---", document["content"])
        self.assertIn("清洗后的政策正文", document["content"])
        self.assertEqual(document["metadata"]["source_url"], "https://www.gov.cn/zhengce/example.htm")
        self.assertEqual(document["metadata"]["agency"], "人力资源社会保障部")
        self.assertEqual(document["metadata"]["published_at"], "2025-04-12")
        self.assertEqual(document["metadata"]["policy_domain"], ["就业", "社保"])
        self.assertEqual(result["report"]["front_matter_count"], 1)

    def test_policy_archive_package_only_ingests_normalized_markdown(self) -> None:
        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            folder = workspace / "policy_library"
            package = folder / "2025" / "01" / "policy_a"
            package.mkdir(parents=True)
            (package / "metadata.json").write_text('{"source_url":"https://www.gov.cn/a.htm"}', encoding="utf-8")
            (package / "source.html").write_text(
                '<!doctype html><html><body><script src="share.js"></script><p>raw page shell</p></body></html>',
                encoding="utf-8",
            )
            (package / "normalized.md").write_text(
                "# Clean Policy\n\nThis is the clean body.",
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                result = module.knowledge_folder_normalizer(
                    {
                        "folder": {
                            "kind": "local_folder",
                            "root": str(folder),
                            "selection_mode": "all",
                            "selected": [],
                        },
                        "collection": "policy_library",
                    }
                )

        self.assertEqual(result["status"], "succeeded")
        documents = result["source_package"]["documents"]
        self.assertEqual([document["source_path"] for document in documents], ["2025/01/policy_a/normalized.md"])
        self.assertEqual(documents[0]["content"], "# Clean Policy\n\nThis is the clean body.")
        self.assertEqual(result["report"]["skipped_artifact_count"], 2)
        skipped_paths = [item["source_path"] for item in result["report"]["skipped_artifacts"]]
        self.assertEqual(skipped_paths, ["2025/01/policy_a/metadata.json", "2025/01/policy_a/source.html"])

    def test_operation_batch_only_normalizes_claimed_files(self) -> None:
        from app.core.storage.knowledge_store import import_knowledge_folder, knowledge_ingestion_file_stats

        module = _load_tool_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo_root = workspace / "repo"
            repo_root.mkdir()
            data_dir = workspace / "data"
            source = repo_root / "policy_source"
            source.mkdir()
            for index in range(3):
                (source / f"policy_{index}.md").write_text(f"Policy body {index}", encoding="utf-8")
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
                patch("app.core.storage.local_input_sources.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.REPO_ROOT", repo_root),
                patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", repo_root / "knowledge"),
            ):
                database.initialize_storage()
                imported = import_knowledge_folder(name="Policy", source_path=str(source), collection_id="policy_qa")
                operation_id = imported["operation"]["operation_id"]

                result = module.knowledge_folder_normalizer(
                    {
                        "folder": imported["folder_package"],
                        "collection": "policy_qa",
                        "operation_id": operation_id,
                        "batch_size": 2,
                    }
                )
                stats = knowledge_ingestion_file_stats(operation_id)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["report"]["selection_mode"], "operation_batch")
        self.assertEqual(result["report"]["candidate_file_count"], 2)
        self.assertEqual(len(result["source_package"]["documents"]), 2)
        self.assertEqual(stats["processing_source_file_count"], 2)
        self.assertEqual(stats["pending_source_file_count"], 1)


if __name__ == "__main__":
    unittest.main()
