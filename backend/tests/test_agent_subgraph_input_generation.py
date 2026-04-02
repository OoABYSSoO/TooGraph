from __future__ import annotations

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
                {"model": "gpt-test", "provider_id": "openai", "warnings": [], "structured_output_strategy": "json_schema"},
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
                            key="final_reply",
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
        system_prompt = str(captured["system_prompt"])
        self.assertIn("subgraph-input planning phase", system_prompt)
        self.assertIn("== Selected Graph Templates ==", system_prompt)
        self.assertIn("key: advanced_web_research_loop", system_prompt)
        self.assertIn("inputSchema:", system_prompt)
        self.assertIn("user_question", system_prompt)
        self.assertIn("outputSchema:", system_prompt)
        self.assertIn("final_reply", system_prompt)
        self.assertNotIn("== Bound Skills ==", system_prompt)
        self.assertEqual(captured["user_prompt"], "Prepare the graph template inputs.")
        self.assertEqual(
            captured["structured_output_schema"]["properties"]["advanced_web_research_loop"]["required"],
            ["user_question"],
        )


if __name__ == "__main__":
    unittest.main()
