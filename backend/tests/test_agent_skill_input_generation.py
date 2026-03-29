from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_skill_input_generation import build_skill_input_system_prompt
from app.core.runtime.skill_bindings import ResolvedAgentSkillBinding
from app.core.schemas.node_system import NodeSystemAgentSkillBinding
from app.core.schemas.skills import SkillDefinition, SkillIoField


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


if __name__ == "__main__":
    unittest.main()
