from __future__ import annotations

import json
from typing import Any

from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemAgentSkillBinding,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)


def normalize_agent_skill_bindings(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None = None,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[NodeSystemAgentSkillBinding]:
    bindings: list[NodeSystemAgentSkillBinding] = [binding.model_copy(deep=True) for binding in node.config.skill_bindings]
    bound_keys = {binding.skill_key for binding in bindings}
    for skill_key in node.config.skills:
        if skill_key in bound_keys:
            continue
        bindings.append(NodeSystemAgentSkillBinding(skillKey=skill_key))
        bound_keys.add(skill_key)
    for skill_key in iter_skill_state_input_keys(node, input_values=input_values, state_schema=state_schema):
        if skill_key in bound_keys:
            continue
        bindings.append(NodeSystemAgentSkillBinding(skillKey=skill_key))
        bound_keys.add(skill_key)
    return bindings


def iter_skill_state_input_keys(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None,
    state_schema: dict[str, NodeSystemStateDefinition] | None,
) -> list[str]:
    if not input_values or not state_schema:
        return []

    skill_keys: list[str] = []
    for read_binding in node.reads:
        definition = state_schema.get(read_binding.state)
        if definition is None or definition.type != NodeSystemStateType.SKILL:
            continue
        skill_keys.extend(extract_skill_keys(input_values.get(read_binding.state)))
    return skill_keys


def extract_skill_keys(value: Any) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return [stripped]
        return extract_skill_keys(parsed)

    if isinstance(value, list):
        skill_keys: list[str] = []
        for item in value:
            skill_keys.extend(extract_skill_keys(item))
        return skill_keys

    if isinstance(value, dict):
        skill_key = str(value.get("skillKey") or value.get("skill_key") or "").strip()
        return [skill_key] if skill_key else []

    return []


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
