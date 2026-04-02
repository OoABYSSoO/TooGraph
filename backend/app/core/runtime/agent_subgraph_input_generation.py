from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import format_graph_state_input_prompt_lines
from app.core.runtime.agent_response_generation import _resolve_media_runtime_config, repair_structured_output_with_runtime_model
from app.core.runtime.structured_output import schema_for_value_type, validate_structured_output
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.thinking_levels import resolve_effective_thinking_level
from app.tools.local_llm import _chat_with_local_model_with_meta
from app.tools.model_provider_client import chat_with_model_ref_with_meta


@dataclass(frozen=True)
class SubgraphCapabilityField:
    key: str
    name: str = ""
    value_type: str = "text"
    required: bool = True
    description: str = ""


@dataclass(frozen=True)
class SubgraphCapabilityDefinition:
    key: str
    name: str = ""
    description: str = ""
    input_schema: list[SubgraphCapabilityField] = field(default_factory=list)
    output_schema: list[SubgraphCapabilityField] = field(default_factory=list)


def generate_agent_subgraph_inputs(
    *,
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    subgraphs: list[SubgraphCapabilityDefinition],
    runtime_config: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    chat_with_local_model_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = _chat_with_local_model_with_meta,
    chat_with_model_ref_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = chat_with_model_ref_with_meta,
    get_default_video_model_ref_func: Callable[..., str] = get_default_video_model_ref,
    resolve_runtime_model_name_func: Callable[[str], str] = resolve_runtime_model_name,
    resolve_effective_thinking_level_func: Callable[..., str] = resolve_effective_thinking_level,
) -> tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]:
    if not subgraphs:
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
    system_prompt = build_subgraph_input_system_prompt(
        input_values=input_values,
        subgraphs=subgraphs,
        state_schema=state_schema,
    )
    structured_output_schema = build_subgraph_input_output_schema(subgraphs)
    user_prompt = build_subgraph_input_user_prompt(node)
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

    subgraph_inputs = parse_subgraph_input_response(content, [subgraph.key for subgraph in subgraphs])
    initial_structured_output_validation_errors = validate_structured_output(subgraph_inputs, structured_output_schema)
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
            repaired_subgraph_inputs = parse_subgraph_input_response(
                repair_content,
                [subgraph.key for subgraph in subgraphs],
            )
            repair_validation_errors = validate_structured_output(repaired_subgraph_inputs, structured_output_schema)
            if not repair_validation_errors:
                subgraph_inputs = repaired_subgraph_inputs
                structured_output_validation_errors = []
                repair_succeeded = True
        except Exception as exc:
            repair_error = str(exc)

    reasoning = str(llm_meta.get("reasoning") or "").strip()
    structured_output_strategy = str(llm_meta.get("structured_output_strategy") or "json_schema")
    updated_runtime_config = {
        **runtime_config,
        "subgraph_input_provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "subgraph_input_provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "subgraph_input_provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "subgraph_input_provider_reasoning_captured": bool(reasoning),
        "subgraph_input_provider_response_id": llm_meta.get("response_id"),
        "subgraph_input_provider_usage": llm_meta.get("usage"),
        "subgraph_input_provider_timings": llm_meta.get("timings"),
        "subgraph_input_structured_output_strategy": structured_output_strategy,
        "subgraph_input_structured_output_schema": structured_output_schema,
        "subgraph_input_structured_output_validation_errors": structured_output_validation_errors,
        "subgraph_input_structured_output_initial_validation_errors": initial_structured_output_validation_errors,
        "subgraph_input_structured_output_repair_attempted": repair_attempted,
        "subgraph_input_structured_output_repair_succeeded": repair_succeeded,
        "subgraph_input_structured_output_repair_validation_errors": repair_validation_errors,
        "subgraph_input_structured_output_repair_error": repair_error,
        "subgraph_input_structured_output_repair_provider_response_id": repair_meta.get("response_id"),
        "subgraph_input_structured_output_repair_provider_usage": repair_meta.get("usage"),
        "subgraph_input_structured_output_repair_provider_timings": repair_meta.get("timings"),
    }
    warnings = [*attachment_warnings, *llm_meta.get("warnings", []), *repair_meta.get("warnings", [])]
    if repair_error:
        warnings.append(f"Subgraph input structured output repair failed: {repair_error}")
    if structured_output_validation_errors:
        warnings.append(
            "Subgraph input structured output validation found mismatches: "
            + "; ".join(structured_output_validation_errors[:5])
        )
    return subgraph_inputs, reasoning, warnings, updated_runtime_config


def build_subgraph_input_system_prompt(
    *,
    input_values: dict[str, Any],
    subgraphs: list[SubgraphCapabilityDefinition],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "You are the subgraph-input planning phase of a graph LLM node.",
        "Choose concrete arguments for every selected graph template from the current graph state and the template public input schemas.",
        "Return only one JSON object. Do not add markdown fences or prose.",
        "The top-level keys must be graph template keys. Each value must be a JSON object of public inputs for that template.",
        "Do not run the graph. Do not summarize graph results. Do not answer the user here. Only produce graph template inputs.",
    ]
    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            definition = resolved_state_schema.get(key)
            parts.extend(format_graph_state_input_prompt_lines(key, definition, value))

    parts.append("\n== Selected Graph Templates ==")
    example: dict[str, dict[str, Any]] = {}
    for subgraph in subgraphs:
        parts.append(f"- key: {subgraph.key}")
        if subgraph.name:
            parts.append(f"  name: {subgraph.name}")
        if subgraph.description:
            parts.append(f"  description: {subgraph.description}")
        parts.append("  inputSchema:")
        if subgraph.input_schema:
            for field in subgraph.input_schema:
                parts.extend(format_subgraph_field_lines(field))
        else:
            parts.append("    []")
        parts.append("  outputSchema:")
        if subgraph.output_schema:
            for field in subgraph.output_schema:
                parts.extend(format_subgraph_field_lines(field))
        else:
            parts.append("    []")
        example[subgraph.key] = {
            field.key: example_subgraph_input_value(field)
            for field in subgraph.input_schema
            if field.required
        }

    parts.append("\n== Required JSON Shape ==")
    parts.append(json.dumps(example, ensure_ascii=False, indent=2))
    return "\n".join(parts)


def build_subgraph_input_output_schema(subgraphs: list[SubgraphCapabilityDefinition]) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required_subgraph_keys: list[str] = []
    for subgraph in subgraphs:
        required_subgraph_keys.append(subgraph.key)
        field_properties: dict[str, Any] = {}
        required_fields: list[str] = []
        for field in subgraph.input_schema:
            field_schema = schema_for_value_type(field.value_type)
            if field.description:
                field_schema["description"] = f"{field.name}: {field.description}" if field.name else field.description
            elif field.name:
                field_schema["description"] = field.name
            field_properties[field.key] = field_schema
            if field.required:
                required_fields.append(field.key)
        properties[subgraph.key] = {
            "type": "object",
            "properties": field_properties,
            "required": required_fields,
            "additionalProperties": False,
        }

    return {
        "type": "object",
        "properties": properties,
        "required": required_subgraph_keys,
        "additionalProperties": False,
    }


def build_subgraph_input_user_prompt(node: NodeSystemAgentNode) -> str:
    return (
        node.config.task_instruction
        if node.config.task_instruction
        else "Generate graph template inputs from the graph state and public input schemas."
    ).strip()


def parse_subgraph_input_response(content: str, subgraph_keys: list[str]) -> dict[str, dict[str, Any]]:
    parsed = _parse_json_object(content)
    if not isinstance(parsed, dict):
        return {subgraph_key: {} for subgraph_key in subgraph_keys}
    result: dict[str, dict[str, Any]] = {}
    for subgraph_key in subgraph_keys:
        value = parsed.get(subgraph_key)
        result[subgraph_key] = dict(value) if isinstance(value, dict) else {}
    return result


def format_subgraph_field_lines(field: SubgraphCapabilityField) -> list[str]:
    lines = [f"    - key: {field.key}"]
    if field.name and field.name != field.key:
        lines.append(f"      name: {field.name}")
    lines.append(f"      type: {field.value_type}")
    lines.append(f"      required: {field.required}")
    if field.description:
        lines.append(f"      description: {field.description}")
    return lines


def example_subgraph_input_value(field: SubgraphCapabilityField) -> Any:
    if field.value_type == "json":
        return {}
    if field.value_type in {"file", "image", "audio", "video"}:
        return f"<local artifact path or path array for {field.key}>"
    if field.value_type == "number":
        return 0
    if field.value_type == "boolean":
        return False
    if field.value_type == "capability":
        return {"kind": "none"}
    if field.value_type == "result_package":
        return {}
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
