from __future__ import annotations

import json
import shutil
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import format_graph_state_input_prompt_lines
from app.core.runtime.agent_response_generation import _resolve_media_runtime_config, repair_structured_output_with_runtime_model
from app.core.runtime.skill_bindings import ResolvedAgentSkillBinding
from app.core.runtime.structured_output import build_skill_input_output_schema, validate_structured_output
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.schemas.skills import SkillDefinition, SkillIoField
from app.core.thinking_levels import resolve_effective_thinking_level
from app.skills.runtime import (
    has_lifecycle_before_llm,
    invoke_lifecycle_before_llm,
    resolve_skill_dir_from_source_path,
)
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
        runtime_context=resolve_skill_runtime_context(runtime_config),
    )
    structured_output_schema = build_skill_input_output_schema(bindings, skill_definitions)
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
                structured_output_schema=structured_output_schema,
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
                structured_output_schema=structured_output_schema,
            )
        finally:
            cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))

    skill_inputs = parse_skill_input_response(content, [binding.binding.skill_key for binding in bindings])
    initial_structured_output_validation_errors = validate_structured_output(skill_inputs, structured_output_schema)
    structured_output_validation_errors = list(initial_structured_output_validation_errors)
    repair_attempted = False
    repair_succeeded = False
    repair_validation_errors: list[str] = []
    repair_error = ""
    repair_meta: dict[str, Any] = {}
    if initial_structured_output_validation_errors:
        repair_attempted = True
        try:
            repair_content, repair_meta = repair_structured_output_with_runtime_model(
                runtime_config=runtime_config,
                structured_output_schema=structured_output_schema,
                validation_errors=initial_structured_output_validation_errors,
                raw_model_output=content,
                chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            )
            repaired_skill_inputs = parse_skill_input_response(
                repair_content,
                [binding.binding.skill_key for binding in bindings],
            )
            repair_validation_errors = validate_structured_output(repaired_skill_inputs, structured_output_schema)
            if not repair_validation_errors:
                content = repair_content
                skill_inputs = repaired_skill_inputs
                structured_output_validation_errors = []
                repair_succeeded = True
        except Exception as exc:
            repair_error = str(exc)
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    structured_output_strategy = str(llm_meta.get("structured_output_strategy") or "json_schema")
    updated_runtime_config = {
        **runtime_config,
        "skill_input_provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "skill_input_provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "skill_input_provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "skill_input_provider_reasoning_captured": bool(reasoning),
        "skill_input_provider_response_id": llm_meta.get("response_id"),
        "skill_input_provider_usage": llm_meta.get("usage"),
        "skill_input_provider_timings": llm_meta.get("timings"),
        "skill_input_structured_output_strategy": structured_output_strategy,
        "skill_input_structured_output_schema": structured_output_schema,
        "skill_input_structured_output_validation_errors": structured_output_validation_errors,
        "skill_input_structured_output_initial_validation_errors": initial_structured_output_validation_errors,
        "skill_input_structured_output_repair_attempted": repair_attempted,
        "skill_input_structured_output_repair_succeeded": repair_succeeded,
        "skill_input_structured_output_repair_validation_errors": repair_validation_errors,
        "skill_input_structured_output_repair_error": repair_error,
        "skill_input_structured_output_repair_provider_response_id": repair_meta.get("response_id"),
        "skill_input_structured_output_repair_provider_usage": repair_meta.get("usage"),
        "skill_input_structured_output_repair_provider_timings": repair_meta.get("timings"),
    }
    warnings = [*attachment_warnings, *llm_meta.get("warnings", []), *repair_meta.get("warnings", [])]
    if repair_error:
        warnings.append(f"Skill input structured output repair failed: {repair_error}")
    if structured_output_validation_errors:
        warnings.append(
            "Skill input structured output validation found mismatches: "
            + "; ".join(structured_output_validation_errors[:5])
        )
    return skill_inputs, reasoning, warnings, updated_runtime_config


def build_skill_input_system_prompt(
    *,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentSkillBinding],
    skill_definitions: dict[str, SkillDefinition],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    node: NodeSystemAgentNode | None = None,
    runtime_context: dict[str, Any] | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "You are the skill-input planning phase of a graph LLM node.",
        "Choose concrete LLM parameter arguments for every bound skill from the current graph state and the skill schemas.",
        "Return only one JSON object. Do not add markdown fences or prose.",
        "The top-level keys must be skill keys. Each value must be a JSON object of arguments for that skill.",
        "Do not summarize skill results. Do not answer the user here. Only produce LLM parameters described by llmParameterSchema.",
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
            parts.append("  llmParameterSchema: []")
            example[skill_key] = {}
            continue
        if definition.name:
            parts.append(f"  name: {definition.name}")
        if definition.description:
            parts.append(f"  description: {definition.description}")
        llm_instruction = resolve_effective_skill_llm_instruction(node, skill_key, definition)
        if llm_instruction:
            parts.append(f"  llmInstruction: {llm_instruction}")
        if definition.state_input_schema:
            parts.append("  stateInputSchema:")
            for field in definition.state_input_schema:
                parts.extend(format_skill_input_field_lines(field))
        parts.append("  llmParameterSchema:")
        for field in definition.input_schema:
            parts.extend(format_skill_input_field_lines(field))
        example[skill_key] = {
            field.key: example_skill_input_value(field)
            for field in definition.input_schema
            if field.required
        }

    before_llm_context_lines = format_skill_before_llm_context_lines(
        bindings=bindings,
        skill_definitions=skill_definitions,
        node=node,
        runtime_context=runtime_context,
    )
    if before_llm_context_lines:
        parts.extend(before_llm_context_lines)

    parts.append("\n== Required JSON Shape ==")
    parts.append(json.dumps(example, ensure_ascii=False, indent=2))
    return "\n".join(parts)


def format_skill_before_llm_context_lines(
    *,
    bindings: list[ResolvedAgentSkillBinding],
    skill_definitions: dict[str, SkillDefinition],
    node: NodeSystemAgentNode | None = None,
    runtime_context: dict[str, Any] | None = None,
) -> list[str]:
    entries: list[tuple[str, str]] = []
    for resolved_binding in bindings:
        skill_key = resolved_binding.binding.skill_key
        definition = skill_definitions.get(skill_key)
        if definition is None:
            continue
        skill_dir = resolve_skill_dir_from_source_path(definition.source_path)
        if skill_dir is None or not has_lifecycle_before_llm(skill_dir):
            continue
        payload = {
            "skill_key": skill_key,
            "runtime_context": runtime_context or {},
            "task_instruction": node.config.task_instruction if node is not None else "",
        }
        context_payload = invoke_lifecycle_before_llm(
            skill_key=skill_key,
            skill_dir=skill_dir,
            payload=payload,
            timeout_seconds=definition.runtime.timeout_seconds,
        )
        context_text = format_before_llm_context_payload(context_payload)
        if context_text:
            entries.append((skill_key, context_text))

    if not entries:
        return []

    lines = ["\n== Skill Pre-LLM Context =="]
    for skill_key, context_text in entries:
        lines.append(f"- skillKey: {skill_key}")
        lines.append("  context:")
        lines.extend(f"    {line}" for line in context_text.splitlines())
    return lines


def resolve_skill_runtime_context(runtime_config: dict[str, Any]) -> dict[str, Any]:
    value = runtime_config.get("skill_runtime_context")
    if isinstance(value, dict):
        return dict(value)
    value = runtime_config.get("runtime_context")
    if isinstance(value, dict):
        return dict(value)
    return {}


def format_before_llm_context_payload(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""
    if str(payload.get("status") or "").strip().lower() == "failed":
        return ""
    for key in ("context", "prompt", "message"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    cleaned = {key: value for key, value in payload.items() if key not in {"status"}}
    return json.dumps(cleaned, ensure_ascii=False, indent=2) if cleaned else ""


def build_skill_input_user_prompt(node: NodeSystemAgentNode) -> str:
    return (
        node.config.task_instruction
        if node.config.task_instruction
        else "Generate skill LLM parameters from the graph state and skill schemas."
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
    if field.value_type == "capability":
        return {"kind": "none"}
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
