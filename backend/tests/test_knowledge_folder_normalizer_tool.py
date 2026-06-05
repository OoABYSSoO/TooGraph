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


if __name__ == "__main__":
    unittest.main()
