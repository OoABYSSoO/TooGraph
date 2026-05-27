from __future__ import annotations

import json
import shutil
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import (
    append_llm_prompt_snapshots,
    build_llm_prompt_snapshot,
    format_graph_state_input_prompt_lines,
    format_prompt_value,
)
from app.core.runtime.agent_response_generation import _resolve_media_runtime_config, repair_structured_output_with_runtime_model
from app.core.runtime.action_bindings import ResolvedAgentActionBinding
from app.core.runtime.structured_output import build_action_llm_output_schema, validate_structured_output
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemReadBindingKind,
    NodeSystemStateBindingKind,
    NodeSystemStateDefinition,
)
from app.core.schemas.actions import ActionDefinition, ActionIoField
from app.core.thinking_levels import resolve_effective_thinking_level
from app.actions.runtime import (
    has_lifecycle_before_llm,
    invoke_lifecycle_before_llm,
    resolve_action_dir_from_source_path,
)
from app.tools.local_llm import _chat_with_local_model_with_meta
from app.tools.model_provider_client import chat_with_model_ref_with_meta


def generate_agent_action_inputs(
    *,
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentActionBinding],
    action_definitions: dict[str, ActionDefinition],
    runtime_config: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    chat_with_local_model_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = _chat_with_local_model_with_meta,
    chat_with_model_ref_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = chat_with_model_ref_with_meta,
    get_default_video_model_ref_func: Callable[..., str] = get_default_video_model_ref,
    resolve_runtime_model_name_func: Callable[[str], str] = resolve_runtime_model_name,
    resolve_effective_thinking_level_func: Callable[..., str] = resolve_effective_thinking_level,
    on_delta: Any | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], str, list[str], dict[str, Any]]:
    if not bindings:
        return {}, {}, "", [], runtime_config

    state_output_keys = collect_action_planning_state_output_keys(
        node=node,
        bindings=bindings,
        state_schema=state_schema,
    )
    raw_input_attachments = collect_input_attachments(input_values, state_schema=state_schema)
    input_attachments, attachment_warnings, attachment_meta = prepare_model_input_attachments(raw_input_attachments)
    runtime_config = _resolve_media_runtime_config(
        runtime_config,
        input_attachments,
        get_default_video_model_ref_func=get_default_video_model_ref_func,
        resolve_runtime_model_name_func=resolve_runtime_model_name_func,
        resolve_effective_thinking_level_func=resolve_effective_thinking_level_func,
    )
    system_prompt = build_action_input_system_prompt(
        input_values=input_values,
        bindings=bindings,
        action_definitions=action_definitions,
        state_schema=state_schema,
        node=node,
        runtime_context=resolve_action_runtime_context(runtime_config),
        state_output_keys=state_output_keys,
    )
    structured_output_schema = build_action_llm_output_schema(
        bindings,
        action_definitions,
        state_output_keys=state_output_keys,
        state_schema=state_schema,
    )
    user_prompt = build_action_input_user_prompt(node)
    action_keys = [binding.binding.action_key for binding in bindings]
    prompt_snapshot = build_llm_prompt_snapshot(
        phase="action_input_planning",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        input_values=input_values,
        output_keys=state_output_keys,
        action_keys=action_keys,
        structured_output_schema=structured_output_schema,
    )
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
                on_delta=on_delta,
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
                on_delta=on_delta,
                input_attachments=input_attachments,
                structured_output_schema=structured_output_schema,
            )
        finally:
            cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))

    action_inputs, state_outputs = parse_action_planning_response(content, action_keys, state_output_keys)
    structured_output_payload = compose_action_planning_output_payload(
        action_inputs,
        state_outputs,
        action_keys=action_keys,
        state_output_keys=state_output_keys,
    )
    initial_structured_output_validation_errors = validate_structured_output(structured_output_payload, structured_output_schema)
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
                phase="action_input_structured_output_repair",
                output_keys=state_output_keys,
                action_keys=action_keys,
                chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            )
            repaired_action_inputs, repaired_state_outputs = parse_action_planning_response(
                repair_content,
                action_keys,
                state_output_keys,
            )
            repaired_payload = compose_action_planning_output_payload(
                repaired_action_inputs,
                repaired_state_outputs,
                action_keys=action_keys,
                state_output_keys=state_output_keys,
            )
            repair_validation_errors = validate_structured_output(repaired_payload, structured_output_schema)
            if not repair_validation_errors:
                content = repair_content
                action_inputs = repaired_action_inputs
                state_outputs = repaired_state_outputs
                structured_output_payload = repaired_payload
                structured_output_validation_errors = []
                repair_succeeded = True
        except Exception as exc:
            repair_error = str(exc)
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    structured_output_strategy = str(llm_meta.get("structured_output_strategy") or "json_schema")
    updated_runtime_config = {
        **runtime_config,
        "prompt_snapshots": append_llm_prompt_snapshots(runtime_config, prompt_snapshot, repair_meta.get("prompt_snapshot")),
        "action_input_provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "action_input_provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "action_input_provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "action_input_provider_reasoning_captured": bool(reasoning),
        "action_input_provider_response_id": llm_meta.get("response_id"),
        "action_input_provider_usage": llm_meta.get("usage"),
        "action_input_provider_timings": llm_meta.get("timings"),
        "action_input_provider_fallback_used": bool(llm_meta.get("provider_fallback_used")),
        "action_input_requested_model_ref": llm_meta.get("requested_model_ref"),
        "action_input_provider_fallback_trace": llm_meta.get("provider_fallback_trace"),
        "action_input_structured_output_strategy": structured_output_strategy,
        "action_input_structured_output_schema": structured_output_schema,
        "action_input_structured_output_validation_errors": structured_output_validation_errors,
        "action_input_structured_output_initial_validation_errors": initial_structured_output_validation_errors,
        "action_input_structured_output_repair_attempted": repair_attempted,
        "action_input_structured_output_repair_succeeded": repair_succeeded,
        "action_input_structured_output_repair_validation_errors": repair_validation_errors,
        "action_input_structured_output_repair_error": repair_error,
        "action_input_structured_output_repair_provider_id": repair_meta.get("provider_id"),
        "action_input_structured_output_repair_provider_model": repair_meta.get("model"),
        "action_input_structured_output_repair_provider_response_id": repair_meta.get("response_id"),
        "action_input_structured_output_repair_provider_usage": repair_meta.get("usage"),
        "action_input_structured_output_repair_provider_timings": repair_meta.get("timings"),
        "action_input_structured_output_repair_provider_fallback_used": bool(repair_meta.get("provider_fallback_used")),
        "action_input_structured_output_repair_requested_model_ref": repair_meta.get("requested_model_ref"),
        "action_input_structured_output_repair_provider_fallback_trace": repair_meta.get("provider_fallback_trace"),
        "action_input_state_output_keys": list(state_output_keys),
    }
    warnings = [*attachment_warnings, *llm_meta.get("warnings", []), *repair_meta.get("warnings", [])]
    if repair_error:
        warnings.append(f"Action LLM output repair failed: {repair_error}")
    if structured_output_validation_errors:
        warnings.append(
            "Action LLM output validation found mismatches: "
            + "; ".join(structured_output_validation_errors[:5])
        )
    return action_inputs, state_outputs, reasoning, warnings, updated_runtime_config


def build_action_input_system_prompt(
    *,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentActionBinding],
    action_definitions: dict[str, ActionDefinition],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    node: NodeSystemAgentNode | None = None,
    runtime_context: dict[str, Any] | None = None,
    state_output_keys: list[str] | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    resolved_state_output_keys = list(state_output_keys or [])
    action_state_input_slots = collect_action_state_input_slots(
        node=node,
        input_values=input_values,
        bindings=bindings,
    )
    parts = [
        "You are the Action LLM-output planning phase of a graph LLM node.",
        "Choose concrete structured LLM output for every bound action from the current graph state and the action schemas.",
        "Return only one JSON object. Do not add markdown fences or prose.",
        "The top-level keys must include every bound action key and every listed custom state output key.",
        "Action key values must be JSON objects of arguments for that action.",
        "Custom state output values are normal LLM-authored graph state values.",
        "Do not summarize action results. Do not answer the user here. Only produce the structured LLM output described by llmOutputSchema and the custom state outputs.",
    ]
    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            definition = resolved_state_schema.get(key)
            parts.extend(format_graph_state_input_prompt_lines(key, definition, value))

    if action_state_input_slots:
        parts.extend(format_action_state_input_slot_lines(action_state_input_slots, action_definitions))

    parts.append("\n== Bound Actions ==")
    example: dict[str, dict[str, Any]] = {}
    for resolved_binding in bindings:
        action_key = resolved_binding.binding.action_key
        definition = action_definitions.get(action_key)
        parts.append(f"- actionKey: {action_key}")
        if definition is None:
            parts.append("  llmOutputSchema: []")
            example[action_key] = {}
            continue
        if definition.name:
            parts.append(f"  name: {definition.name}")
        if definition.description:
            parts.append(f"  description: {definition.description}")
        llm_instruction = resolve_effective_action_llm_instruction(node, action_key, definition)
        if llm_instruction:
            parts.append(f"  llmInstruction: {llm_instruction}")
        if definition.state_input_schema:
            parts.append("  stateInputSchema:")
            for field in definition.state_input_schema:
                parts.extend(format_action_input_field_lines(field))
        parts.append("  llmOutputSchema:")
        for field in definition.llm_output_schema:
            parts.extend(format_action_input_field_lines(field))
        example[action_key] = {
            field.key: example_action_input_value(field)
            for field in definition.llm_output_schema
        }

    if resolved_state_output_keys:
        parts.append("\n== Custom LLM State Outputs ==")
        parts.append("These state outputs are written directly to graph state and are not passed to after_llm.py.")
        parts.append("Return them in the same top-to-bottom order listed here.")
        for state_key in resolved_state_output_keys:
            definition = resolved_state_schema.get(state_key)
            parts.append(f"- stateKey: {state_key}")
            name = getattr(definition, "name", "") if definition is not None else ""
            description = getattr(definition, "description", "") if definition is not None else ""
            value_type = getattr(definition, "type", None)
            if name and name != state_key:
                parts.append(f"  name: {name}")
            if value_type is not None:
                parts.append(f"  type: {value_type.value if hasattr(value_type, 'value') else value_type}")
            if description:
                parts.append(f"  description: {description}")
            example[state_key] = example_state_output_value(definition)

    before_llm_context_lines = format_action_before_llm_context_lines(
        bindings=bindings,
        action_definitions=action_definitions,
        node=node,
        runtime_context=runtime_context,
        action_state_input_slots=action_state_input_slots,
    )
    if before_llm_context_lines:
        parts.extend(before_llm_context_lines)

    parts.append("\n== Action LLM Output JSON Shape ==")
    parts.append(json.dumps(example, ensure_ascii=False, indent=2))
    return "\n".join(parts)


def format_action_before_llm_context_lines(
    *,
    bindings: list[ResolvedAgentActionBinding],
    action_definitions: dict[str, ActionDefinition],
    node: NodeSystemAgentNode | None = None,
    runtime_context: dict[str, Any] | None = None,
    action_state_input_slots: dict[str, dict[str, dict[str, Any]]] | None = None,
) -> list[str]:
    entries: list[tuple[str, str]] = []
    action_state_inputs = {
        action_key: {
            field_key: slot.get("value")
            for field_key, slot in slots.items()
        }
        for action_key, slots in (action_state_input_slots or {}).items()
    }
    for resolved_binding in bindings:
        action_key = resolved_binding.binding.action_key
        definition = action_definitions.get(action_key)
        if definition is None:
            continue
        action_dir = resolve_action_dir_from_source_path(definition.source_path)
        if action_dir is None or not has_lifecycle_before_llm(action_dir):
            continue
        payload = {
            "action_key": action_key,
            "runtime_context": runtime_context or {},
            "action_state_inputs": action_state_inputs.get(action_key, {}),
            "task_instruction": node.config.task_instruction if node is not None else "",
        }
        context_payload = invoke_lifecycle_before_llm(
            action_key=action_key,
            action_dir=action_dir,
            payload=payload,
            timeout_seconds=definition.runtime.timeout_seconds,
        )
        context_text = format_before_llm_context_payload(context_payload)
        if context_text:
            entries.append((action_key, context_text))

    if not entries:
        return []

    lines = ["\n== Action Pre-LLM Context =="]
    for action_key, context_text in entries:
        lines.append(f"- actionKey: {action_key}")
        lines.append("  context:")
        lines.extend(f"    {line}" for line in context_text.splitlines())
    return lines


def collect_action_state_input_slots(
    *,
    node: NodeSystemAgentNode | None,
    input_values: dict[str, Any],
    bindings: list[ResolvedAgentActionBinding],
) -> dict[str, dict[str, dict[str, Any]]]:
    if node is None:
        return {}
    bound_action_keys = {resolved_binding.binding.action_key for resolved_binding in bindings}
    slots: dict[str, dict[str, dict[str, Any]]] = {}
    for read in node.reads:
        binding = read.binding
        if binding is None or binding.kind != NodeSystemReadBindingKind.ACTION_INPUT:
            continue
        if binding.action_key not in bound_action_keys:
            continue
        slots.setdefault(binding.action_key, {})[binding.field_key] = {
            "source_state": read.state,
            "value": input_values.get(read.state),
        }
    return {
        action_key: field_slots
        for action_key, field_slots in slots.items()
        if field_slots
    }


def format_action_state_input_slot_lines(
    slots: dict[str, dict[str, dict[str, Any]]],
    action_definitions: dict[str, ActionDefinition],
) -> list[str]:
    lines = ["\n== Action State Input Slots =="]
    for action_key, field_slots in slots.items():
        definition = action_definitions.get(action_key)
        field_by_key = {
            field.key: field
            for field in (definition.state_input_schema if definition is not None else [])
        }
        lines.append(f"- actionKey: {action_key}")
        for field_key, slot in field_slots.items():
            field = field_by_key.get(field_key)
            lines.append(f"  - fieldKey: {field_key}")
            if field is not None and field.name and field.name != field_key:
                lines.append(f"    name: {field.name}")
            if field is not None:
                lines.append(f"    type: {field.value_type}")
                if field.description:
                    lines.append(f"    description: {field.description}")
            lines.append(f"    source_state: {slot.get('source_state') or ''}")
            value = format_prompt_value(slot.get("value"))
            if "\n" in value:
                lines.append("    value:")
                lines.extend(f"      {line}" for line in value.splitlines())
            else:
                lines.append(f"    value: {value}")
    return lines


def resolve_action_runtime_context(runtime_config: dict[str, Any]) -> dict[str, Any]:
    value = runtime_config.get("action_runtime_context")
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


def build_action_input_user_prompt(node: NodeSystemAgentNode) -> str:
    return (
        node.config.task_instruction
        if node.config.task_instruction
        else "Generate structured Action LLM output from the graph state and action schemas."
    ).strip()


def resolve_effective_action_llm_instruction(
    node: NodeSystemAgentNode | None,
    action_key: str,
    definition: ActionDefinition,
) -> str:
    if node is not None and node.config.action_key == action_key:
        block = node.config.action_instruction_blocks.get(action_key)
        if block is not None and block.source == "node.override":
            return block.content.strip()
    return definition.llm_instruction.strip() if definition.llm_instruction else ""


def collect_action_planning_state_output_keys(
    *,
    node: NodeSystemAgentNode | None,
    bindings: list[ResolvedAgentActionBinding],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[str]:
    if node is None:
        return []
    resolved_state_schema = state_schema or {}
    action_keys = {resolved.binding.action_key for resolved in bindings}
    mapped_action_output_states = {
        state_key
        for resolved in bindings
        for state_key in resolved.binding.output_mapping.values()
        if state_key
    }
    output_keys: list[str] = []
    seen: set[str] = set()
    for write in node.writes:
        state_key = write.state
        if state_key in seen or state_key in mapped_action_output_states or state_key in action_keys:
            continue
        definition = resolved_state_schema.get(state_key)
        binding = getattr(definition, "binding", None)
        if binding is not None:
            if binding.kind == NodeSystemStateBindingKind.ACTION_OUTPUT and binding.action_key in action_keys:
                continue
            if binding.kind == NodeSystemStateBindingKind.CAPABILITY_RESULT:
                continue
        seen.add(state_key)
        output_keys.append(state_key)
    return output_keys


def parse_action_planning_response(
    content: str,
    action_keys: list[str],
    state_output_keys: list[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    parsed = _parse_json_object(content)
    if not isinstance(parsed, dict):
        return {action_key: {} for action_key in action_keys}, {}
    result: dict[str, dict[str, Any]] = {}
    for action_key in action_keys:
        value = parsed.get(action_key)
        result[action_key] = dict(value) if isinstance(value, dict) else {}
    state_outputs = {
        state_key: parsed.get(state_key)
        for state_key in state_output_keys
        if state_key in parsed
    }
    return result, state_outputs


def parse_action_input_response(content: str, action_keys: list[str]) -> dict[str, dict[str, Any]]:
    action_inputs, _state_outputs = parse_action_planning_response(content, action_keys, [])
    return action_inputs


def compose_action_planning_output_payload(
    action_inputs: dict[str, dict[str, Any]],
    state_outputs: dict[str, Any],
    *,
    action_keys: list[str],
    state_output_keys: list[str],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        action_key: dict(action_inputs.get(action_key) or {})
        for action_key in action_keys
    }
    for state_key in state_output_keys:
        if state_key in state_outputs:
            payload[state_key] = state_outputs[state_key]
    return payload


def format_action_input_field_lines(field: ActionIoField) -> list[str]:
    lines = [f"    - key: {field.key}"]
    if field.name and field.name != field.key:
        lines.append(f"      name: {field.name}")
    lines.append(f"      type: {field.value_type}")
    if field.description:
        lines.append(f"      description: {field.description}")
    return lines


def example_action_input_value(field: ActionIoField) -> Any:
    if field.value_type == "json":
        return {}
    if field.value_type == "action":
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


def example_state_output_value(definition: NodeSystemStateDefinition | None) -> Any:
    value_type = getattr(definition, "type", None)
    normalized = value_type.value if hasattr(value_type, "value") else str(value_type or "text")
    if normalized == "json":
        return {}
    if normalized == "result_package":
        return {}
    if normalized == "number":
        return 0
    if normalized == "boolean":
        return False
    if normalized == "capability":
        return {"kind": "none"}
    if normalized in {"file", "image", "audio", "video"}:
        return "<local artifact path or path array>"
    return f"<{getattr(definition, 'name', '') or 'state output'}>"


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
