from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_subgraph_input_generation import (
    SubgraphCapabilityDefinition,
    SubgraphCapabilityField,
    generate_agent_subgraph_inputs,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition


class AgentSubgraphInputGenerationTests(unittest.TestCase):
    def test_generate_agent_subgraph_inputs_uses_public_template_inputs(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_model_ref_with_meta_func(**kwargs):
            captured.update(kwargs)
            return (
                '{"advanced_web_research_loop": {"user_question": "AI news today"}}',
                {
                    "model": "gpt-test",
                    "provider_id": "openai",
                    "warnings": [],
                    "structured_output_strategy": "json_schema",
                    "structured_output_mode": "validate_then_repair",
                    "structured_output_native_schema_fallback_used": True,
                    "structured_output_native_schema_conflict_provider": "lmstudio",
                },
            )

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "Run Subgraph",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"taskInstruction": "Prepare the graph template inputs."},
            }
        )

        subgraph_inputs, _reasoning, warnings, runtime_config = generate_agent_subgraph_inputs(
            node=node,
            input_values={"question": "总结今天 AI 新闻"},
            subgraphs=[
                SubgraphCapabilityDefinition(
                    key="advanced_web_research_loop",
                    name="高级联网搜索",
                    description="多轮联网研究并生成最终回复。",
                    input_schema=[
                        SubgraphCapabilityField(
                            key="user_question",
                            name="用户问题",
                            value_type="text",
                            required=True,
                            description="用户要研究的问题。",
                        )
                    ],
                    output_schema=[
                        SubgraphCapabilityField(
                            key="public_response",
                            name="最终回复",
                            value_type="markdown",
                            required=True,
                            description="给用户看的最终结果。",
                        )
                    ],
                )
            ],
            runtime_config={
                "resolved_provider_id": "openai",
                "resolved_model_ref": "openai/gpt-test",
                "runtime_model_name": "gpt-test",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            state_schema={"question": NodeSystemStateDefinition.model_validate({"name": "Question", "type": "text"})},
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(subgraph_inputs, {"advanced_web_research_loop": {"user_question": "AI news today"}})
        self.assertEqual(warnings, [])
        self.assertEqual(runtime_config["subgraph_input_provider_model"], "gpt-test")
        self.assertEqual(runtime_config["subgraph_input_structured_output_mode"], "validate_then_repair")
        self.assertTrue(runtime_config["subgraph_input_structured_output_native_schema_fallback_used"])
        self.assertEqual(runtime_config["subgraph_input_structured_output_native_schema_conflict_provider"], "lmstudio")
        system_prompt = str(captured["system_prompt"])
        self.assertIn("subgraph-input planning phase", system_prompt)
        self.assertIn("== Selected Graph Templates ==", system_prompt)
        self.assertIn("key: advanced_web_research_loop", system_prompt)
        self.assertIn("inputSchema:", system_prompt)
        self.assertIn("user_question", system_prompt)
        self.assertIn("outputSchema:", system_prompt)
        self.assertIn("public_response", system_prompt)
        self.assertNotIn("== Bound Skills ==", system_prompt)
        self.assertEqual(captured["user_prompt"], "Prepare the graph template inputs.")
        self.assertEqual(
            captured["structured_output_schema"]["properties"]["advanced_web_research_loop"]["required"],
            ["user_question"],
        )
        snapshot = runtime_config["prompt_snapshots"][0]
        self.assertEqual(snapshot["phase"], "subgraph_input_planning")
        self.assertTrue(snapshot["system_prompt_hash"].startswith("sha256:"))
        self.assertTrue(snapshot["user_prompt_hash"].startswith("sha256:"))
        self.assertEqual(snapshot["prompt_cache_policy"]["kind"], "prompt_cache_policy")
        self.assertEqual(snapshot["prompt_cache_policy"]["stable_prefix_hash"], snapshot["system_prompt_hash"])
        self.assertEqual(snapshot["prompt_cache_policy"]["dynamic_suffix_hash"], snapshot["user_prompt_hash"])
        self.assertEqual(snapshot["prompt_cache_policy"]["mode"], "audit_only")
        self.assertEqual(snapshot["prompt_cache_policy"]["provider_cache_control"], "not_applied")
        self.assertFalse(snapshot["prompt_cache_policy"]["eligible"])
        self.assertEqual(snapshot["prompt_cache_policy"]["reason"], "runtime_state_in_system_prompt")
        self.assertEqual(snapshot["prompt_cache_policy"]["invalidators"], ["input_state_keys", "subgraph_keys"])
        self.assertEqual(snapshot["subgraph_keys"], ["advanced_web_research_loop"])
        serialized_snapshot = str(snapshot)
        self.assertNotIn("总结今天 AI 新闻", serialized_snapshot)
        self.assertNotIn("Prepare the graph template inputs.", serialized_snapshot)

    def test_generate_agent_subgraph_inputs_records_provider_cost_budget_degradation(self) -> None:
        degradation = {
            "kind": "provider_cost_budget_degradation",
            "status": "applied",
            "requested_model_ref": "openai/gpt-primary",
            "selected_model_ref": "local/gpt-economy",
            "provider_cost_budget_preflight": {"status": "blocked", "on_exceeded": "degrade_model"},
        }

        def chat_with_model_ref_with_meta_func(**_kwargs):
            return (
                '{"advanced_web_research_loop": {"user_question": "AI news today"}}',
                {
                    "warnings": [],
                    "model": "gpt-economy",
                    "provider_id": "local",
                    "provider_cost_budget_degradation": degradation,
                },
            )

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "Run Subgraph",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "config": {"taskInstruction": "Prepare subgraph inputs."},
            }
        )

        subgraph_inputs, _reasoning, warnings, runtime_config = generate_agent_subgraph_inputs(
            node=node,
            input_values={"question": "总结今天 AI 新闻"},
            subgraphs=[
                SubgraphCapabilityDefinition(
                    key="advanced_web_research_loop",
                    name="高级联网搜索",
                    input_schema=[
                        SubgraphCapabilityField(
                            key="user_question",
                            name="用户问题",
                            value_type="text",
                            required=True,
                        )
                    ],
                )
            ],
            runtime_config={
                "resolved_provider_id": "openai",
                "resolved_model_ref": "openai/gpt-primary",
                "runtime_model_name": "gpt-primary",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            state_schema={"question": NodeSystemStateDefinition.model_validate({"name": "Question", "type": "text"})},
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(subgraph_inputs, {"advanced_web_research_loop": {"user_question": "AI news today"}})
        self.assertEqual(warnings, [])
        self.assertEqual(runtime_config["subgraph_input_provider_cost_budget_degradation"], degradation)

    def test_repairs_invalid_subgraph_inputs_records_repair_prompt_snapshot(self) -> None:
        calls: list[dict[str, object]] = []

        def chat_with_model_ref_with_meta_func(**kwargs):
            calls.append(dict(kwargs))
            if len(calls) == 1:
                return ('{"advanced_web_research_loop": {"user_question": 7}}', {"model": "gpt-test", "provider_id": "openai", "warnings": []})
            return ('{"advanced_web_research_loop": {"user_question": "AI news today"}}', {"model": "gpt-test", "provider_id": "openai", "warnings": []})

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "Run Subgraph",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"taskInstruction": "ORIGINAL SUBGRAPH TASK"},
            }
        )

        subgraph_inputs, _reasoning, warnings, runtime_config = generate_agent_subgraph_inputs(
            node=node,
            input_values={"question": "ORIGINAL SECRET INPUT"},
            subgraphs=[
                SubgraphCapabilityDefinition(
                    key="advanced_web_research_loop",
                    name="高级联网搜索",
                    input_schema=[
                        SubgraphCapabilityField(
                            key="user_question",
                            name="用户问题",
                            value_type="text",
                            required=True,
                        )
                    ],
                )
            ],
            runtime_config={
                "resolved_provider_id": "openai",
                "resolved_model_ref": "openai/gpt-test",
                "runtime_model_name": "gpt-test",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            state_schema={"question": NodeSystemStateDefinition.model_validate({"name": "Question", "type": "text"})},
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
        )

        self.assertEqual(subgraph_inputs, {"advanced_web_research_loop": {"user_question": "AI news today"}})
        self.assertEqual(warnings, [])
        self.assertEqual(len(calls), 2)
        repair_call = calls[1]
        repair_prompt = f"{repair_call['system_prompt']}\n{repair_call['user_prompt']}"
        self.assertNotIn("ORIGINAL SECRET INPUT", repair_prompt)
        self.assertNotIn("ORIGINAL SUBGRAPH TASK", repair_prompt)
        snapshots = runtime_config["prompt_snapshots"]
        self.assertEqual(
            [snapshot["phase"] for snapshot in snapshots],
            ["subgraph_input_planning", "subgraph_input_structured_output_repair"],
        )
        repair_snapshot = snapshots[1]
        self.assertTrue(repair_snapshot["system_prompt_hash"].startswith("sha256:"))
        self.assertTrue(repair_snapshot["user_prompt_hash"].startswith("sha256:"))
        self.assertEqual(repair_snapshot["subgraph_keys"], ["advanced_web_research_loop"])
        serialized_repair_snapshot = json.dumps(repair_snapshot, ensure_ascii=False)
        self.assertNotIn('{"advanced_web_research_loop": {"user_question": 7}}', serialized_repair_snapshot)
        self.assertNotIn("ORIGINAL SECRET INPUT", serialized_repair_snapshot)
        self.assertNotIn("ORIGINAL SUBGRAPH TASK", serialized_repair_snapshot)


if __name__ == "__main__":
    unittest.main()
