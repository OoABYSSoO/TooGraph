from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "agent_loop_guard"

sys.path.insert(0, str(BACKEND_ROOT))


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("agent_loop_guard_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load agent_loop_guard tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentLoopGuardToolTests(unittest.TestCase):
    def test_catalog_exposes_agent_loop_guard_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("agent_loop_guard")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Agent Loop Guard")
        self.assertIn("stop reason", definition.description)
        self.assertNotIn("capability_trace", [field.key for field in definition.input_schema])
        self.assertIn("agent_loop_guard", get_tool_registry(include_disabled=True).keys())

    def test_guard_continues_and_updates_loop_control_within_budget(self) -> None:
        module = _load_tool_module()

        result = module.agent_loop_guard(
            {
                "agent_loop_control": {
                    "iteration_index": 2,
                    "max_iterations": 6,
                    "capability_call_count": 1,
                    "max_capability_calls": 4,
                    "retry_budget": 2,
                    "failure_count_by_key": {},
                },
                "selected_capability": {"kind": "action", "key": "web_search"},
                "capability_result": {"status": "succeeded", "outputs": {"answer": {"value": "ok"}}},
            }
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(result["agent_loop_should_continue"])
        self.assertFalse(result["agent_loop_should_retry"])
        self.assertEqual(result["reason"], "continue")
        self.assertEqual(result["agent_loop_stop_reason"], "")
        self.assertEqual(result["agent_loop_control"]["iteration_index"], 3)
        self.assertEqual(result["agent_loop_control"]["capability_call_count"], 2)
        self.assertEqual(result["agent_loop_control"]["last_stop_reason"], "")

    def test_guard_stops_when_capability_budget_is_exhausted(self) -> None:
        module = _load_tool_module()

        result = module.agent_loop_guard(
            {
                "agent_loop_control": {
                    "iteration_index": 3,
                    "max_iterations": 8,
                    "capability_call_count": 3,
                    "max_capability_calls": 4,
                },
                "selected_capability": {"kind": "action", "key": "web_search"},
                "capability_result": {"status": "succeeded", "outputs": {"answer": {"value": "ok"}}},
            }
        )

        self.assertFalse(result["agent_loop_should_continue"])
        self.assertEqual(result["reason"], "stop")
        self.assertEqual(result["agent_loop_stop_reason"], "capability_budget_exhausted")
        self.assertEqual(result["agent_loop_control"]["last_stop_reason"], "capability_budget_exhausted")

    def test_guard_retries_failures_until_retry_budget_is_exhausted(self) -> None:
        module = _load_tool_module()

        retry_result = module.agent_loop_guard(
            {
                "agent_loop_control": {
                    "iteration_index": 1,
                    "max_iterations": 6,
                    "capability_call_count": 1,
                    "max_capability_calls": 4,
                    "retry_budget": 2,
                    "failure_count_by_key": {"action:web_search": 1},
                },
                "selected_capability": {"kind": "action", "key": "web_search"},
                "capability_result": {
                    "status": "failed",
                    "error_type": "tool_failed",
                },
            }
        )
        stop_result = module.agent_loop_guard(
            {
                "agent_loop_control": {
                    "iteration_index": 2,
                    "max_iterations": 6,
                    "capability_call_count": 2,
                    "max_capability_calls": 4,
                    "retry_budget": 2,
                    "failure_count_by_key": {"action:web_search": 2},
                },
                "selected_capability": {"kind": "action", "key": "web_search"},
                "capability_result": {
                    "status": "failed",
                    "error_type": "tool_failed",
                },
            }
        )

        self.assertTrue(retry_result["agent_loop_should_continue"])
        self.assertTrue(retry_result["agent_loop_should_retry"])
        self.assertEqual(retry_result["reason"], "retry")
        self.assertEqual(retry_result["agent_loop_stop_reason"], "")
        self.assertFalse(stop_result["agent_loop_should_continue"])
        self.assertFalse(stop_result["agent_loop_should_retry"])
        self.assertEqual(stop_result["agent_loop_stop_reason"], "tool_failed")


if __name__ == "__main__":
    unittest.main()
