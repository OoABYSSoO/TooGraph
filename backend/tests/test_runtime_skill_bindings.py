from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_bindings import (
    build_skill_inputs,
    map_skill_outputs,
    normalize_agent_skill_bindings,
)
from app.core.schemas.node_system import NodeSystemAgentNode


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
