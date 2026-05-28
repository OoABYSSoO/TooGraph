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

    def test_provider_profile_override_is_exposed_for_runtime_calls(self) -> None:
        node = _agent_node(
            {
                "providerProfile": {
                    "requestTimeoutSeconds": 12.5,
                    "cachePolicy": "prefer",
                    "costBudget": {"limitUsd": 1.25, "window": "run"},
                    "rateProfile": {
                        "requestsPerMinute": 6,
                        "tokensPerMinute": 12000,
                        "concurrency": 2,
                        "waitStrategy": "wait",
                        "maxWaitSeconds": 3.5,
                    },
                }
            }
        )

        runtime_config = resolve_agent_runtime_config(
            node,
            get_default_text_model_ref_func=lambda *, force_refresh: "openai/gpt-4.1",
            get_default_agent_thinking_enabled_func=lambda: False,
            get_default_agent_thinking_level_func=lambda: "off",
            get_default_agent_temperature_func=lambda: 0.2,
            normalize_model_ref_func=lambda value: value.strip(),
            resolve_runtime_model_name_func=lambda model_ref: model_ref.split("/", 1)[1],
            normalize_thinking_level_func=lambda value: "off" if value == "auto" else str(value),
            resolve_effective_thinking_level_func=lambda *, configured_level, provider_id, model: configured_level,
        )

        self.assertEqual(runtime_config["provider_request_timeout_seconds"], 12.5)
        self.assertEqual(runtime_config["provider_cache_policy"], "prefer")
        self.assertEqual(runtime_config["provider_cost_budget"], {"limit_usd": 1.25, "window": "run"})
        self.assertEqual(
            runtime_config["provider_rate_profile"],
            {
                "requests_per_minute": 6,
                "tokens_per_minute": 12000,
                "concurrency": 2,
                "wait_strategy": "wait",
                "max_wait_seconds": 3.5,
            },
        )
        self.assertEqual(
            runtime_config["provider_profile"],
            {
                "request_timeout_seconds": 12.5,
                "cache_policy": "prefer",
                "cost_budget": {"limit_usd": 1.25, "window": "run"},
                "rate_profile": {
                    "requests_per_minute": 6,
                    "tokens_per_minute": 12000,
                    "concurrency": 2,
                    "wait_strategy": "wait",
                    "max_wait_seconds": 3.5,
                },
            },
        )
        dumped_config = node.config.model_dump(by_alias=True, mode="json")
        self.assertEqual(dumped_config["providerProfile"]["requestTimeoutSeconds"], 12.5)

    def test_default_provider_profile_is_omitted_from_serialized_agent_config(self) -> None:
        node = _agent_node({})

        dumped_config = node.config.model_dump(by_alias=True, mode="json")

        self.assertNotIn("providerProfile", dumped_config)


if __name__ == "__main__":
    unittest.main()
