from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_skill_input_generation import (
    build_skill_input_system_prompt,
    build_skill_input_user_prompt,
    generate_agent_skill_inputs,
)
from app.core.runtime.skill_bindings import ResolvedAgentSkillBinding
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemAgentSkillBinding, NodeSystemStateDefinition, NodeSystemStateType
from app.core.schemas.skills import SkillDefinition, SkillIoField
from app.core.storage.skill_artifact_store import create_uploaded_skill_artifact, resolve_skill_artifact_path


class AgentSkillInputGenerationTests(unittest.TestCase):
    def test_skill_input_prompt_uses_llm_instruction_protocol_field(self) -> None:
        prompt = build_skill_input_system_prompt(
            input_values={"question": "latest release"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(skillKey="web_search"),
                    source="node_config",
                )
            ],
            skill_definitions={
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="Web Search",
                    llmInstruction="Generate a query and run the skill without summarizing results.",
                    inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                )
            },
        )

        self.assertIn("llmInstruction: Generate a query", prompt)
        self.assertNotIn("agentInstruction", prompt)

    def test_skill_input_prompt_uses_node_override_as_single_effective_instruction(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "web_search",
                    "taskInstruction": "Generate the search arguments.",
                    "skillInstructionBlocks": {
                        "web_search": {
                            "skillKey": "web_search",
                            "title": "联网搜索 skill instruction",
                            "content": "Use the user-edited query rule.",
                            "source": "node.override",
                        }
                    },
                },
            }
        )

        system_prompt = build_skill_input_system_prompt(
            input_values={"question": "latest release"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(skillKey="web_search"),
                    source="node_config",
                )
            ],
            skill_definitions={
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="Web Search",
                    llmInstruction="Use the manifest query rule.",
                    inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                )
            },
            node=node,
        )
        user_prompt = build_skill_input_user_prompt(node)

        self.assertIn("llmInstruction: Use the user-edited query rule.", system_prompt)
        self.assertNotIn("Use the manifest query rule.", system_prompt)
        self.assertEqual(user_prompt, "Generate the search arguments.")
        self.assertNotIn("Bound Skill Instructions", user_prompt)

    def test_skill_input_prompt_respects_blank_node_override(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "web_search",
                    "skillInstructionBlocks": {
                        "web_search": {
                            "skillKey": "web_search",
                            "title": "联网搜索 skill instruction",
                            "content": "   ",
                            "source": "node.override",
                        }
                    },
                },
            }
        )

        system_prompt = build_skill_input_system_prompt(
            input_values={"question": "latest release"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(skillKey="web_search"),
                    source="node_config",
                )
            ],
            skill_definitions={
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="Web Search",
                    llmInstruction="Use the manifest query rule.",
                    inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                )
            },
            node=node,
        )

        self.assertNotIn("Use the manifest query rule.", system_prompt)
        self.assertNotIn("llmInstruction:", system_prompt)

    def test_skill_input_prompt_does_not_expose_output_mapping_to_llm(self) -> None:
        prompt = build_skill_input_system_prompt(
            input_values={"question": "latest release"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(
                        skillKey="web_search",
                        outputMapping={
                            "query": "planned_query",
                            "source_urls": "search_sources",
                        },
                    ),
                    source="node_config",
                )
            ],
            skill_definitions={
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="Web Search",
                    inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                    outputSchema=[
                        SkillIoField(key="query", name="Query", valueType="text", description="Executed query."),
                        SkillIoField(key="source_urls", name="Source URLs", valueType="json", description="Original URLs."),
                    ],
                )
            },
            state_schema={
                "planned_query": NodeSystemStateDefinition(
                    name="联网搜索 Query",
                    description="实际交给搜索技能执行的查询语句。",
                    type=NodeSystemStateType.TEXT,
                ),
                "search_sources": NodeSystemStateDefinition(
                    name="联网搜索 Source URLs",
                    description="搜索技能返回的原文网页 URL 列表。",
                    type=NodeSystemStateType.JSON,
                ),
            },
        )

        self.assertNotIn("== Bound Skill Output Mapping ==", prompt)
        self.assertNotIn("outputKey: query", prompt)
        self.assertNotIn("targetState: planned_query", prompt)
        self.assertNotIn("targetName: 联网搜索 Query", prompt)
        self.assertIn("== Required JSON Shape ==", prompt)
        self.assertIn('"web_search"', prompt)
        self.assertIn('"query"', prompt)

    def test_skill_input_prompt_expands_result_package_inputs_before_planning_arguments(self) -> None:
        artifact = create_uploaded_skill_artifact(
            file_name="search-source.md",
            content_type="text/markdown",
            payload=b"Downloaded source text for the next skill input.",
        )
        try:
            prompt = build_skill_input_system_prompt(
                input_values={
                    "search_result": {
                        "kind": "result_package",
                        "sourceType": "skill",
                        "sourceKey": "web_search",
                        "outputs": {
                            "artifact_paths": {
                                "name": "Artifact Paths",
                                "description": "Downloaded source documents.",
                                "type": "file",
                                "value": [artifact["local_path"]],
                            }
                        },
                    }
                },
                bindings=[
                    ResolvedAgentSkillBinding(
                        binding=NodeSystemAgentSkillBinding(skillKey="extract_facts"),
                        source="node_config",
                    )
                ],
                skill_definitions={
                    "extract_facts": SkillDefinition(
                        skillKey="extract_facts",
                        name="Extract Facts",
                        inputSchema=[SkillIoField(key="document_summary", name="Document Summary", valueType="text", required=True)],
                    )
                },
                state_schema={
                    "search_result": NodeSystemStateDefinition.model_validate(
                        {
                            "name": "Search Result",
                            "type": "result_package",
                        }
                    )
                },
            )

            self.assertIn("key: artifact_paths", prompt)
            self.assertIn("type: file", prompt)
            self.assertIn("Downloaded source text for the next skill input.", prompt)
            self.assertNotIn(artifact["local_path"], prompt)
        finally:
            resolve_skill_artifact_path(artifact["local_path"]).unlink(missing_ok=True)

    def test_generate_skill_inputs_passes_structured_output_schema_to_model(self) -> None:
        captured: dict[str, object] = {}

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"web_search": {"query": "GraphiteUI structured output"}}', {"warnings": []})

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "web_search",
                    "taskInstruction": "Build search arguments.",
                },
            }
        )

        skill_inputs, _reasoning, warnings, updated_config = generate_agent_skill_inputs(
            node=node,
            input_values={"question": "How should LLM nodes emit JSON?"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(skillKey="web_search"),
                    source="node_config",
                )
            ],
            skill_definitions={
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="Web Search",
                    inputSchema=[
                        SkillIoField(
                            key="query",
                            name="Query",
                            valueType="text",
                            required=True,
                            description="Search query.",
                        )
                    ],
                )
            },
            runtime_config={
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
        )

        self.assertEqual(skill_inputs, {"web_search": {"query": "GraphiteUI structured output"}})
        self.assertEqual(warnings, [])
        schema = captured["structured_output_schema"]
        self.assertEqual(schema["type"], "object")
        self.assertEqual(schema["required"], ["web_search"])
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["web_search"]["required"], ["query"])
        self.assertFalse(schema["properties"]["web_search"]["additionalProperties"])
        self.assertEqual(schema["properties"]["web_search"]["properties"]["query"]["type"], "string")
        self.assertEqual(updated_config["skill_input_structured_output_strategy"], "json_schema")


if __name__ == "__main__":
    unittest.main()
