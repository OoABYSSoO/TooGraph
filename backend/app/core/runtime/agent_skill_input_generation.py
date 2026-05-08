from __future__ import annotations

import json
import shutil
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import format_graph_state_input_prompt_lines
from app.core.runtime.agent_response_generation import _resolve_media_runtime_config
from app.core.runtime.skill_bindings import ResolvedAgentSkillBinding
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.schemas.skills import SkillDefinition, SkillIoField
from app.core.thinking_levels import resolve_effective_thinking_level
from app.tools.local_llm import _chat_with_local_model_with_meta
from app.tools.model_provider_client import chat_with_model_ref_with_meta


def generate_agent_skill_inputs(
    *,
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentSkillBinding],
    skill_definitions: dict[str, SkillDefinition],
    runtime_config: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    chat_with_local_model_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = _chat_with_local_model_with_meta,
    chat_with_model_ref_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = chat_with_model_ref_with_meta,
    get_default_video_model_ref_func: Callable[..., str] = get_default_video_model_ref,
    resolve_runtime_model_name_func: Callable[[str], str] = resolve_runtime_model_name,
    resolve_effective_thinking_level_func: Callable[..., str] = resolve_effective_thinking_level,
) -> tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]:
    if not bindings:
        return {}, "", [], runtime_config

    raw_input_attachments = collect_input_attachments(input_values, state_schema=state_schema)
    input_attachments, attachment_warnings, attachment_meta = prepare_model_input_attachments(raw_input_attachments)
    runtime_config = _resolve_media_runtime_config(
        runtime_config,
        input_attachments,
        get_default_video_model_ref_func=get_default_video_model_ref_func,
        resolve_runtime_model_name_func=resolve_runtime_model_name_func,
        resolve_effective_thinking_level_func=resolve_effective_thinking_level_func,
    )
    system_prompt = build_skill_input_system_prompt(
        input_values=input_values,
        bindings=bindings,
        skill_definitions=skill_definitions,
        state_schema=state_schema,
        node=node,
    )
    user_prompt = build_skill_input_user_prompt(node)
    thinking_level = runtime_config.get("resolved_thinking_level")
    if not isinstance(thinking_level, str):
        thinking_level = "medium" if runtime_config.get("resolved_thinking") else "off"

    if runtime_config.get("resolved_provider_id") == "local":
        try:
            content, llm_meta = chat_with_local_model_with_meta_func(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=runtime_config["runtime_model_name"],
                provider_id="local",
                temperature=runtime_config["resolved_temperature"],
                thinking_enabled=runtime_config["resolved_thinking"],
                thinking_level=thinking_level,
                input_attachments=input_attachments,
            )
        finally:
            cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))
    else:
        try:
            content, llm_meta = chat_with_model_ref_with_meta_func(
                model_ref=runtime_config["resolved_model_ref"],
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=runtime_config["resolved_temperature"],
                thinking_enabled=runtime_config["resolved_thinking"],
                thinking_level=thinking_level,
                input_attachments=input_attachments,
            )
        finally:
            cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))

    skill_inputs = parse_skill_input_response(content, [binding.binding.skill_key for binding in bindings])
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    updated_runtime_config = {
        **runtime_config,
        "skill_input_provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "skill_input_provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "skill_input_provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "skill_input_provider_reasoning_captured": bool(reasoning),
        "skill_input_provider_response_id": llm_meta.get("response_id"),
        "skill_input_provider_usage": llm_meta.get("usage"),
        "skill_input_provider_timings": llm_meta.get("timings"),
    }
    return skill_inputs, reasoning, [*attachment_warnings, *llm_meta.get("warnings", [])], updated_runtime_config


def build_skill_input_system_prompt(
    *,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentSkillBinding],
    skill_definitions: dict[str, SkillDefinition],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    node: NodeSystemAgentNode | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "You are the skill-input planning phase of a graph LLM node.",
        "Choose concrete arguments for every bound skill from the current graph state and the skill schemas.",
        "Return only one JSON object. Do not add markdown fences or prose.",
        "The top-level keys must be skill keys. Each value must be a JSON object of arguments for that skill.",
        "Do not summarize skill results. Do not answer the user here. Only produce skill arguments.",
    ]
    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            definition = resolved_state_schema.get(key)
            parts.extend(format_graph_state_input_prompt_lines(key, definition, value))

    parts.append("\n== Bound Skills ==")
    example: dict[str, dict[str, Any]] = {}
    for resolved_binding in bindings:
        skill_key = resolved_binding.binding.skill_key
        definition = skill_definitions.get(skill_key)
        parts.append(f"- skillKey: {skill_key}")
        if definition is None:
            parts.append("  inputSchema: []")
            example[skill_key] = {}
            continue
        if definition.name:
            parts.append(f"  name: {definition.name}")
        if definition.description:
            parts.append(f"  description: {definition.description}")
        llm_instruction = resolve_effective_skill_llm_instruction(node, skill_key, definition)
        if llm_instruction:
            parts.append(f"  llmInstruction: {llm_instruction}")
        parts.append("  inputSchema:")
        for field in definition.input_schema:
            parts.extend(format_skill_input_field_lines(field))
        example[skill_key] = {
            field.key: example_skill_input_value(field)
            for field in definition.input_schema
            if field.required
        }

    parts.append("\n== Required JSON Shape ==")
    parts.append(json.dumps(example, ensure_ascii=False, indent=2))
    return "\n".join(parts)


def build_skill_input_user_prompt(node: NodeSystemAgentNode) -> str:
    return (
        node.config.task_instruction
        if node.config.task_instruction
        else "Generate skill arguments from the graph state and skill schemas."
    ).strip()


def resolve_effective_skill_llm_instruction(
    node: NodeSystemAgentNode | None,
    skill_key: str,
    definition: SkillDefinition,
) -> str:
    if node is not None and node.config.skill_key == skill_key:
        block = node.config.skill_instruction_blocks.get(skill_key)
        if block is not None and block.source == "node.override":
            return block.content.strip()
    return definition.llm_instruction.strip() if definition.llm_instruction else ""


def parse_skill_input_response(content: str, skill_keys: list[str]) -> dict[str, dict[str, Any]]:
    parsed = _parse_json_object(content)
    if not isinstance(parsed, dict):
        return {skill_key: {} for skill_key in skill_keys}
    result: dict[str, dict[str, Any]] = {}
    for skill_key in skill_keys:
        value = parsed.get(skill_key)
        result[skill_key] = dict(value) if isinstance(value, dict) else {}
    return result


def format_skill_input_field_lines(field: SkillIoField) -> list[str]:
    lines = [f"    - key: {field.key}"]
    if field.name and field.name != field.key:
        lines.append(f"      name: {field.name}")
    lines.append(f"      type: {field.value_type}")
    lines.append(f"      required: {field.required}")
    if field.description:
        lines.append(f"      description: {field.description}")
    return lines


def example_skill_input_value(field: SkillIoField) -> Any:
    if field.value_type == "json":
        return {}
    if field.value_type == "skill":
        return []
    if field.value_type in {"file", "image", "audio", "video"}:
        return f"<local artifact path or path array for {field.key}>"
    if field.value_type == "number":
        return 0
    if field.value_type == "boolean":
        return False
    return f"<{field.key}>"


def cleanup_prepared_media_paths(paths: Any) -> None:
    if not isinstance(paths, list):
        return
    for raw_path in paths:
        path = str(raw_path or "").strip()
        if path:
            shutil.rmtree(path, ignore_errors=True)


def _parse_json_object(content: str) -> Any:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`").strip()
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(stripped[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None
