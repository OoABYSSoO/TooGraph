from __future__ import annotations

import sys
import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.model_call_context import get_model_call_context
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition, NodeSystemStateType


def _agent_node(*, writes: list[dict[str, str]], task_instruction: str = "") -> NodeSystemAgentNode:
    return NodeSystemAgentNode.model_validate(
        {
            "kind": "agent",
            "name": "writer",
            "ui": {"position": {"x": 0, "y": 0}},
            "writes": writes,
            "config": {"taskInstruction": task_instruction},
        }
    )


class AgentResponseGenerationTests(unittest.TestCase):
    def test_returns_empty_summary_without_output_bindings(self) -> None:
        runtime_config = {"resolved_provider_id": "local"}

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[]),
            {},
            {},
            runtime_config,
        )

        self.assertEqual(payload, {"summary": ""})
        self.assertEqual(reasoning, "")
        self.assertEqual(warnings, [])
        self.assertIs(updated_config, runtime_config)

    def test_routes_local_provider_with_fallback_thinking_level(self) -> None:
        captured: dict[str, object] = {}
        on_delta = object()

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "done"}', {"warnings": []})

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {"search": {"context": "ctx"}},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.7,
                "resolved_thinking": True,
                "resolved_model_ref": "local/test-model",
            },
            on_delta=on_delta,
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload, {"summary": '{"answer": "done"}', "answer": "done"})
        self.assertEqual(reasoning, "")
        self.assertEqual(warnings, [])
        self.assertEqual(captured["system_prompt"], "system prompt")
        self.assertIn("== Graph State Inputs ==", str(captured["user_prompt"]))
        self.assertIn("== Action Results ==", str(captured["user_prompt"]))
        self.assertEqual(captured["model"], "test-model")
        self.assertEqual(captured["provider_id"], "local")
        self.assertEqual(captured["temperature"], 0.7)
        self.assertEqual(captured["thinking_enabled"], True)
        self.assertEqual(captured["thinking_level"], "medium")
        self.assertIs(captured["on_delta"], on_delta)
        self.assertEqual(updated_config["provider_model"], "test-model")
        self.assertEqual(updated_config["provider_id"], "local")
        self.assertEqual(updated_config["provider_thinking_level"], "medium")

    def test_passes_provider_timeout_override_to_provider_client(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "done"}', {"warnings": [], "model": "gpt-4.1", "provider_id": "openai"})

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-4.1",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-4.1",
                "provider_request_timeout_seconds": 12.5,
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(warnings, [])
        self.assertEqual(captured["request_timeout_seconds"], 12.5)
        self.assertEqual(updated_config["provider_request_timeout_seconds"], 12.5)

    def test_places_runtime_state_and_action_data_in_user_prompt_not_system_prompt(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "done"}', {"warnings": [], "model": "test-model"})

        payload, _reasoning, warnings, _updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="请根据材料回答。"),
            {"question": "STATE_SECRET_VALUE"},
            {"web_search": {"summary": "ACTION_SECRET_VALUE"}},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
            },
            state_schema={
                "question": NodeSystemStateDefinition(
                    name="用户问题",
                    description="用户输入的原始问题。",
                    type=NodeSystemStateType.TEXT,
                ),
                "answer": NodeSystemStateDefinition(
                    name="最终答案",
                    description="给用户看的回复。",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(warnings, [])
        system_prompt = str(captured["system_prompt"])
        user_prompt = str(captured["user_prompt"])
        self.assertIn("== 必须返回的 JSON 字段 ==", system_prompt)
        self.assertIn("== Node Task ==", system_prompt)
        self.assertIn("请根据材料回答。", system_prompt)
        self.assertIn("每个字段必须使用上方的 key", system_prompt)
        self.assertNotIn("STATE_SECRET_VALUE", system_prompt)
        self.assertNotIn("ACTION_SECRET_VALUE", system_prompt)
        self.assertNotIn("请根据材料回答。", user_prompt)
        self.assertIn("== Graph State Inputs ==", user_prompt)
        self.assertIn("STATE_SECRET_VALUE", user_prompt)
        self.assertIn("== Action Results ==", user_prompt)
        self.assertIn("ACTION_SECRET_VALUE", user_prompt)

    def test_passes_provider_cost_budget_and_records_cost_estimate(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "model": "gpt-4.1",
                    "provider_id": "openai",
                    "usage": {"input_tokens": 1000, "output_tokens": 500},
                    "provider_cost_estimate": {
                        "kind": "provider_cost_estimate",
                        "status": "estimated",
                        "estimated_cost_usd": 0.006,
                        "budget_status": "over_budget",
                    },
                },
            )

        _payload, _reasoning, _warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-4.1",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-4.1",
                "provider_cost_budget": {"limit_usd": 0.005, "window": "run"},
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(captured["provider_cost_budget"], {"limit_usd": 0.005, "window": "run"})
        self.assertEqual(
            updated_config["provider_cost_estimate"],
            {
                "kind": "provider_cost_estimate",
                "status": "estimated",
                "estimated_cost_usd": 0.006,
                "budget_status": "over_budget",
            },
        )

    def test_passes_provider_rate_profile_and_records_rate_decision(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "model": "gpt-4.1",
                    "provider_id": "openai",
                    "usage": {"input_tokens": 900, "output_tokens": 500},
                    "provider_rate_decision": {
                        "kind": "provider_rate_decision",
                        "mode": "audit_only",
                        "status": "over_limit",
                    },
                },
            )

        _payload, _reasoning, _warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-4.1",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-4.1",
                "provider_rate_profile": {
                    "requests_per_minute": 30,
                    "tokens_per_minute": 1200,
                    "concurrency": 2,
                },
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(
            captured["provider_rate_profile"],
            {"requests_per_minute": 30, "tokens_per_minute": 1200, "concurrency": 2},
        )
        self.assertEqual(
            updated_config["provider_rate_decision"],
            {
                "kind": "provider_rate_decision",
                "mode": "audit_only",
                "status": "over_limit",
            },
        )

    def test_records_prompt_snapshot_metadata_without_storing_prompt_text(self) -> None:
        def chat_with_local_model_with_meta_func(**kwargs):
            return ('{"answer": "done"}', {"warnings": [], "model": "test-model"})

        _payload, _reasoning, _warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="USER SECRET TASK"),
            {
                "conversation_history": {
                    "kind": "context_package",
                    "package_id": "pkg_history_1",
                    "source_kind": "session",
                    "authority": "history",
                    "context_ref": {
                        "kind": "context_assembly_ref",
                        "assembly_id": "ctx_history_1",
                        "target_state_key": "conversation_history",
                        "renderer_key": "buddy_history",
                        "renderer_version": "1",
                        "rendered_content_hash": "sha256:history",
                        "source_count": 3,
                    },
                }
            },
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "SYSTEM SECRET INPUT",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        snapshots = updated_config["prompt_snapshots"]
        self.assertEqual(len(snapshots), 1)
        snapshot = snapshots[0]
        self.assertEqual(snapshot["kind"], "llm_prompt_snapshot")
        self.assertEqual(snapshot["phase"], "agent_response")
        self.assertEqual(snapshot["system_prompt_chars"], len("SYSTEM SECRET INPUT"))
        self.assertGreater(snapshot["user_prompt_chars"], len("USER SECRET TASK"))
        self.assertTrue(snapshot["system_prompt_hash"].startswith("sha256:"))
        self.assertTrue(snapshot["user_prompt_hash"].startswith("sha256:"))
        self.assertEqual(snapshot["prompt_cache_policy"]["kind"], "prompt_cache_policy")
        self.assertEqual(snapshot["prompt_cache_policy"]["version"], 1)
        self.assertEqual(snapshot["prompt_cache_policy"]["storage"], "hash_and_metadata")
        self.assertEqual(snapshot["prompt_cache_policy"]["mode"], "audit_only")
        self.assertEqual(snapshot["prompt_cache_policy"]["provider_cache_control"], "not_applied")
        self.assertEqual(snapshot["prompt_cache_policy"]["stable_prefix_hash"], snapshot["system_prompt_hash"])
        self.assertEqual(snapshot["prompt_cache_policy"]["stable_prefix_chars"], len("SYSTEM SECRET INPUT"))
        self.assertEqual(snapshot["prompt_cache_policy"]["dynamic_suffix_hash"], snapshot["user_prompt_hash"])
        self.assertEqual(snapshot["prompt_cache_policy"]["dynamic_suffix_chars"], snapshot["user_prompt_chars"])
        self.assertTrue(snapshot["prompt_cache_policy"]["cache_key"].startswith("sha256:"))
        self.assertTrue(snapshot["prompt_cache_policy"]["eligible"])
        self.assertEqual(snapshot["prompt_cache_policy"]["runtime_context_location"], "user_prompt")
        self.assertEqual(snapshot["prompt_cache_policy"]["reason"], "hash_only_stable_prefix")
        self.assertEqual(snapshot["prompt_cache_policy"]["invalidators"], [])
        self.assertEqual(snapshot["output_keys"], ["answer"])
        self.assertEqual(
            snapshot["context_refs"],
            [
                {
                    "state_key": "conversation_history",
                    "kind": "context_package",
                    "package_id": "pkg_history_1",
                    "source_kind": "session",
                    "authority": "history",
                    "assembly_id": "ctx_history_1",
                    "target_state_key": "conversation_history",
                    "renderer_key": "buddy_history",
                    "renderer_version": "1",
                    "rendered_content_hash": "sha256:history",
                    "source_count": 3,
                }
            ],
        )
        serialized_snapshot = json.dumps(snapshot, ensure_ascii=False)
        self.assertNotIn("SYSTEM SECRET INPUT", serialized_snapshot)
        self.assertNotIn("USER SECRET TASK", serialized_snapshot)

    def test_provider_cache_policy_disabled_marks_prompt_cache_decision(self) -> None:
        def chat_with_local_model_with_meta_func(**kwargs):
            return ('{"answer": "done"}', {"warnings": [], "model": "test-model"})

        _payload, _reasoning, _warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
                "provider_cache_policy": "disabled",
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "SYSTEM PROMPT",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        prompt_cache_policy = updated_config["prompt_snapshots"][0]["prompt_cache_policy"]
        self.assertEqual(prompt_cache_policy["requested_policy"], "disabled")
        self.assertEqual(prompt_cache_policy["mode"], "disabled")
        self.assertEqual(prompt_cache_policy["provider_cache_control"], "disabled")
        self.assertFalse(prompt_cache_policy["eligible"])
        self.assertEqual(prompt_cache_policy["reason"], "node_provider_cache_policy_disabled")

    def test_provider_cache_policy_prefer_records_provider_applied_decision(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "model": "claude-sonnet-4-5",
                    "provider_id": "anthropic",
                    "provider_prompt_cache_result": {
                        "provider_cache_control": "anthropic_cache_control",
                        "mode": "provider_applied",
                        "reason": "anthropic_system_block_cache_control",
                    },
                },
            )

        _payload, _reasoning, _warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {},
            {},
            {
                "resolved_provider_id": "anthropic",
                "runtime_model_name": "claude-sonnet-4-5",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "anthropic/claude-sonnet-4-5",
                "provider_cache_policy": "prefer",
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "STABLE SYSTEM PROMPT",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        prompt_cache_policy = captured["prompt_cache_policy"]
        self.assertEqual(prompt_cache_policy["requested_policy"], "prefer")
        self.assertTrue(prompt_cache_policy["eligible"])
        finalized_policy = updated_config["prompt_snapshots"][0]["prompt_cache_policy"]
        self.assertEqual(finalized_policy["requested_policy"], "prefer")
        self.assertEqual(finalized_policy["mode"], "provider_applied")
        self.assertEqual(finalized_policy["provider_cache_control"], "anthropic_cache_control")
        self.assertEqual(finalized_policy["reason"], "anthropic_system_block_cache_control")

    def test_model_call_context_includes_provider_profile_decisions(self) -> None:
        captured_context: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured_context.update(get_model_call_context())
            return ('{"answer": "done"}', {"warnings": [], "model": "test-model"})

        _payload, _reasoning, _warnings, _updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
                "provider_profile": {
                    "request_timeout_seconds": 12.5,
                    "cache_policy": "disabled",
                    "cost_budget": {"limit_usd": 1.25, "window": "run"},
                    "rate_profile": {"requests_per_minute": 30, "tokens_per_minute": 12000, "concurrency": 2},
                },
                "provider_request_timeout_seconds": 12.5,
                "provider_cache_policy": "disabled",
                "provider_cost_budget": {"limit_usd": 1.25, "window": "run"},
                "provider_rate_profile": {"requests_per_minute": 30, "tokens_per_minute": 12000, "concurrency": 2},
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "SYSTEM PROMPT",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(captured_context["provider_request_timeout_seconds"], 12.5)
        self.assertEqual(captured_context["provider_cache_policy"], "disabled")
        self.assertEqual(captured_context["provider_cost_budget"], {"limit_usd": 1.25, "window": "run"})
        self.assertEqual(
            captured_context["provider_rate_profile"],
            {"requests_per_minute": 30, "tokens_per_minute": 12000, "concurrency": 2},
        )
        self.assertEqual(captured_context["provider_profile"]["cache_policy"], "disabled")
        self.assertEqual(captured_context["provider_cache_decision"]["requested_policy"], "disabled")
        self.assertEqual(captured_context["provider_cache_decision"]["provider_cache_control"], "disabled")

    def test_passes_structured_output_schema_for_state_outputs(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"answer": "done", "confidence": 0.8}',
                {
                    "warnings": [],
                    "structured_output_mode": "validate_then_repair",
                    "structured_output_native_schema_fallback_used": True,
                    "structured_output_native_schema_conflict_provider": "lmstudio",
                },
            )

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}, {"state": "confidence"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
                "confidence": NodeSystemStateDefinition(
                    name="Confidence",
                    description="Confidence score.",
                    type=NodeSystemStateType.NUMBER,
                ),
            },
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(payload["confidence"], 0.8)
        self.assertEqual(warnings, [])
        schema = captured["structured_output_schema"]
        self.assertEqual(schema["type"], "object")
        self.assertEqual(schema["required"], ["answer", "confidence"])
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["answer"]["type"], "string")
        self.assertEqual(schema["properties"]["answer"]["title"], "Answer")
        self.assertEqual(schema["properties"]["answer"]["description"], "Answer: Final answer.")
        self.assertEqual(schema["properties"]["confidence"]["type"], "number")
        self.assertEqual(schema["properties"]["confidence"]["title"], "Confidence")
        self.assertEqual(schema["properties"]["confidence"]["description"], "Confidence: Confidence score.")
        self.assertEqual(updated_config["structured_output_strategy"], "json_schema")
        self.assertEqual(updated_config["structured_output_mode"], "validate_then_repair")
        self.assertTrue(updated_config["structured_output_native_schema_fallback_used"])
        self.assertEqual(updated_config["structured_output_native_schema_conflict_provider"], "lmstudio")

    def test_records_provider_fallback_trace_for_remote_structured_output_call(self) -> None:
        fallback_trace = {
            "kind": "provider_fallback_trace",
            "decision": "fallback_selected",
            "fallback_used": True,
            "requested": {"provider_id": "openai", "model": "gpt-primary", "model_ref": "openai/gpt-primary"},
            "selected": {"provider_id": "fallback", "model": "gpt-main", "model_ref": "fallback/gpt-main"},
            "failed_candidates": [],
            "fallback_candidates": [],
            "rejected_candidates": [],
            "required_capabilities": ["chat", "structured_output"],
            "required_permissions": ["text_generation"],
            "attempts": [],
            "warnings": [],
        }

        def chat_with_model_ref_with_meta_func(**_kwargs):
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "provider_id": "fallback",
                    "model": "gpt-main",
                    "provider_fallback_used": True,
                    "requested_model_ref": "openai/gpt-primary",
                    "provider_fallback_trace": fallback_trace,
                },
            )

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-primary",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-primary",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(warnings, [])
        self.assertEqual(updated_config["provider_id"], "fallback")
        self.assertTrue(updated_config["provider_fallback_used"])
        self.assertEqual(updated_config["requested_model_ref"], "openai/gpt-primary")
        self.assertEqual(updated_config["provider_fallback_trace"]["selected"]["model_ref"], "fallback/gpt-main")

    def test_records_provider_cost_budget_degradation_for_remote_structured_output_call(self) -> None:
        degradation = {
            "kind": "provider_cost_budget_degradation",
            "status": "applied",
            "reason": "provider_cost_budget_degradation_selected",
            "requested_model_ref": "openai/gpt-primary",
            "selected_model_ref": "local/gpt-economy",
            "provider_cost_budget_preflight": {
                "kind": "provider_cost_budget_preflight",
                "status": "blocked",
                "reason": "provider_cost_budget_already_exhausted",
                "budget_limit_usd": 0.01,
                "previous_window_cost_usd": 0.012,
                "cumulative_cost_usd": 0.012,
                "budget_window": "run",
                "on_exceeded": "degrade_model",
            },
        }

        def chat_with_model_ref_with_meta_func(**_kwargs):
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "provider_id": "local",
                    "model": "gpt-economy",
                    "provider_cost_budget_degradation": degradation,
                },
            )

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-primary",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-primary",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(warnings, [])
        self.assertEqual(updated_config["provider_cost_budget_degradation"], degradation)

    def test_repairs_invalid_structured_output_without_original_prompt_context(self) -> None:
        calls: list[dict[str, object]] = []

        def chat_with_local_model_with_meta_func(**kwargs):
            calls.append(dict(kwargs))
            if len(calls) == 1:
                return ('{"answer": 123}', {"warnings": [], "model": "test-model"})
            return ('{"answer": "repaired answer"}', {"warnings": [], "model": "test-model"})

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="ORIGINAL TASK"),
            {"question": "ORIGINAL SECRET INPUT"},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "SYSTEM WITH ORIGINAL SECRET INPUT",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
        )

        self.assertEqual(payload["answer"], "repaired answer")
        self.assertEqual(warnings, [])
        self.assertEqual(len(calls), 2)
        repair_call = calls[1]
        repair_prompt = f"{repair_call['system_prompt']}\n{repair_call['user_prompt']}"
        self.assertIn("JSON repair step", str(repair_call["system_prompt"]))
        self.assertIn("target_schema", str(repair_call["user_prompt"]))
        self.assertIn("validation_errors", str(repair_call["user_prompt"]))
        self.assertIn("raw_model_output", str(repair_call["user_prompt"]))
        repair_payload = json.loads(str(repair_call["user_prompt"]))
        self.assertEqual(repair_payload["raw_model_output"], '{"answer": 123}')
        self.assertNotIn("ORIGINAL SECRET INPUT", repair_prompt)
        self.assertNotIn("ORIGINAL TASK", repair_prompt)
        self.assertIsNone(repair_call.get("on_delta"))
        self.assertEqual(repair_call["thinking_level"], "off")
        self.assertTrue(updated_config["structured_output_repair_attempted"])
        self.assertTrue(updated_config["structured_output_repair_succeeded"])
        self.assertEqual(updated_config["structured_output_validation_errors"], [])
        self.assertIn("$.answer expected string", updated_config["structured_output_initial_validation_errors"][0])
        snapshots = updated_config["prompt_snapshots"]
        self.assertEqual([snapshot["phase"] for snapshot in snapshots], ["agent_response", "structured_output_repair"])
        repair_snapshot = snapshots[1]
        self.assertTrue(repair_snapshot["system_prompt_hash"].startswith("sha256:"))
        self.assertTrue(repair_snapshot["user_prompt_hash"].startswith("sha256:"))
        self.assertEqual(repair_snapshot["output_keys"], ["answer"])
        self.assertEqual(repair_snapshot["context_refs"], [])
        serialized_repair_snapshot = json.dumps(repair_snapshot, ensure_ascii=False)
        self.assertNotIn('{"answer": 123}', serialized_repair_snapshot)
        self.assertNotIn("ORIGINAL SECRET INPUT", serialized_repair_snapshot)
        self.assertNotIn("ORIGINAL TASK", serialized_repair_snapshot)

    def test_repairs_invalid_structured_output_from_final_content_without_reasoning(self) -> None:
        calls: list[dict[str, object]] = []
        private_reasoning = "private chain of thought that must not enter repair"

        def chat_with_local_model_with_meta_func(**kwargs):
            calls.append(dict(kwargs))
            if len(calls) == 1:
                return (
                    '{"answer": 123}',
                    {
                        "warnings": [],
                        "model": "test-model",
                        "reasoning": private_reasoning,
                        "structured_output_mode": "validate_then_repair",
                    },
                )
            return ('{"answer": "repaired answer"}', {"warnings": [], "model": "test-model"})

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": True,
                "resolved_thinking_level": "medium",
                "resolved_model_ref": "local/test-model",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
        )

        self.assertEqual(payload["answer"], "repaired answer")
        self.assertEqual(reasoning, private_reasoning)
        self.assertEqual(warnings, [])
        self.assertEqual(len(calls), 2)
        repair_prompt = f"{calls[1]['system_prompt']}\n{calls[1]['user_prompt']}"
        repair_payload = json.loads(str(calls[1]["user_prompt"]))
        self.assertEqual(repair_payload["raw_model_output"], '{"answer": 123}')
        self.assertNotIn(private_reasoning, repair_prompt)
        self.assertEqual(updated_config["structured_output_repair_source"], "content")

    def test_repair_records_provider_fallback_trace_for_remote_model(self) -> None:
        calls: list[dict[str, object]] = []
        fallback_trace = {
            "kind": "provider_fallback_trace",
            "decision": "fallback_selected",
            "fallback_used": True,
            "requested": {"model_ref": "openai/gpt-primary", "provider_id": "openai", "model": "gpt-primary"},
            "selected": {"model_ref": "fallback/gpt-repair", "provider_id": "fallback", "model": "gpt-repair"},
            "failed_candidates": [
                {
                    "model_ref": "openai/gpt-primary",
                    "provider_id": "openai",
                    "model": "gpt-primary",
                    "status": "failed",
                    "reason": "provider_failed",
                    "error_type": "provider_timeout",
                    "message": "timeout",
                }
            ],
            "fallback_candidates": [
                {
                    "model_ref": "fallback/gpt-repair",
                    "provider_id": "fallback",
                    "model": "gpt-repair",
                    "reason": "compatible_fallback",
                }
            ],
            "rejected_candidates": [],
            "required_capabilities": ["chat", "structured_output"],
            "required_permissions": ["text_generation"],
            "attempts": [
                {"model_ref": "openai/gpt-primary", "provider_id": "openai", "model": "gpt-primary", "status": "failed"},
                {"model_ref": "fallback/gpt-repair", "provider_id": "fallback", "model": "gpt-repair", "status": "selected"},
            ],
            "warnings": ["Primary provider failed; fallback used."],
        }

        def chat_with_model_ref_with_meta_func(**kwargs):
            calls.append(dict(kwargs))
            if len(calls) == 1:
                return ('{"answer": 123}', {"warnings": [], "provider_id": "openai", "model": "gpt-primary"})
            return (
                '{"answer": "repaired remotely"}',
                {
                    "warnings": ["Provider fallback used for repair."],
                    "provider_id": "fallback",
                    "model": "gpt-repair",
                    "provider_fallback_used": True,
                    "requested_model_ref": "openai/gpt-primary",
                    "provider_fallback_trace": fallback_trace,
                    "response_id": "repair-response",
                    "usage": {"total_tokens": 42},
                },
            )

        payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai",
                "runtime_model_name": "gpt-primary",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "openai/gpt-primary",
            },
            state_schema={
                "answer": NodeSystemStateDefinition(
                    name="Answer",
                    description="Final answer.",
                    type=NodeSystemStateType.TEXT,
                ),
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(payload["answer"], "repaired remotely")
        self.assertEqual(len(calls), 2)
        self.assertEqual(warnings, ["Provider fallback used for repair."])
        self.assertTrue(updated_config["structured_output_repair_attempted"])
        self.assertTrue(updated_config["structured_output_repair_succeeded"])
        self.assertEqual(updated_config["structured_output_repair_provider_id"], "fallback")
        self.assertEqual(updated_config["structured_output_repair_provider_model"], "gpt-repair")
        self.assertTrue(updated_config["structured_output_repair_provider_fallback_used"])
        self.assertEqual(updated_config["structured_output_repair_requested_model_ref"], "openai/gpt-primary")
        self.assertEqual(
            updated_config["structured_output_repair_provider_fallback_trace"]["selected"]["model_ref"],
            "fallback/gpt-repair",
        )

    def test_user_prompt_does_not_append_action_instruction_blocks_for_final_response(self) -> None:
        captured: dict[str, object] = {}
        prompt_builder_kwargs: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "done"}', {"warnings": []})

        def build_effective_system_prompt_func(*_args, **kwargs):
            prompt_builder_kwargs.update(kwargs)
            return f"system prompt\n{kwargs.get('task_instruction', '')}"

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "writes": [{"state": "answer"}],
                "config": {
                    "actionKey": "web_search",
                    "taskInstruction": "Summarize the action result.",
                    "actionInstructionBlocks": {
                        "web_search": {
                            "actionKey": "web_search",
                            "title": "联网搜索 action instruction",
                            "content": "Use this only while invoking the action.",
                            "source": "node.override",
                        }
                    },
                },
            }
        )

        generate_agent_response(
            node,
            {"question": "q"},
            {"web_search": {"summary": "searched"}},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/test-model",
            },
            build_effective_system_prompt_func=build_effective_system_prompt_func,
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(prompt_builder_kwargs["task_instruction"], "Summarize the action result.")
        self.assertIn("Summarize the action result.", str(captured["system_prompt"]))
        self.assertNotIn("Summarize the action result.", str(captured["user_prompt"]))
        self.assertIn("searched", str(captured["user_prompt"]))
        self.assertNotIn("Bound Action Instructions", str(captured["user_prompt"]))
        self.assertNotIn("Use this only while invoking the action.", str(captured["user_prompt"]))

    def test_routes_image_upload_inputs_as_model_attachments_from_local_paths(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "ok"}', {"warnings": []})

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            image_path = artifact_root / "uploads" / "reference.png"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-png")
            image_payload = {
                "kind": "uploaded_file",
                "name": "reference.png",
                "mimeType": "image/png",
                "size": image_path.stat().st_size,
                "detectedType": "image",
                "encoding": "local_path",
                "localPath": "uploads/reference.png",
                "contentType": "image/png",
            }

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="描述图片。"),
                    {"reference_image": image_payload},
                    {},
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "vision-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/vision-model",
                    },
                    state_schema={
                        "reference_image": NodeSystemStateDefinition(
                            name="参考图片",
                            type=NodeSystemStateType.IMAGE,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        system_prompt = str(captured["system_prompt"])
        user_prompt = str(captured["user_prompt"])
        self.assertNotIn("reference.png", system_prompt)
        self.assertIn("reference.png", user_prompt)
        self.assertNotIn("uploads/reference.png", system_prompt)
        self.assertNotIn("uploads/reference.png", user_prompt)
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "image")
        self.assertEqual(attachments[0]["state_key"], "reference_image")
        self.assertTrue(str(attachments[0]["file_url"]).startswith("file://"))

    def test_rejects_video_upload_inputs_longer_than_short_llm_limit_before_provider_call(self) -> None:
        def chat_with_local_model_with_meta_func(**_kwargs):
            raise AssertionError("provider should not be called for over-limit ordinary LLM video inputs")

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            video_path = artifact_root / "uploads" / "long_clip.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.write_bytes(b"fake-video")
            video_payload = {
                "kind": "uploaded_file",
                "name": "long_clip.mp4",
                "mimeType": "video/mp4",
                "size": video_path.stat().st_size,
                "detectedType": "video",
                "encoding": "local_path",
                "localPath": "uploads/long_clip.mp4",
                "contentType": "video/mp4",
            }

            with (
                patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root),
                patch(
                    "app.core.runtime.agent_multimodal.probe_video_duration_seconds",
                    return_value=30.25,
                    create=True,
                ),
            ):
                with self.assertRaisesRegex(ValueError, "30 seconds|30 秒|long-video|长视频"):
                    generate_agent_response(
                        _agent_node(writes=[{"state": "answer"}], task_instruction="描述视频。"),
                        {"reference_video": video_payload},
                        {},
                        {
                            "resolved_provider_id": "local",
                            "runtime_model_name": "vision-model",
                            "resolved_temperature": 0.2,
                            "resolved_thinking": False,
                            "resolved_thinking_level": "off",
                            "resolved_model_ref": "local/vision-model",
                        },
                        state_schema={
                            "reference_video": NodeSystemStateDefinition(
                                name="参考视频",
                                type=NodeSystemStateType.VIDEO,
                            ),
                            "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                        },
                        chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    )

    def test_routes_video_upload_inputs_as_model_attachments_from_local_paths(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "ok"}', {"warnings": []})

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            video_path = artifact_root / "uploads" / "clip.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.write_bytes(b"fake-mp4")
            video_payload = {
                "kind": "uploaded_file",
                "name": "clip.mp4",
                "mimeType": "video/mp4",
                "size": video_path.stat().st_size,
                "detectedType": "video",
                "encoding": "local_path",
                "localPath": "uploads/clip.mp4",
                "contentType": "video/mp4",
            }

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="描述视频。"),
                    {"clip": video_payload},
                    {},
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "vision-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/vision-model",
                    },
                    state_schema={
                        "clip": NodeSystemStateDefinition(
                            name="参考视频",
                            type=NodeSystemStateType.VIDEO,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        system_prompt = str(captured["system_prompt"])
        user_prompt = str(captured["user_prompt"])
        self.assertNotIn("clip.mp4", system_prompt)
        self.assertIn("clip.mp4", user_prompt)
        self.assertNotIn("uploads/clip.mp4", system_prompt)
        self.assertNotIn("uploads/clip.mp4", user_prompt)
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "video")
        self.assertEqual(attachments[0]["state_key"], "clip")
        self.assertTrue(str(attachments[0]["file_url"]).startswith("file://"))

    def test_routes_capability_artifact_media_references_as_model_attachments(self) -> None:
        captured: dict[str, object] = {}

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            image_path = artifact_root / "run_1" / "download" / "image.png"
            video_path = artifact_root / "run_1" / "download" / "clip.mp4"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-png")
            video_path.write_bytes(b"fake-mp4")

            def chat_with_local_model_with_meta_func(**kwargs):
                captured.update(kwargs)
                return ('{"answer": "ok"}', {"warnings": []})

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="分析这些素材。"),
                    {
                        "downloaded_files": [
                            {
                                "filename": "image.png",
                                "local_path": "run_1/download/image.png",
                                "content_type": "image/png",
                            },
                            {
                                "filename": "clip.mp4",
                                "local_path": "run_1/download/clip.mp4",
                                "content_type": "video/mp4",
                            },
                        ]
                    },
                    {},
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "vision-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/vision-model",
                    },
                    state_schema={
                        "downloaded_files": NodeSystemStateDefinition(
                            name="下载素材",
                            type=NodeSystemStateType.FILE,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 2)
        self.assertEqual(attachments[0]["type"], "image")
        self.assertEqual(attachments[0]["state_key"], "downloaded_files")
        self.assertEqual(attachments[0]["name"], "image.png")
        self.assertEqual(attachments[0]["file_url"], image_path.resolve().as_uri())
        self.assertEqual(attachments[1]["type"], "video")
        self.assertEqual(attachments[1]["state_key"], "downloaded_files")
        self.assertEqual(attachments[1]["name"], "clip.mp4")
        self.assertEqual(attachments[1]["file_url"], video_path.resolve().as_uri())

    def test_routes_audio_file_state_arrays_as_model_attachments(self) -> None:
        captured: dict[str, object] = {}

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            audio_path = artifact_root / "run_1" / "download" / "voice.mp3"
            audio_path.parent.mkdir(parents=True)
            audio_path.write_bytes(b"fake-mp3")

            def chat_with_local_model_with_meta_func(**kwargs):
                captured.update(kwargs)
                return ('{"answer": "ok"}', {"warnings": []})

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="Analyze the audio."),
                    {"audio_files": ["run_1/download/voice.mp3"]},
                    {},
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "audio-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/audio-model",
                    },
                    state_schema={
                        "audio_files": NodeSystemStateDefinition(
                            name="Audio files",
                            type=NodeSystemStateType.AUDIO,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "audio")
        self.assertEqual(attachments[0]["state_key"], "audio_files")
        self.assertEqual(attachments[0]["name"], "voice.mp3")
        self.assertEqual(attachments[0]["file_url"], audio_path.resolve().as_uri())

    def test_does_not_route_action_result_artifacts_as_model_attachments(self) -> None:
        captured: dict[str, object] = {}

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            video_path = artifact_root / "run_1" / "collector" / "videos" / "clip.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.write_bytes(b"fake-mp4")

            def chat_with_local_model_with_meta_func(**kwargs):
                captured.update(kwargs)
                return ('{"answer": "ok"}', {"warnings": []})

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="整理Action 结果。"),
                    {"genre": "SLG"},
                    {
                        "artifact_collector": {
                            "downloaded_files": [
                                {
                                    "filename": "clip.mp4",
                                    "local_path": "run_1/collector/videos/clip.mp4",
                                    "content_type": "video/mp4",
                                }
                            ]
                        }
                    },
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "text-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/text-model",
                    },
                    state_schema={
                        "genre": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        self.assertEqual(captured["input_attachments"], [])

    def test_global_agent_uses_default_video_model_when_media_attachments_are_present(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "ok"}', {"warnings": []})

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "capability_artifacts"
            image_path = artifact_root / "uploads" / "reference.png"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-png")
            image_payload = {
                "kind": "uploaded_file",
                "name": "reference.png",
                "mimeType": "image/png",
                "size": image_path.stat().st_size,
                "detectedType": "image",
                "encoding": "local_path",
                "localPath": "uploads/reference.png",
                "contentType": "image/png",
            }

            with patch("app.core.storage.capability_artifact_store.CAPABILITY_ARTIFACT_DATA_DIR", artifact_root):
                _payload, _reasoning, warnings, updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="描述图片。"),
                    {"reference_image": image_payload},
                    {},
                    {
                        "model_source": "global",
                        "resolved_provider_id": "local",
                        "runtime_model_name": "text-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "configured_thinking_level": "off",
                        "resolved_model_ref": "local/text-model",
                    },
                    state_schema={
                        "reference_image": NodeSystemStateDefinition(
                            name="参考图片",
                            type=NodeSystemStateType.IMAGE,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    get_default_video_model_ref_func=lambda *, force_refresh: "local/video-model",
                    resolve_runtime_model_name_func=lambda model_ref: model_ref.split("/", 1)[1],
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(warnings, [])
        self.assertEqual(captured["model"], "video-model")
        self.assertEqual(updated_config["resolved_model_ref"], "local/video-model")
        self.assertEqual(updated_config["runtime_model_name"], "video-model")
        self.assertEqual(updated_config["media_model_ref"], "local/video-model")

    def test_routes_configured_provider_and_captures_metadata(self) -> None:
        def chat_with_model_ref_with_meta_func(**kwargs):
            self.assertEqual(kwargs["model_ref"], "openai-codex/gpt-5.4")
            self.assertEqual(kwargs["thinking_level"], "off")
            return (
                '{"answer": "done"}',
                {
                    "reasoning": "because",
                    "warnings": ["warn"],
                    "model": "gpt-5.4",
                    "provider_id": "openai-codex",
                    "temperature": 0.1,
                    "reasoning_format": "summary",
                    "thinking_enabled": False,
                    "thinking_level": "off",
                    "response_id": "resp-1",
                    "usage": {"output_tokens": 5},
                    "timings": {"total_ms": 12},
                    "video_fallback": {"used": True, "frame_count": 1},
                },
            )

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="Answer."),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai-codex",
                "runtime_model_name": "gpt-5.4",
                "resolved_model_ref": "openai-codex/gpt-5.4",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(reasoning, "because")
        self.assertEqual(warnings, ["warn"])
        self.assertEqual(updated_config["provider_model"], "gpt-5.4")
        self.assertEqual(updated_config["provider_id"], "openai-codex")
        self.assertEqual(updated_config["provider_temperature"], 0.1)
        self.assertEqual(updated_config["provider_reasoning_format"], "summary")
        self.assertFalse(updated_config["provider_thinking_enabled"])
        self.assertEqual(updated_config["provider_response_id"], "resp-1")
        self.assertEqual(updated_config["provider_usage"], {"output_tokens": 5})
        self.assertEqual(updated_config["provider_timings"], {"total_ms": 12})
        self.assertEqual(updated_config["provider_video_fallback"], {"used": True, "frame_count": 1})

    def test_passes_model_runtime_fixture_to_configured_provider(self) -> None:
        captured: dict[str, object] = {}
        fixture = {
            "model_providers": {
                "fixture-primary": {
                    "models": [{"model": "gpt-primary"}],
                }
            },
            "failures": {"fixture-primary/gpt-primary": {"message": "timeout"}},
        }

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"answer": "done"}',
                {
                    "warnings": [],
                    "provider_id": "fixture-primary",
                    "model": "gpt-primary",
                },
            )

        generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "fixture-primary",
                "runtime_model_name": "gpt-primary",
                "resolved_model_ref": "fixture-primary/gpt-primary",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "model_runtime_fixture": fixture,
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertIs(captured["model_runtime_fixture"], fixture)


if __name__ == "__main__":
    unittest.main()
