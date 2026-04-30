from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.schemas.node_system import NodeSystemAgentNode


def _agent_node(config: dict[str, object]) -> NodeSystemAgentNode:
    return NodeSystemAgentNode.model_validate(
        {
            "kind": "agent",
            "name": "writer",
            "ui": {"position": {"x": 0, "y": 0}},
            "config": config,
        }
    )


class AgentRuntimeConfigTests(unittest.TestCase):
    def test_global_model_runtime_config_uses_injected_defaults(self) -> None:
        node = _agent_node({"thinkingMode": "high", "temperature": 1.8})

        runtime_config = resolve_agent_runtime_config(
            node,
            get_default_text_model_ref_func=lambda *, force_refresh: "local/test-model",
            get_default_agent_thinking_enabled_func=lambda: True,
            get_default_agent_thinking_level_func=lambda: "medium",
            get_default_agent_temperature_func=lambda: 0.4,
            normalize_model_ref_func=lambda value: value.strip(),
            resolve_runtime_model_name_func=lambda model_ref: f"{model_ref}-runtime",
            normalize_thinking_level_func=lambda value: str(value).strip().lower(),
            resolve_effective_thinking_level_func=lambda *, configured_level, provider_id, model: configured_level,
        )

        self.assertEqual(runtime_config["model_source"], "global")
        self.assertEqual(runtime_config["configured_model_ref"], "")
        self.assertEqual(runtime_config["global_model_ref"], "local/test-model")
        self.assertTrue(runtime_config["global_thinking_enabled"])
        self.assertEqual(runtime_config["global_thinking_level"], "medium")
        self.assertEqual(runtime_config["default_temperature"], 0.4)
        self.assertEqual(runtime_config["resolved_model_ref"], "local/test-model")
        self.assertEqual(runtime_config["resolved_provider_id"], "local")
        self.assertEqual(runtime_config["runtime_model_name"], "local/test-model-runtime")
        self.assertEqual(runtime_config["configured_thinking_level"], "high")
        self.assertEqual(runtime_config["resolved_thinking_level"], "high")
        self.assertTrue(runtime_config["resolved_thinking"])
        self.assertEqual(runtime_config["resolved_temperature"], 1.8)
        self.assertTrue(runtime_config["request_return_progress"])
        self.assertEqual(runtime_config["request_reasoning_format"], "auto")

    def test_override_model_runtime_config_prefers_normalized_override(self) -> None:
        node = _agent_node(
            {
                "modelSource": "override",
                "model": "  openai-codex/gpt-5.4  ",
                "thinkingMode": "auto",
                "temperature": 0.2,
            }
        )

        runtime_config = resolve_agent_runtime_config(
            node,
            get_default_text_model_ref_func=lambda *, force_refresh: "local/global-model",
            get_default_agent_thinking_enabled_func=lambda: False,
            get_default_agent_thinking_level_func=lambda: "off",
            get_default_agent_temperature_func=lambda: 0.2,
            normalize_model_ref_func=lambda value: value.strip(),
            resolve_runtime_model_name_func=lambda model_ref: model_ref.split("/", 1)[1],
            normalize_thinking_level_func=lambda value: "off" if value == "auto" else str(value),
            resolve_effective_thinking_level_func=lambda *, configured_level, provider_id, model: "off",
        )

        self.assertEqual(runtime_config["model_source"], "override")
        self.assertEqual(runtime_config["configured_model_ref"], "openai-codex/gpt-5.4")
        self.assertEqual(runtime_config["resolved_model_ref"], "openai-codex/gpt-5.4")
        self.assertEqual(runtime_config["resolved_provider_id"], "openai-codex")
        self.assertEqual(runtime_config["runtime_model_name"], "gpt-5.4")
        self.assertEqual(runtime_config["configured_thinking_level"], "off")
        self.assertEqual(runtime_config["resolved_thinking_level"], "off")
        self.assertFalse(runtime_config["resolved_thinking"])
        self.assertFalse(runtime_config["request_return_progress"])
        self.assertIsNone(runtime_config["request_reasoning_format"])


if __name__ == "__main__":
    unittest.main()
