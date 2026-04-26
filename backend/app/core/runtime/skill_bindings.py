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
from app.core.schemas.skills import SkillDefinition, SkillIoField


BindingSource = Literal["node_config", "capability_state"]


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


def resolve_agent_skill_output_binding(
    binding: NodeSystemAgentSkillBinding,
    *,
    node: NodeSystemAgentNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    skill_definition: SkillDefinition | None,
) -> NodeSystemAgentSkillBinding:
    if skill_definition is None or not skill_definition.state_output_schema:
        return binding

    output_mapping = dict(binding.output_mapping)
    used_state_keys = {state_key for state_key in output_mapping.values() if state_key}
    writable_state_keys = [write.state for write in node.writes]
    for field in skill_definition.state_output_schema:
        if output_mapping.get(field.key):
            continue
        state_key = _infer_skill_output_state_key(
            skill_key=binding.skill_key,
            field=field,
            writable_state_keys=writable_state_keys,
            used_state_keys=used_state_keys,
            state_schema=state_schema,
        )
        if state_key:
            output_mapping[field.key] = state_key
            used_state_keys.add(state_key)

    if output_mapping == binding.output_mapping:
        return binding
    return binding.model_copy(update={"output_mapping": output_mapping})


def resolve_agent_skill_bindings(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None = None,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[ResolvedAgentSkillBinding]:
    configured_bindings = {
        binding.skill_key: binding.model_copy(deep=True)
        for binding in node.config.skill_bindings
    }
    bindings: list[ResolvedAgentSkillBinding] = []
    bound_keys: set[str] = set()
    skill_key = node.config.skill_key
    if skill_key and skill_key not in bound_keys:
        binding = configured_bindings.get(skill_key) or NodeSystemAgentSkillBinding(skillKey=skill_key)
        bindings.append(
            ResolvedAgentSkillBinding(binding=binding, source="node_config")
        )
        bound_keys.add(skill_key)
        return bindings

    for skill_key in iter_capability_state_skill_keys(node, input_values=input_values, state_schema=state_schema)[:1]:
        if skill_key in bound_keys:
            continue
        binding = NodeSystemAgentSkillBinding(skillKey=skill_key)
        bindings.append(
            ResolvedAgentSkillBinding(binding=binding, source="capability_state")
        )
        bound_keys.add(skill_key)
    return bindings


def iter_capability_state_skill_keys(
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
        if definition is None or definition.type != NodeSystemStateType.CAPABILITY:
            continue
        skill_key = extract_capability_skill_key(input_values.get(read_binding.state))
        if skill_key:
            skill_keys.append(skill_key)
    return skill_keys


def iter_capability_state_subgraph_keys(
    node: NodeSystemAgentNode,
    *,
    input_values: dict[str, Any] | None,
    state_schema: dict[str, NodeSystemStateDefinition] | None,
) -> list[str]:
    if not input_values or not state_schema:
        return []

    subgraph_keys: list[str] = []
    for read_binding in node.reads:
        definition = state_schema.get(read_binding.state)
        if definition is None or definition.type != NodeSystemStateType.CAPABILITY:
            continue
        subgraph_key = extract_capability_subgraph_key(input_values.get(read_binding.state))
        if subgraph_key:
            subgraph_keys.append(subgraph_key)
    return subgraph_keys


def extract_capability_skill_key(value: Any) -> str:
    return _extract_capability_key(value, expected_kind="skill")


def extract_capability_subgraph_key(value: Any) -> str:
    return _extract_capability_key(value, expected_kind="subgraph")


def _extract_capability_key(value: Any, *, expected_kind: str) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ""
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return ""
        return _extract_capability_key(parsed, expected_kind=expected_kind)

    if isinstance(value, list):
        return ""

    if isinstance(value, dict):
        if str(value.get("kind") or "").strip().lower() != expected_kind:
            return ""
        return str(value.get("key") or "").strip()

    return ""


def map_skill_outputs(binding: NodeSystemAgentSkillBinding, skill_result: dict[str, Any]) -> dict[str, Any]:
    return {
        state_key: skill_result.get(output_key)
        for output_key, state_key in binding.output_mapping.items()
    }


def build_skill_output_mapping_details(
    binding: NodeSystemAgentSkillBinding,
    *,
    skill_definition: SkillDefinition | None,
    state_schema: dict[str, NodeSystemStateDefinition],
) -> list[dict[str, str]]:
    output_fields = {
        field.key: field
        for field in (skill_definition.state_output_schema if skill_definition is not None else [])
    }
    details: list[dict[str, str]] = []
    for output_key, state_key in binding.output_mapping.items():
        field = output_fields.get(output_key)
        state_definition = state_schema.get(state_key)
        detail: dict[str, str] = {
            "output_key": output_key,
            "output_name": field.name if field is not None else "",
            "output_type": field.value_type if field is not None else "",
            "output_description": field.description if field is not None else "",
            "state_key": state_key,
            "state_name": state_definition.name if state_definition is not None else "",
            "state_type": state_definition.type.value if state_definition is not None else "",
            "state_description": state_definition.description if state_definition is not None else "",
        }
        details.append(detail)
    return details


def _infer_skill_output_state_key(
    *,
    skill_key: str,
    field: SkillIoField,
    writable_state_keys: list[str],
    used_state_keys: set[str],
    state_schema: dict[str, NodeSystemStateDefinition],
) -> str:
    candidates: list[tuple[int, str]] = []
    field_key = _normalize_name(field.key)
    field_name = _normalize_name(field.name)
    for state_key in writable_state_keys:
        if state_key in used_state_keys:
            continue
        definition = state_schema.get(state_key)
        binding = definition.binding if definition is not None else None
        if (
            binding is not None
            and binding.skill_key == skill_key
            and binding.field_key == field.key
        ):
            return state_key

        score = 0
        state_key_name = _normalize_name(state_key)
        state_display_name = _normalize_name(definition.name if definition is not None else "")
        if state_key == field.key:
            score = 100
        elif state_key_name == field_key:
            score = 90
        elif field_name and state_display_name == field_name:
            score = 80
        elif _state_type_matches_field(definition, field):
            if field_key and field_key in state_key_name:
                score = 70
            elif field_name and field_name in state_display_name:
                score = 60
        if score:
            candidates.append((score, state_key))

    if not candidates:
        return ""
    candidates.sort(reverse=True)
    best_score = candidates[0][0]
    best_candidates = [state_key for score, state_key in candidates if score == best_score]
    return best_candidates[0] if len(best_candidates) == 1 else ""


def _normalize_name(value: str) -> str:
    return "".join(character for character in value.lower() if character.isalnum())


def _state_type_matches_field(definition: NodeSystemStateDefinition | None, field: SkillIoField) -> bool:
    if definition is None:
        return False
    return definition.type.value == field.value_type
