from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_bindings import (
    map_skill_outputs,
    normalize_agent_skill_bindings,
    resolve_agent_skill_output_binding,
    resolve_agent_skill_bindings,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.schemas.skills import SkillDefinition, SkillIoField


class RuntimeSkillBindingsTests(unittest.TestCase):
    def test_attached_skills_normalize_to_bindings(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {"skillKey": "summarize_text"},
            }
        )

        bindings = normalize_agent_skill_bindings(node)

        self.assertEqual(len(bindings), 1)
        self.assertEqual(bindings[0].skill_key, "summarize_text")
        self.assertEqual(bindings[0].output_mapping, {})

    def test_explicit_bindings_preserve_output_mapping(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "summarize_text",
                    "skillBindings": [
                        {
                            "skillKey": "summarize_text",
                            "outputMapping": {"summary": "summary_text"},
                        }
                    ],
                },
            }
        )

        bindings = normalize_agent_skill_bindings(node)

        self.assertEqual([binding.skill_key for binding in bindings], ["summarize_text"])
        self.assertEqual(bindings[0].output_mapping, {"summary": "summary_text"})

    def test_legacy_skills_array_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            NodeSystemAgentNode.model_validate(
                {
                    "kind": "agent",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "config": {"skills": ["summarize_text", "rewrite_text"]},
                }
            )

    def test_static_skill_nodes_ignore_capability_state_inputs_at_runtime(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "config": {"skillKey": "web_search"},
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }

        bindings = normalize_agent_skill_bindings(
            node,
            input_values={
                "selected_capability": {
                    "kind": "skill",
                    "key": "file_reader",
                    "name": "File Reader",
                }
            },
            state_schema=state_schema,
        )

        self.assertEqual([binding.skill_key for binding in bindings], ["web_search"])

    def test_capability_state_inputs_resolve_only_for_dynamic_capability_nodes(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "config": {"skillKey": ""},
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }

        resolved = resolve_agent_skill_bindings(
            node,
            input_values={
                "selected_capability": {
                    "kind": "skill",
                    "key": "file_reader",
                    "name": "File Reader",
                }
            },
            state_schema=state_schema,
        )

        self.assertEqual(
            [(item.binding.skill_key, item.source) for item in resolved],
            [("file_reader", "capability_state")],
        )

    def test_capability_state_inputs_resolve_single_skill_capability(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "config": {"skillKey": ""},
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }

        resolved = resolve_agent_skill_bindings(
            node,
            input_values={
                "selected_capability": {
                    "kind": "skill",
                    "key": "web_search",
                    "name": "Web Search",
                    "description": "Search the web.",
                }
            },
            state_schema=state_schema,
        )

        self.assertEqual(
            [(item.binding.skill_key, item.source) for item in resolved],
            [("web_search", "capability_state")],
        )

    def test_capability_state_inputs_do_not_accept_skill_lists(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "config": {"skillKey": ""},
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }

        resolved = resolve_agent_skill_bindings(
            node,
            input_values={"selected_capability": [{"kind": "skill", "key": "web_search"}]},
            state_schema=state_schema,
        )

        self.assertEqual(resolved, [])

    def test_dynamic_capability_state_does_not_reuse_legacy_configured_output_mapping(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "config": {
                    "skillKey": "",
                    "skillBindings": [
                        {
                            "skillKey": "web_search",
                            "outputMapping": {"summary": "summary_text"},
                        }
                    ],
                },
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }

        resolved = resolve_agent_skill_bindings(
            node,
            input_values={"selected_capability": {"kind": "skill", "key": "web_search"}},
            state_schema=state_schema,
        )

        self.assertEqual([(item.binding.skill_key, item.source) for item in resolved], [("web_search", "capability_state")])
        self.assertEqual(resolved[0].binding.output_mapping, {})

    def test_capability_state_inputs_ignore_non_capability_state_values(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "raw_json"}],
                "config": {"skillKey": ""},
            }
        )
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "raw_json": NodeSystemStateDefinition.model_validate({"type": "json"}),
        }

        bindings = normalize_agent_skill_bindings(
            node,
            input_values={
                "selected_capability": {"kind": "skill", "key": "web_search"},
                "raw_json": {"kind": "skill", "key": "file_reader"},
            },
            state_schema=state_schema,
        )

        self.assertEqual([binding.skill_key for binding in bindings], ["web_search"])

    def test_map_skill_outputs_writes_declared_keys(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skillKey": "summarize_text",
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

    def test_resolve_skill_output_mapping_from_existing_state_outputs(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "writes": [{"state": "source_urls"}, {"state": "artifact_paths"}],
                "config": {"skillKey": "web_search"},
            }
        )
        binding = normalize_agent_skill_bindings(node)[0]
        definition = SkillDefinition(
            skillKey="web_search",
            name="Web Search",
            outputSchema=[
                SkillIoField(key="source_urls", name="Source URLs", valueType="json"),
                SkillIoField(key="artifact_paths", name="Artifact Paths", valueType="file"),
            ],
        )
        state_schema = {
            "source_urls": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "artifact_paths": NodeSystemStateDefinition.model_validate({"type": "file"}),
        }

        resolved = resolve_agent_skill_output_binding(
            binding,
            node=node,
            state_schema=state_schema,
            skill_definition=definition,
        )

        self.assertEqual(
            resolved.output_mapping,
            {
                "source_urls": "source_urls",
                "artifact_paths": "artifact_paths",
            },
        )


if __name__ == "__main__":
    unittest.main()
