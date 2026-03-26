from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Literal

from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemAgentSkillBinding,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)
from app.core.schemas.skills import SkillIoField


BindingSource = Literal["node_config", "skill_state"]


@dataclass(frozen=True)
class ResolvedAgentSkillBinding:
    binding: NodeSystemAgentSkillBinding
    source: BindingSource


def normalize_agent_skill_bindings(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None = None,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[NodeSystemAgentSkillBinding]:
    return [
        resolved.binding
        for resolved in resolve_agent_skill_bindings(node, input_values=input_values, state_schema=state_schema)
    ]


def resolve_agent_skill_bindings(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None = None,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[ResolvedAgentSkillBinding]:
    bindings: list[ResolvedAgentSkillBinding] = [
        ResolvedAgentSkillBinding(binding=binding.model_copy(deep=True), source="node_config")
        for binding in node.config.skill_bindings
    ]
    bound_keys = {resolved.binding.skill_key for resolved in bindings}
    for skill_key in node.config.skills:
        if skill_key in bound_keys:
            continue
        bindings.append(
            ResolvedAgentSkillBinding(binding=NodeSystemAgentSkillBinding(skillKey=skill_key), source="node_config")
        )
        bound_keys.add(skill_key)
    for skill_key in iter_skill_state_input_keys(node, input_values=input_values, state_schema=state_schema):
        if skill_key in bound_keys:
            continue
        bindings.append(
            ResolvedAgentSkillBinding(binding=NodeSystemAgentSkillBinding(skillKey=skill_key), source="skill_state")
        )
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


def build_skill_inputs(
    binding: NodeSystemAgentSkillBinding,
    input_values: dict[str, Any],
    *,
    binding_source: BindingSource = "node_config",
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    input_schema: list[SkillIoField] | None = None,
) -> dict[str, Any]:
    if binding.input_mapping:
        skill_inputs = {
            input_key: input_values.get(state_key)
            for input_key, state_key in binding.input_mapping.items()
        }
    elif binding_source == "skill_state":
        skill_inputs = build_dynamic_skill_inputs(input_values, state_schema=state_schema, input_schema=input_schema)
    else:
        skill_inputs = dict(input_values)
    skill_inputs.update(binding.config)
    return skill_inputs


def build_dynamic_skill_inputs(
    input_values: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    input_schema: list[SkillIoField] | None = None,
) -> dict[str, Any]:
    schema_fields = input_schema or []
    schema_keys = [field.key for field in schema_fields]
    payload = _first_named_mapping(
        input_values,
        state_schema,
        names=("tool_input", "proposed_tool_input", "skill_input", "arguments", "args"),
    )

    if not schema_keys:
        return dict(payload) if payload is not None else dict(input_values)

    resolved: dict[str, Any] = {}
    if payload is not None:
        for key in schema_keys:
            if key in payload:
                resolved[key] = payload[key]

    for key in schema_keys:
        if key in resolved and not is_missing_skill_input_value(resolved[key]):
            continue
        value = _find_input_value_by_key_or_state_name(input_values, state_schema, key)
        if not is_missing_skill_input_value(value):
            resolved[key] = value

    return resolved


def missing_required_skill_inputs(skill_inputs: dict[str, Any], input_schema: list[SkillIoField] | None) -> list[str]:
    missing: list[str] = []
    for field in input_schema or []:
        if field.required and is_missing_skill_input_value(skill_inputs.get(field.key)):
            missing.append(field.key)
    return missing


def map_skill_outputs(binding: NodeSystemAgentSkillBinding, skill_result: dict[str, Any]) -> dict[str, Any]:
    return {
        state_key: skill_result.get(output_key)
        for output_key, state_key in binding.output_mapping.items()
    }


def _first_named_mapping(
    input_values: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None,
    *,
    names: tuple[str, ...],
) -> dict[str, Any] | None:
    for name in names:
        value = _find_input_value_by_key_or_state_name(input_values, state_schema, name)
        mapping = _coerce_mapping(value)
        if mapping is not None:
            return mapping
    return None


def _find_input_value_by_key_or_state_name(
    input_values: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None,
    name: str,
) -> Any:
    if name in input_values:
        return input_values.get(name)
    if not state_schema:
        return None
    for state_key, definition in state_schema.items():
        if definition.name == name and state_key in input_values:
            return input_values.get(state_key)
    return None


def _coerce_mapping(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return dict(parsed)
    return None


def is_missing_skill_input_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False
