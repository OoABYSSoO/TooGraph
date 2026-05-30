from __future__ import annotations

import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "runtime_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database
from app.core.storage.context_assembly_store import expand_context_package


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("runtime_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load runtime_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RuntimeContextLoaderToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(REPO_ROOT)}),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_catalog_exposes_runtime_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("runtime_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Runtime Context Loader")
        self.assertIn("context_package", definition.description)
        self.assertIn("runtime_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_outputs_runtime_context_package_from_runtime_context(self) -> None:
        module = _load_tool_module()

        result = module.runtime_context_loader(
            {
                "selected_keys": ["buddy_session_id", "route_path", "page_title", "nested.page_id"],
                "max_chars": 4000,
            },
            context={
                "run_id": "run_runtime_1",
                "runtime_context": {
                    "buddy_session_id": "session_runtime",
                    "route_path": "/editor",
                    "page_title": "图编辑器",
                    "nested": {"page_id": "page_editor"},
                    "api_token": "secret-value",
                },
            },
        )
        package = result["runtime_context_package"]
        expanded = expand_context_package(package)

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(package["kind"], "context_package")
        self.assertEqual(package["source_kind"], "runtime")
        self.assertEqual(package["authority"], "context_only")
        self.assertEqual(package["context_ref"]["kind"], "context_assembly_ref")
        self.assertEqual(package["items"][0]["source_ref"]["source_kind"], "runtime_context_item")
        self.assertEqual(package["items"][0]["metadata"]["key"], "buddy_session_id")
        self.assertIn("buddy_session_id: session_runtime", expanded["text"])
        self.assertIn("route_path: /editor", expanded["text"])
        self.assertIn("nested.page_id: page_editor", expanded["text"])
        self.assertNotIn("api_token", expanded["text"])
        self.assertEqual(result["runtime_context_report"]["run_id"], "run_runtime_1")
        self.assertEqual(result["runtime_context_report"]["source_count"], 4)
        self.assertEqual(package["budget"]["omitted_count"], 0)

    def test_context_package_rebuilds_runtime_context_from_source_blobs(self) -> None:
        module = _load_tool_module()

        result = module.runtime_context_loader(
            {
                "runtime_context": {
                    "buddy_session_id": "session_rebuild",
                    "route_path": "/buddy",
                },
                "source_run_id": "run_runtime_rebuild",
            }
        )
        package = result["runtime_context_package"]
        first_expanded = expand_context_package(package)

        self._delete_blob(first_expanded["assembly"]["rendered_content_hash"])

        rebuilt = expand_context_package(package)

        self.assertIn("buddy_session_id: session_rebuild", rebuilt["text"])
        self.assertIn("route_path: /buddy", rebuilt["text"])
        self.assertEqual(rebuilt["package"]["source_kind"], "runtime")

    def _delete_blob(self, content_hash: str) -> None:
        connection = sqlite3.connect(database.DB_PATH)
        try:
            connection.execute("DELETE FROM content_blobs WHERE content_hash = ?", (content_hash,))
            connection.commit()
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
