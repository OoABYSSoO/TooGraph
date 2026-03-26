from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_bindings import (
    build_skill_inputs,
    map_skill_outputs,
    normalize_agent_skill_bindings,
    resolve_agent_skill_bindings,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.schemas.skills import SkillIoField


class RuntimeSkillBindingsTests(unittest.TestCase):
    def test_legacy_skills_normalize_to_before_agent_bindings(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {"skills": ["summarize_text"]},
            }
        )

        bindings = normalize_agent_skill_bindings(node)

        self.assertEqual(len(bindings), 1)
        self.assertEqual(bindings[0].skill_key, "summarize_text")
        self.assertEqual(bindings[0].trigger, "before_agent")
        self.assertEqual(bindings[0].input_mapping, {})
        self.assertEqual(bindings[0].output_mapping, {})

    def test_explicit_bindings_preserve_mapping_and_config(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skills": ["summarize_text", "rewrite_text"],
                    "skillBindings": [
                        {
                            "skillKey": "summarize_text",
                            "trigger": "before_agent",
                            "inputMapping": {"text": "source_text"},
                            "outputMapping": {"summary": "summary_text"},
                            "config": {"max_sentences": 4},
                        }
                    ],
                },
            }
        )

        bindings = normalize_agent_skill_bindings(node)

        self.assertEqual([binding.skill_key for binding in bindings], ["summarize_text", "rewrite_text"])
        self.assertEqual(bindings[0].input_mapping, {"text": "source_text"})
        self.assertEqual(bindings[0].output_mapping, {"summary": "summary_text"})
        self.assertEqual(bindings[0].config, {"max_sentences": 4})
        self.assertEqual(bindings[1].input_mapping, {})

    def test_skill_state_inputs_union_with_attached_agent_skills(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "allowed_skills"}],
                "config": {"skills": ["web_search"]},
            }
        )
        state_schema = {
            "allowed_skills": NodeSystemStateDefinition.model_validate({"type": "skill"}),
        }

        bindings = normalize_agent_skill_bindings(
            node,
            input_values={
                "allowed_skills": [
                    {"skillKey": "local_file", "label": "Local File"},
                    {"skill_key": "web_search"},
                    "web_media_downloader",
                ]
            },
            state_schema=state_schema,
        )

        self.assertEqual([binding.skill_key for binding in bindings], ["web_search", "local_file", "web_media_downloader"])

    def test_resolved_bindings_mark_skill_state_source_without_changing_legacy_bindings(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "allowed_skills"}],
                "config": {"skills": ["web_search"]},
            }
        )
        state_schema = {
            "allowed_skills": NodeSystemStateDefinition.model_validate({"type": "skill"}),
        }

        resolved = resolve_agent_skill_bindings(
            node,
            input_values={
                "allowed_skills": [
                    {"skillKey": "local_file", "label": "Local File"},
                    {"skill_key": "web_search"},
                ]
            },
            state_schema=state_schema,
        )

        self.assertEqual(
            [(item.binding.skill_key, item.source) for item in resolved],
            [("web_search", "node_config"), ("local_file", "skill_state")],
        )

    def test_skill_state_inputs_ignore_non_skill_state_values(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "allowed_skills"}, {"state": "raw_json"}],
                "config": {"skills": []},
            }
        )
        state_schema = {
            "allowed_skills": NodeSystemStateDefinition.model_validate({"type": "skill"}),
            "raw_json": NodeSystemStateDefinition.model_validate({"type": "json"}),
        }

        bindings = normalize_agent_skill_bindings(
            node,
            input_values={
                "allowed_skills": {"skillKey": "web_search"},
                "raw_json": {"skillKey": "local_file"},
            },
            state_schema=state_schema,
        )

        self.assertEqual([binding.skill_key for binding in bindings], ["web_search"])

    def test_build_skill_inputs_combines_state_mapping_and_config(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillBindings": [
                        {
                            "skillKey": "summarize_text",
                            "inputMapping": {"text": "source_text"},
                            "config": {"max_sentences": 4},
                        }
                    ],
                },
            }
        )
        binding = normalize_agent_skill_bindings(node)[0]

        inputs = build_skill_inputs(binding, {"source_text": "Long text", "unused": "ignored"})

        self.assertEqual(inputs, {"text": "Long text", "max_sentences": 4})

    def test_build_skill_inputs_legacy_mode_passes_all_node_inputs(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {"skills": ["summarize_text"]},
            }
        )
        binding = normalize_agent_skill_bindings(node)[0]

        inputs = build_skill_inputs(binding, {"text": "Long text", "max_sentences": 2})

        self.assertEqual(inputs, {"text": "Long text", "max_sentences": 2})

    def test_build_skill_inputs_for_dynamic_skill_uses_tool_input_payload_by_state_name(self) -> None:
        binding = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "state_13"}, {"state": "state_20"}, {"state": "state_21"}],
                "config": {},
            }
        )
        resolved = resolve_agent_skill_bindings(
            binding,
            input_values={"state_13": {"skillKey": "web_search"}},
            state_schema={
                "state_13": NodeSystemStateDefinition.model_validate({"type": "skill", "name": "allowed_skills"})
            },
        )[0].binding

        inputs = build_skill_inputs(
            resolved,
            {
                "state_13": {"skillKey": "web_search"},
                "state_20": {"query": "Wuthering Waves latest version", "max_results": "8", "unused": "ignored"},
                "state_21": "fallback query",
            },
            binding_source="skill_state",
            state_schema={
                "state_13": NodeSystemStateDefinition.model_validate({"type": "skill", "name": "allowed_skills"}),
                "state_20": NodeSystemStateDefinition.model_validate({"type": "json", "name": "tool_input"}),
                "state_21": NodeSystemStateDefinition.model_validate({"type": "text", "name": "query"}),
            },
            input_schema=[
                SkillIoField.model_validate({"key": "query", "label": "Query", "valueType": "text", "required": True}),
                SkillIoField.model_validate({"key": "max_results", "label": "Max Results", "valueType": "text"}),
            ],
        )

        self.assertEqual(inputs, {"query": "Wuthering Waves latest version", "max_results": "8"})

    def test_build_skill_inputs_for_dynamic_skill_falls_back_to_named_state_fields(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "allowed_skills"}],
                "config": {},
            }
        )
        binding = resolve_agent_skill_bindings(
            node,
            input_values={"allowed_skills": {"skillKey": "web_search"}},
            state_schema={"allowed_skills": NodeSystemStateDefinition.model_validate({"type": "skill"})},
        )[0].binding

        inputs = build_skill_inputs(
            binding,
            {"allowed_skills": {"skillKey": "web_search"}, "state_21": "GraphiteUI release news"},
            binding_source="skill_state",
            state_schema={
                "allowed_skills": NodeSystemStateDefinition.model_validate({"type": "skill"}),
                "state_21": NodeSystemStateDefinition.model_validate({"type": "text", "name": "query"}),
            },
            input_schema=[
                SkillIoField.model_validate({"key": "query", "label": "Query", "valueType": "text", "required": True}),
            ],
        )

        self.assertEqual(inputs, {"query": "GraphiteUI release news"})

    def test_map_skill_outputs_writes_declared_keys(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillBindings": [
                        {
                            "skillKey": "summarize_text",
                            "outputMapping": {"summary": "summary_text"},
                        }
                    ],
                },
            }
        )
        binding = normalize_agent_skill_bindings(node)[0]

        mapped = map_skill_outputs(binding, {"summary": "Short", "key_points": ["a"]})

        self.assertEqual(mapped, {"summary_text": "Short"})


if __name__ == "__main__":
    unittest.main()
