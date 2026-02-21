from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ThinkingLevelTests(unittest.TestCase):
    def test_agent_config_defaults_to_auto_and_normalizes_legacy_on_to_medium(self) -> None:
        from app.core.schemas.node_system import AgentThinkingMode, NodeSystemAgentConfig

        self.assertEqual(NodeSystemAgentConfig().thinking_mode, AgentThinkingMode.AUTO)
        self.assertEqual(
            NodeSystemAgentConfig.model_validate({"thinkingMode": "on"}).thinking_mode,
            AgentThinkingMode.MEDIUM,
        )

    def test_auto_resolves_to_medium_for_reasoning_models_and_off_for_plain_models(self) -> None:
        from app.core.thinking_levels import resolve_effective_thinking_level

        self.assertEqual(
            resolve_effective_thinking_level(
                configured_level="auto",
                provider_id="openai-codex",
                model="gpt-5.4",
            ),
            "medium",
        )
        self.assertEqual(
            resolve_effective_thinking_level(
                configured_level="auto",
                provider_id="openai",
                model="gpt-4.1",
            ),
            "off",
        )

    def test_resolve_agent_runtime_config_exposes_effective_thinking_level(self) -> None:
        from app.core.runtime.node_system_executor import _resolve_agent_runtime_config
        from app.core.schemas.node_system import NodeSystemAgentNode

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {"thinkingMode": "auto", "temperature": 0.2},
            }
        )

        with (
            patch("app.core.runtime.node_system_executor.get_default_text_model_ref", return_value="openai-codex/gpt-5.4"),
            patch("app.core.runtime.node_system_executor.get_default_agent_thinking_level", return_value="auto"),
            patch("app.core.runtime.node_system_executor.get_default_agent_temperature", return_value=0.2),
            patch("app.core.runtime.node_system_executor.resolve_runtime_model_name", return_value="gpt-5.4"),
        ):
            runtime_config = _resolve_agent_runtime_config(node)

        self.assertEqual(runtime_config["configured_thinking_level"], "auto")
        self.assertEqual(runtime_config["resolved_thinking_level"], "medium")
        self.assertTrue(runtime_config["resolved_thinking"])

    def test_legacy_enabled_runtime_default_migrates_to_auto(self) -> None:
        from app.api.routes_settings import AgentRuntimeDefaultsPayload
        from app.tools.local_llm import get_default_agent_thinking_level

        self.assertEqual(
            AgentRuntimeDefaultsPayload(model="local/test", thinking_enabled=True, temperature=0.2).normalized_thinking_level,
            "auto",
        )
        with patch(
            "app.tools.local_llm.load_app_settings",
            return_value={"agent_runtime_defaults": {"thinking_enabled": True}},
        ):
            self.assertEqual(get_default_agent_thinking_level(), "auto")

    def test_provider_payloads_map_thinking_levels_to_native_fields(self) -> None:
        from app.core.thinking_levels import build_native_thinking_payload

        self.assertEqual(
            build_native_thinking_payload(
                provider_id="openai-codex",
                transport="codex-responses",
                model="gpt-5.4",
                thinking_level="high",
            ),
            {"reasoning": {"effort": "high"}},
        )
        self.assertEqual(
            build_native_thinking_payload(
                provider_id="anthropic",
                transport="anthropic-messages",
                model="claude-sonnet-4-5",
                thinking_level="medium",
            ),
            {"thinking": {"type": "enabled", "budget_tokens": 1024}},
        )
        self.assertEqual(
            build_native_thinking_payload(
                provider_id="gemini",
                transport="gemini-generate-content",
                model="gemini-2.5-pro",
                thinking_level="low",
            ),
            {"generationConfig": {"thinkingConfig": {"thinkingBudget": 400}}},
        )


if __name__ == "__main__":
    unittest.main()
