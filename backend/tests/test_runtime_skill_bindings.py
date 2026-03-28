from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_bindings import (
    map_skill_outputs,
    normalize_agent_skill_bindings,
    resolve_agent_skill_bindings,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition


class RuntimeSkillBindingsTests(unittest.TestCase):
    def test_attached_skills_normalize_to_bindings(self) -> None:
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
        self.assertEqual(bindings[0].output_mapping, {})

    def test_explicit_bindings_preserve_output_mapping(self) -> None:
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "skills": ["summarize_text", "rewrite_text"],
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

        self.assertEqual([binding.skill_key for binding in bindings], ["summarize_text", "rewrite_text"])
        self.assertEqual(bindings[0].output_mapping, {"summary": "summary_text"})
        self.assertEqual(bindings[1].output_mapping, {})

    def test_skill_state_inputs_union_with_attached_agent_skills_by_name_only(self) -> None:
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
                    {"skillKey": "file_reader", "name": "File Reader"},
                    {"skill_key": "web_search"},
                    "media_fetcher",
                ]
            },
            state_schema=state_schema,
        )

        self.assertEqual([binding.skill_key for binding in bindings], ["web_search", "file_reader", "media_fetcher"])

    def test_resolved_bindings_mark_skill_state_source_without_changing_attached_bindings(self) -> None:
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
                    {"skillKey": "file_reader", "name": "File Reader"},
                    {"skill_key": "web_search"},
                ]
            },
            state_schema=state_schema,
        )

        self.assertEqual(
            [(item.binding.skill_key, item.source) for item in resolved],
            [("web_search", "node_config"), ("file_reader", "skill_state")],
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
                "raw_json": {"skillKey": "file_reader"},
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
