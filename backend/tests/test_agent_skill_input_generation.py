from __future__ import annotations

import sys
import unittest
import json
import tempfile
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

    def test_skill_input_prompt_includes_before_llm_context(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "web_search"
            skill_dir.mkdir()
            (skill_dir / "before_llm.py").write_text(
                "import json\n"
                "print(json.dumps({'context': 'Current date: 2026-05-08'}))\n",
                encoding="utf-8",
            )
            prompt = build_skill_input_system_prompt(
                input_values={"question": "最新模型发布日期"},
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
                        llmInstruction="Generate a query.",
                        inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                        sourcePath=str(skill_dir / "skill.json"),
                    )
                },
            )

        self.assertIn("== Skill Pre-LLM Context ==", prompt)
        self.assertIn("skillKey: web_search", prompt)
        self.assertIn("Current date: 2026-05-08", prompt)

    def test_capability_selector_prompt_lists_available_templates_and_skills_for_llm_choice(self) -> None:
        prompt = build_skill_input_system_prompt(
            input_values={"requirement": "帮我联网搜索资料"},
            bindings=[
                ResolvedAgentSkillBinding(
                    binding=NodeSystemAgentSkillBinding(skillKey="graphiteui_capability_selector"),
                    source="node_config",
                )
            ],
            skill_definitions={
                "graphiteui_capability_selector": SkillDefinition(
                    skillKey="graphiteui_capability_selector",
                    name="GraphiteUI Capability Selector",
                    inputSchema=[
                        SkillIoField(key="requirement", name="Requirement", valueType="text", required=True),
                        SkillIoField(key="capability", name="Capability", valueType="capability", required=True),
                    ],
                    outputSchema=[SkillIoField(key="capability", name="Capability", valueType="capability")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                ),
                "web_search": SkillDefinition(
                    skillKey="web_search",
                    name="联网搜索",
                    description="当任务需要最新信息、网页证据或公开资料检索时使用。",
                    inputSchema=[SkillIoField(key="query", name="Query", valueType="text", required=True)],
                    outputSchema=[SkillIoField(key="source_urls", name="Source URLs", valueType="json")],
                    capabilityPolicy={
                        "default": {"selectable": True, "requiresApproval": False},
                        "origins": {"companion": {"selectable": True, "requiresApproval": False}},
                    },
                    llmNodeEligibility="ready",
                    runtimeReady=True,
                    runtimeRegistered=True,
                ),
                "local_workspace_executor": SkillDefinition(
                    skillKey="local_workspace_executor",
                    name="本地工作区执行器",
                    description="执行受策略约束的本地文件和命令操作。",
                    outputSchema=[SkillIoField(key="status", name="Status", valueType="text")],
                    capabilityPolicy={
                        "default": {"selectable": True, "requiresApproval": False},
                        "origins": {"companion": {"selectable": False, "requiresApproval": True}},
                    },
                    llmNodeEligibility="ready",
                    runtimeReady=True,
                    runtimeRegistered=True,
                ),
            },
            list_template_records_func=lambda include_disabled=False: [
                {
                    "template_id": "advanced_web_research_loop",
                    "label": "高级联网搜索",
                    "description": "多轮搜索、证据评估、补充检索和最终依据整理的联网研究图模板。",
                    "source": "official",
                }
            ],
        )

        self.assertIn("== Available Capabilities ==", prompt)
        self.assertIn("Graph templates are preferred over Skills when both can satisfy the requirement.", prompt)
        self.assertIn("kind: subgraph", prompt)
        self.assertIn("key: advanced_web_research_loop", prompt)
        self.assertIn("name: 高级联网搜索", prompt)
        self.assertIn("whenToUse: 多轮搜索、证据评估、补充检索和最终依据整理的联网研究图模板。", prompt)
        self.assertIn("kind: skill", prompt)
        self.assertIn("key: web_search", prompt)
        self.assertIn("whenToUse: 当任务需要最新信息、网页证据或公开资料检索时使用。", prompt)
        self.assertNotIn("local_workspace_executor", prompt)
        self.assertNotIn("key: graphiteui_capability_selector", prompt)

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

    def test_repairs_invalid_skill_inputs_without_original_prompt_context(self) -> None:
        calls: list[dict[str, object]] = []

        def chat_with_local_model_with_meta_func(**kwargs):
            calls.append(dict(kwargs))
            if len(calls) == 1:
                return ('{"web_search": {"query": 7}}', {"warnings": [], "model": "test-model"})
            return ('{"web_search": {"query": "repaired query"}}', {"warnings": [], "model": "test-model"})

        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "web_search",
                    "taskInstruction": "ORIGINAL SKILL TASK",
                },
            }
        )

        skill_inputs, _reasoning, warnings, updated_config = generate_agent_skill_inputs(
            node=node,
            input_values={"question": "ORIGINAL SECRET INPUT"},
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

        self.assertEqual(skill_inputs, {"web_search": {"query": "repaired query"}})
        self.assertEqual(warnings, [])
        self.assertEqual(len(calls), 2)
        repair_call = calls[1]
        repair_prompt = f"{repair_call['system_prompt']}\n{repair_call['user_prompt']}"
        self.assertIn("JSON repair step", str(repair_call["system_prompt"]))
        self.assertIn("target_schema", str(repair_call["user_prompt"]))
        self.assertIn("validation_errors", str(repair_call["user_prompt"]))
        self.assertIn("raw_model_output", str(repair_call["user_prompt"]))
        repair_payload = json.loads(str(repair_call["user_prompt"]))
        self.assertEqual(repair_payload["raw_model_output"], '{"web_search": {"query": 7}}')
        self.assertNotIn("ORIGINAL SECRET INPUT", repair_prompt)
        self.assertNotIn("ORIGINAL SKILL TASK", repair_prompt)
        self.assertEqual(repair_call["thinking_level"], "off")
        self.assertTrue(updated_config["skill_input_structured_output_repair_attempted"])
        self.assertTrue(updated_config["skill_input_structured_output_repair_succeeded"])
        self.assertEqual(updated_config["skill_input_structured_output_validation_errors"], [])
        self.assertIn(
            "$.web_search.query expected string",
            updated_config["skill_input_structured_output_initial_validation_errors"][0],
        )


if __name__ == "__main__":
    unittest.main()
