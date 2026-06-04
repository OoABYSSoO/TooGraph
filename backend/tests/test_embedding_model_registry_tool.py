from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "embedding_model_registry"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("embedding_model_registry_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load embedding_model_registry tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EmbeddingModelRegistryToolTests(unittest.TestCase):
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

    def test_catalog_exposes_embedding_model_registry_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("embedding_model_registry")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Embedding Model Registry")
        self.assertIn("注册 embedding 模型", definition.description)
        self.assertIn("embedding_model_registry", get_tool_registry(include_disabled=True).keys())

    def test_tool_registers_and_lists_embedding_models(self) -> None:
        module = _load_tool_module()

        registered = module.embedding_model_registry(
            {
                "operation": "register",
                "provider_key": "openai",
                "model": "text-embedding-3-small",
                "dimensions": 1536,
                "enabled": True,
                "metadata": {"source": "model_providers"},
            }
        )
        listed = module.embedding_model_registry({"operation": "list", "enabled_only": True})

        self.assertEqual(registered["status"], "succeeded")
        self.assertEqual(registered["model"]["provider_key"], "openai")
        self.assertEqual(registered["model"]["model"], "text-embedding-3-small")
        self.assertEqual(registered["model"]["dimensions"], 1536)
        self.assertEqual(registered["model"]["metadata"]["source"], "model_providers")
        self.assertEqual(listed["status"], "succeeded")
        self.assertEqual([model["embedding_model_id"] for model in listed["models"]], [registered["model"]["embedding_model_id"]])


if __name__ == "__main__":
    unittest.main()
