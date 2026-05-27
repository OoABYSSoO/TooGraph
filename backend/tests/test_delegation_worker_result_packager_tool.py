from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "delegation_worker_result_packager"

sys.path.insert(0, str(BACKEND_ROOT))


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("delegation_worker_result_packager_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load delegation_worker_result_packager tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DelegationWorkerResultPackagerToolTests(unittest.TestCase):
    def test_catalog_exposes_delegation_worker_result_packager_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("delegation_worker_result_packager")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Delegation Worker Result Packager")
        self.assertIn("worker_task_packet", definition.description)
        self.assertIn("delegation_worker_result_packager", get_tool_registry(include_disabled=True).keys())

    def test_packager_outputs_worker_result_package_with_task_packet_refs(self) -> None:
        module = _load_tool_module()

        result = module.delegation_worker_result_packager(
            {
                "worker_task_packet": {
                    "task_id": "worker_eval_research_1",
                    "goal": "Compare TooGraph and Hermes delegation protocols.",
                    "context_package_refs": [
                        {"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}
                    ],
                    "allowed_capabilities": [
                        {"kind": "tool", "key": "knowledge_context_loader"}
                    ],
                    "budget": {"max_steps": 2, "max_chars": 4000},
                    "expected_output_schema": {
                        "findings": {"type": "markdown"},
                        "source_refs": {"type": "json"},
                    },
                },
                "worker_status": "succeeded",
                "worker_summary": "Compared TooGraph and Hermes delegation protocols.",
                "worker_outputs": {
                    "findings": "TooGraph needs worker_task_packet and worker_result_package.",
                    "source_refs": [
                        {"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}
                    ],
                },
                "budget_usage": {"used_steps": 1, "used_chars": 1200},
            }
        )
        package = result["worker_result_package"]

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["worker_task_packet"]["task_id"], "worker_eval_research_1")
        self.assertEqual(package["kind"], "worker_result_package")
        self.assertEqual(package["task_id"], "worker_eval_research_1")
        self.assertEqual(package["status"], "succeeded")
        self.assertEqual(package["outputs"]["findings"]["type"], "markdown")
        self.assertIn("worker_result_package", package["outputs"]["findings"]["value"])
        self.assertEqual(
            package["source_refs"],
            [{"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}],
        )
        self.assertEqual(package["budget"]["max_steps"], 2)
        self.assertEqual(package["budget"]["used_steps"], 1)


if __name__ == "__main__":
    unittest.main()
