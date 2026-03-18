from __future__ import annotations

from typing import Any

from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemAgentSkillBinding


def normalize_agent_skill_bindings(node: NodeSystemAgentNode) -> list[NodeSystemAgentSkillBinding]:
    bindings: list[NodeSystemAgentSkillBinding] = [binding.model_copy(deep=True) for binding in node.config.skill_bindings]
    bound_keys = {binding.skill_key for binding in bindings}
    for skill_key in node.config.skills:
        if skill_key in bound_keys:
            continue
        bindings.append(NodeSystemAgentSkillBinding(skillKey=skill_key))
        bound_keys.add(skill_key)
    return bindings


def build_skill_inputs(binding: NodeSystemAgentSkillBinding, input_values: dict[str, Any]) -> dict[str, Any]:
    if binding.input_mapping:
        skill_inputs = {
            input_key: input_values.get(state_key)
            for input_key, state_key in binding.input_mapping.items()
        }
    else:
        skill_inputs = dict(input_values)
    skill_inputs.update(binding.config)
    return skill_inputs


def map_skill_outputs(binding: NodeSystemAgentSkillBinding, skill_result: dict[str, Any]) -> dict[str, Any]:
    return {
        state_key: skill_result.get(output_key)
        for output_key, state_key in binding.output_mapping.items()
    }
