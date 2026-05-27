from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "provider_fallback_resolver"

sys.path.insert(0, str(BACKEND_ROOT))


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("provider_fallback_resolver_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load provider_fallback_resolver tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProviderFallbackResolverToolTests(unittest.TestCase):
    def test_catalog_exposes_provider_fallback_resolver_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("provider_fallback_resolver")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Provider Fallback Resolver")
        self.assertIn("provider_fallback_trace", definition.description)
        self.assertIn("provider_fallback_resolver", get_tool_registry(include_disabled=True).keys())

    def test_tool_outputs_provider_fallback_trace(self) -> None:
        module = _load_tool_module()

        result = module.provider_fallback_resolver(
            {
                "requested_model_ref": "openai/gpt-primary",
                "required_capabilities": ["chat", "structured_output"],
                "required_permissions": ["text_generation"],
                "failure_event": {
                    "model_ref": "openai/gpt-primary",
                    "provider_id": "openai",
                    "error_type": "provider_timeout",
                },
                "provider_candidates": [
                    {
                        "model_ref": "openai/gpt-primary",
                        "enabled": True,
                        "configured": True,
                        "capabilities": {"chat": True, "structured_output": True},
                        "permissions": ["text_generation"],
                    },
                    {
                        "model_ref": "local/backup-model",
                        "enabled": True,
                        "configured": True,
                        "capabilities": {"chat": True, "structured_output": True},
                        "permissions": ["text_generation"],
                    },
                ],
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["selected_model_ref"], "local/backup-model")
        self.assertEqual(result["provider_fallback_trace"]["decision"], "fallback_selected")
        self.assertTrue(result["provider_fallback_trace"]["fallback_used"])


if __name__ == "__main__":
    unittest.main()
