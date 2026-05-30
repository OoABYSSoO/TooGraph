from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.runtime.agent_multimodal import normalize_uploaded_file_envelope
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.storage.local_input_sources import read_local_input_file_metadata, read_local_input_text_for_prompt
from app.core.storage.capability_artifact_store import read_capability_artifact_file_metadata, read_capability_artifact_text_for_prompt
from app.core.storage.context_assembly_store import (
    expand_context_assembly_ref,
    expand_context_package,
    is_context_assembly_ref,
    is_context_package,
)


RESULT_PACKAGE_INPUT_PROMPT_CHAR_LIMIT = 1200
RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT = 1600
RESULT_PACKAGE_ARTIFACT_TEXT_CHAR_LIMIT = 1600
FILE_STATE_PROMPT_TEXT_CHAR_LIMIT = 4000
RESULT_PACKAGE_MAX_ARTIFACT_REFS = 20
ARTIFACT_REF_KEYS = (
    "title",
    "artifact_kind",
    "summary",
    "path",
    "local_path",
    "url",
    "file_name",
    "source_key",
    "node_id",
    "format",
    "content_type",
    "size",
    "char_count",
)


def build_effective_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    action_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    return build_auto_system_prompt(output_keys, input_values, action_context, state_schema=state_schema)


def build_auto_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    action_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "你是一个工作流处理节点。根据输入和Action 结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]

    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            definition = resolved_state_schema.get(key)
            parts.extend(format_graph_state_input_prompt_lines(key, definition, value))

    if action_context:
        parts.append("\n== Action Results ==")
        parts.append("涉及事实、日期、天气、新闻或外部资料时，必须以Action 结果为依据；不要编造Action 结果中不存在的事实。")
        parts.append("如果Action 结果没有提供足够证据，明确说明未检索到可靠答案。")
        parts.append("引用链接必须完整复制 URL；不要用省略号、截断链接或泛称代替标题和链接。")
        for action_key, result in action_context.items():
            parts.append(f"[{action_key}]")
            if isinstance(result, dict):
                for result_key, result_value in result.items():
                    display = format_prompt_value(result_value)
                    parts.append(f"  {result_key}: {display}")
            else:
                parts.append(f"  {format_prompt_value(result)}")

    example = json.dumps(
        {
            key: example_output_value_for_state(resolved_state_schema.get(key))
            for key in output_keys
        },
        ensure_ascii=False,
    )
    parts.append("\n== 必须返回的 JSON 字段 ==")
    for key in output_keys:
        parts.extend(format_state_prompt_lines(key, resolved_state_schema.get(key), include_output_contract=True))
    parts.append("\n== 必须返回的 JSON 格式 ==")
    parts.append(example)
    parts.append("每个字段必须使用上方的 key；name 只用于理解字段语义。")
    return "\n".join(parts)


def format_prompt_value(value: Any) -> str:
    sanitized = sanitize_prompt_value(value)
    if isinstance(sanitized, (dict, list)):
        return json.dumps(sanitized, ensure_ascii=False, indent=2)
    return "" if sanitized is None else str(sanitized)


def format_graph_state_input_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: Any,
) -> list[str]:
    if is_context_package(value):
        return format_context_package_prompt_lines(key, definition, value)
    if is_context_assembly_ref(value):
        return format_context_assembly_ref_prompt_lines(key, definition, value)
    if _is_result_package_prompt_state(definition):
        return format_result_package_prompt_lines(key, definition, value)
    if _is_file_reference_prompt_state(definition):
        lines = format_state_prompt_lines(key, definition)
        lines.extend(
            format_file_state_prompt_lines(
                value,
                allow_text=definition.type == NodeSystemStateType.FILE,
                declared_state_type=definition.type,
                max_text_chars=FILE_STATE_PROMPT_TEXT_CHAR_LIMIT,
            )
        )
        return lines
    return format_state_prompt_lines(key, definition, value=format_prompt_value(value))


def format_context_assembly_ref_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: dict[str, Any],
) -> list[str]:
    lines = format_state_prompt_lines(key, definition)
    try:
        expanded = expand_context_assembly_ref(value)
        text = str(expanded.get("text") or "")
    except Exception:
        text = "[上下文组装记录读取失败。]"
    lines.append(f"  value: {text}")
    return lines


def format_context_package_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: dict[str, Any],
) -> list[str]:
    lines = format_state_prompt_lines(key, definition)
    source_kind = str(value.get("source_kind") or "").strip()
    authority = str(value.get("authority") or "").strip()
    if source_kind:
        lines.append(f"  source_kind: {source_kind}")
    if authority:
        lines.append(f"  authority: {authority}")
    budget = value.get("budget") if isinstance(value.get("budget"), dict) else {}
    if budget:
        budget_parts = []
        for key_name in ("used_chars", "source_chars", "omitted_count"):
            if budget.get(key_name) not in (None, ""):
                budget_parts.append(f"{key_name}={budget.get(key_name)}")
        if budget_parts:
            lines.append(f"  budget: {', '.join(budget_parts)}")
    metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
    metadata_parts = []
    for key_name in ("current_session_id", "current_message_id", "source_run_id"):
        metadata_value = " ".join(str(metadata.get(key_name) or "").split())
        if metadata_value:
            metadata_parts.append(f"{key_name}={metadata_value}")
    if metadata_parts:
        lines.append(f"  metadata: {', '.join(metadata_parts)}")
    source_refs = _context_package_prompt_source_refs(value)
    if source_refs:
        lines.append(f"  source_refs: {', '.join(source_refs)}")
    raw_warnings = value.get("warnings") if isinstance(value.get("warnings"), list) else []
    expanded_warnings: list[Any] = []
    try:
        expanded = expand_context_package(value)
        text = str(expanded.get("text") or "")
        expanded_warnings = list(expanded.get("warnings") or [])
    except Exception:
        text = "[上下文包读取失败。]"
    warnings = _merge_context_package_prompt_warnings(raw_warnings, expanded_warnings)
    if warnings:
        warning_codes = [
            str(warning.get("code") or warning.get("message") or "").strip()
            for warning in warnings
            if isinstance(warning, dict)
        ]
        warning_summary = ", ".join(code for code in warning_codes if code)
        if warning_summary:
            lines.append(f"  warnings: {warning_summary}")
    lines.append(f"  value: {text}")
    return lines


def _context_package_prompt_source_refs(value: dict[str, Any]) -> list[str]:
    refs = value.get("source_refs")
    if not isinstance(refs, list):
        context_ref = value.get("context_ref")
        refs = context_ref.get("source_refs") if isinstance(context_ref, dict) else []
    if not isinstance(refs, list):
        return []
    rendered: list[str] = []
    for ref in refs[:80]:
        if not isinstance(ref, dict):
            continue
        source_kind = " ".join(str(ref.get("source_kind") or "").split())
        source_id = " ".join(str(ref.get("source_id") or "").split())
        if not source_kind or not source_id:
            continue
        ordinal = ref.get("ordinal")
        suffix = f"#{ordinal}" if ordinal not in (None, "") else ""
        rendered.append(f"{source_kind}:{source_id}{suffix}")
    if len(refs) > 80:
        rendered.append(f"...+{len(refs) - 80} more")
    return rendered


def _merge_context_package_prompt_warnings(first: list[Any], second: list[Any]) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [*first, *second]:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or item.get("message") or "").strip()
        if not code or code in seen:
            continue
        seen.add(code)
        warnings.append(dict(item))
    return warnings


def collect_local_input_prompt_references(
    input_values: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[dict[str, str]]:
    resolved_state_schema = state_schema or {}
    references: list[dict[str, str]] = []
    for state_key, value in input_values.items():
        definition = resolved_state_schema.get(state_key)
        if not _is_file_reference_prompt_state(definition):
            continue
        for reference in _collect_file_state_references(value):
            if reference.get("source") != "local_input":
                continue
            references.append(
                {
                    "state_key": str(state_key),
                    "root": str(reference.get("root") or ""),
                    "relative_path": str(reference.get("relative_path") or reference.get("name") or ""),
                }
            )
    return references


def build_context_assembly_report(
    *,
    node_id: str,
    node_type: str,
    input_values: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    action_context: dict[str, Any] | None = None,
    llm_phases: list[str] | None = None,
) -> dict[str, Any]:
    resolved_state_schema = state_schema or {}
    state_reads: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    result_outputs: list[dict[str, Any]] = []
    memories: list[dict[str, Any]] = []
    knowledge_chunks: list[dict[str, Any]] = []
    total_prompt_chars = 0
    total_value_chars = 0

    for state_key, value in input_values.items():
        definition = resolved_state_schema.get(state_key)
        prompt_chars = _count_prompt_chars(format_graph_state_input_prompt_lines(state_key, definition, value))
        value_chars = _count_value_chars(value)
        state_record = {
            "state_key": state_key,
            "name": _state_definition_name(state_key, definition),
            "type": _state_definition_type(definition),
            "category": _classify_context_state(state_key, definition),
            "value_chars": value_chars,
            "prompt_chars": prompt_chars,
            "token_estimate": _estimate_tokens(prompt_chars),
        }
        state_reads.append(state_record)
        total_prompt_chars += prompt_chars
        total_value_chars += value_chars

        state_files = _build_file_context_records(
            state_key=state_key,
            value=value,
            definition=definition,
        )
        files.extend(state_files)
        memories.extend(_memory_records_from_file_records(state_files))
        if _is_result_package_prompt_state(definition):
            output_records, output_file_records, output_knowledge_chunks = _build_result_package_context_records(
                state_key=state_key,
                package=value,
            )
            result_outputs.extend(output_records)
            files.extend(output_file_records)
            memories.extend(_memory_records_from_file_records(output_file_records))
            knowledge_chunks.extend(output_knowledge_chunks)
        knowledge_chunks.extend(
            _build_knowledge_chunk_context_records(
                state_key=state_key,
                value=value,
                source_kind="state",
                source_key=state_key,
                enabled=_is_knowledge_context_state(state_key, definition),
            )
        )
        if _looks_like_memory_context(state_key, definition):
            memories.append(
                {
                    "state_key": state_key,
                    "name": _state_definition_name(state_key, definition),
                    "source": "state",
                    "char_count": value_chars,
                    "token_estimate": _estimate_tokens(value_chars),
                }
            )

    action_results: list[dict[str, Any]] = []
    for action_key, result in dict(action_context or {}).items():
        value_chars = _count_value_chars(result)
        prompt_chars = _count_prompt_chars([format_prompt_value(result)])
        action_results.append(
            {
                "action_key": str(action_key),
                "value_chars": value_chars,
                "prompt_chars": prompt_chars,
                "token_estimate": _estimate_tokens(prompt_chars),
            }
        )
        total_prompt_chars += prompt_chars
        total_value_chars += value_chars

    return {
        "version": 1,
        "node_id": node_id,
        "node_type": node_type,
        "llm_phases": list(llm_phases or []),
        "totals": {
            "state_count": len(state_reads),
            "file_count": len(files),
            "result_output_count": len(result_outputs),
            "memory_count": len(memories),
            "knowledge_chunk_count": len(knowledge_chunks),
            "action_result_count": len(action_results),
            "value_chars": total_value_chars,
            "prompt_chars": total_prompt_chars,
            "token_estimate": _estimate_tokens(total_prompt_chars),
        },
        "state_reads": state_reads,
        "files": files,
        "result_outputs": result_outputs,
        "memories": memories,
        "knowledge_chunks": knowledge_chunks,
        "action_results": action_results,
    }


def build_llm_prompt_snapshot(
    *,
    phase: str,
    system_prompt: str,
    user_prompt: str,
    input_values: dict[str, Any] | None = None,
    output_keys: list[str] | None = None,
    action_keys: list[str] | None = None,
    subgraph_keys: list[str] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    provider_cache_policy: str | None = "default",
) -> dict[str, Any]:
    system_prompt_text = str(system_prompt or "")
    user_prompt_text = str(user_prompt or "")
    system_chars = len(system_prompt_text)
    user_chars = len(user_prompt_text)
    total_chars = system_chars + user_chars
    system_prompt_hash = _hash_text(system_prompt_text)
    user_prompt_hash = _hash_text(user_prompt_text)
    structured_output_schema_hash = _hash_json(structured_output_schema or {})
    input_state_keys = list((input_values or {}).keys())
    resolved_output_keys = list(output_keys or [])
    resolved_action_keys = list(action_keys or [])
    resolved_subgraph_keys = list(subgraph_keys or [])
    context_refs = collect_prompt_snapshot_context_refs(input_values or {})
    return {
        "kind": "llm_prompt_snapshot",
        "version": 1,
        "phase": str(phase or ""),
        "storage": "hash_and_metadata",
        "system_prompt_hash": system_prompt_hash,
        "user_prompt_hash": user_prompt_hash,
        "system_prompt_chars": system_chars,
        "user_prompt_chars": user_chars,
        "total_prompt_chars": total_chars,
        "token_estimate": _estimate_tokens(total_chars),
        "input_state_keys": input_state_keys,
        "output_keys": resolved_output_keys,
        "action_keys": resolved_action_keys,
        "subgraph_keys": resolved_subgraph_keys,
        "structured_output_schema_hash": structured_output_schema_hash,
        "context_refs": context_refs,
        "prompt_cache_policy": build_prompt_cache_policy(
            phase=str(phase or ""),
            stable_prefix_hash=system_prompt_hash,
            stable_prefix_chars=system_chars,
            dynamic_suffix_hash=user_prompt_hash,
            dynamic_suffix_chars=user_chars,
            structured_output_schema_hash=structured_output_schema_hash,
            input_state_keys=input_state_keys,
            context_refs=context_refs,
            action_keys=resolved_action_keys,
            subgraph_keys=resolved_subgraph_keys,
            provider_cache_policy=provider_cache_policy,
        ),
    }


def build_prompt_cache_policy(
    *,
    phase: str,
    stable_prefix_hash: str,
    stable_prefix_chars: int,
    dynamic_suffix_hash: str,
    dynamic_suffix_chars: int,
    structured_output_schema_hash: str,
    input_state_keys: list[str],
    context_refs: list[dict[str, Any]],
    action_keys: list[str],
    subgraph_keys: list[str],
    provider_cache_policy: str | None = "default",
) -> dict[str, Any]:
    invalidators: list[str] = []
    if input_state_keys:
        invalidators.append("input_state_keys")
    if context_refs:
        invalidators.append("context_refs")
    if action_keys:
        invalidators.append("action_keys")
    if subgraph_keys:
        invalidators.append("subgraph_keys")

    requested_policy = normalize_provider_cache_policy(provider_cache_policy)
    eligible = bool(stable_prefix_chars) and not invalidators
    if not stable_prefix_chars:
        reason = "empty_stable_prefix"
    elif invalidators:
        reason = "runtime_state_in_system_prompt"
    else:
        reason = "hash_only_stable_prefix"

    mode = "audit_only"
    provider_cache_control = "not_applied"
    if requested_policy == "disabled":
        eligible = False
        reason = "node_provider_cache_policy_disabled"
        mode = "disabled"
        provider_cache_control = "disabled"

    return {
        "kind": "prompt_cache_policy",
        "version": 1,
        "storage": "hash_and_metadata",
        "mode": mode,
        "requested_policy": requested_policy,
        "provider_cache_control": provider_cache_control,
        "reuse_scope": "phase_stable_prefix",
        "stable_prefix_hash": stable_prefix_hash,
        "stable_prefix_chars": stable_prefix_chars,
        "dynamic_suffix_hash": dynamic_suffix_hash,
        "dynamic_suffix_chars": dynamic_suffix_chars,
        "cache_key": _hash_json(
            {
                "phase": str(phase or ""),
                "reuse_scope": "phase_stable_prefix",
                "stable_prefix_hash": stable_prefix_hash,
                "structured_output_schema_hash": structured_output_schema_hash,
            }
        ),
        "eligible": eligible,
        "reason": reason,
        "invalidators": invalidators,
    }


def normalize_provider_cache_policy(policy: str | None) -> str:
    value = str(policy or "default").strip().lower()
    if value in {"default", "disabled", "prefer"}:
        return value
    return "default"


def apply_provider_prompt_cache_result(
    snapshot: dict[str, Any],
    provider_result: Any,
) -> dict[str, Any]:
    if not isinstance(provider_result, dict) or not provider_result:
        return snapshot
    prompt_cache_policy = snapshot.get("prompt_cache_policy")
    if not isinstance(prompt_cache_policy, dict):
        return snapshot

    next_policy = dict(prompt_cache_policy)
    for key in ("mode", "provider_cache_control", "reason"):
        value = provider_result.get(key)
        if isinstance(value, str) and value.strip():
            next_policy[key] = value.strip()
    usage = provider_result.get("usage")
    if isinstance(usage, dict) and usage:
        next_policy["provider_usage"] = dict(usage)
    return {**snapshot, "prompt_cache_policy": next_policy}


def collect_prompt_snapshot_context_refs(input_values: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for state_key, value in input_values.items():
        _append_prompt_snapshot_context_refs(value, refs, state_key=str(state_key), seen=seen)
    return refs


def _append_prompt_snapshot_context_refs(
    value: Any,
    refs: list[dict[str, Any]],
    *,
    state_key: str,
    seen: set[str],
) -> None:
    if isinstance(value, dict):
        ref: dict[str, Any] | None = None
        if is_context_package(value):
            ref = {
                "state_key": state_key,
                "kind": "context_package",
                "package_id": str(value.get("package_id") or ""),
                "source_kind": str(value.get("source_kind") or ""),
                "authority": str(value.get("authority") or ""),
            }
            context_ref = value.get("context_ref")
            if is_context_assembly_ref(context_ref):
                ref.update(_context_assembly_ref_snapshot(context_ref))
        elif is_context_assembly_ref(value):
            ref = {
                "state_key": state_key,
                "kind": "context_assembly_ref",
                **_context_assembly_ref_snapshot(value),
            }
        if ref is not None:
            identity = json.dumps(ref, ensure_ascii=False, sort_keys=True)
            if identity not in seen:
                seen.add(identity)
                refs.append(ref)
            return
        for child in value.values():
            _append_prompt_snapshot_context_refs(child, refs, state_key=state_key, seen=seen)
        return
    if isinstance(value, list):
        for item in value:
            _append_prompt_snapshot_context_refs(item, refs, state_key=state_key, seen=seen)


def _context_assembly_ref_snapshot(ref: dict[str, Any]) -> dict[str, Any]:
    return {
        "assembly_id": str(ref.get("assembly_id") or ""),
        "target_state_key": str(ref.get("target_state_key") or ""),
        "renderer_key": str(ref.get("renderer_key") or ""),
        "renderer_version": str(ref.get("renderer_version") or ""),
        "rendered_content_hash": str(ref.get("rendered_content_hash") or ""),
        "source_count": _optional_positive_int(ref.get("source_count")),
    }


def append_llm_prompt_snapshot(runtime_config: dict[str, Any], snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return append_llm_prompt_snapshots(runtime_config, snapshot)


def append_llm_prompt_snapshots(runtime_config: dict[str, Any], *new_snapshots: Any) -> list[dict[str, Any]]:
    existing = runtime_config.get("prompt_snapshots")
    snapshots = [dict(item) for item in existing if isinstance(item, dict)] if isinstance(existing, list) else []
    for snapshot in new_snapshots:
        if isinstance(snapshot, dict):
            snapshots.append(snapshot)
    return snapshots


def sanitize_prompt_value(value: Any) -> Any:
    envelope = normalize_uploaded_file_envelope(value)
    if envelope is not None:
        return {str(key): sanitize_prompt_value(raw_value) for key, raw_value in envelope.items()}
    if isinstance(value, dict):
        return {str(key): sanitize_prompt_value(raw_value) for key, raw_value in value.items()}
    if isinstance(value, list):
        return [sanitize_prompt_value(item) for item in value]
    if isinstance(value, str) and value.startswith("data:"):
        return f"<inline-media-reference chars={len(value)}>"
    return value


def format_file_state_prompt_lines(
    value: Any,
    *,
    allow_text: bool = True,
    declared_state_type: NodeSystemStateType | None = None,
    max_text_chars: int | None = None,
) -> list[str]:
    references = _collect_file_state_references(value)
    if not references:
        return ["  value: "]

    lines: list[str] = []
    for index, reference in enumerate(references):
        if index > 0:
            lines.append("")
        reference_source = reference.get("source", "capability_artifact")
        local_path = reference["local_path"]
        requested_name = reference.get("name", "")
        requested_content_type = reference.get("content_type", "")
        file_name = requested_name or _filename_from_local_path(local_path)
        content_type = requested_content_type or _content_type_for_file_reference(file_name, declared_state_type)
        try:
            if reference_source == "local_input":
                metadata = read_local_input_file_metadata(
                    str(reference.get("root") or ""),
                    str(reference.get("relative_path") or ""),
                )
            else:
                metadata = read_capability_artifact_file_metadata(local_path)
            file_name = requested_name or str(metadata.get("name") or file_name)
            content_type = requested_content_type or str(metadata.get("content_type") or content_type)
            if not allow_text or not _is_text_like_artifact(file_name, content_type):
                lines.append(f"  media_file: {file_name}")
                lines.append(f"  media_type: {content_type}")
                if reference_source == "local_input":
                    lines.append("  media_rule: local non-text file was selected; it is not injected as text content")
                else:
                    lines.append("  media_rule: passed as a model attachment; do not treat it as text content")
                continue
            if reference_source == "local_input":
                artifact = read_local_input_text_for_prompt(
                    str(reference.get("root") or ""),
                    str(reference.get("relative_path") or ""),
                )
            else:
                artifact = read_capability_artifact_text_for_prompt(local_path)
            content = str(artifact.get("content") or "")
        except Exception:
            if not allow_text:
                lines.append(f"  media_file: {file_name}")
                lines.append(f"  media_type: {content_type}")
                if reference_source == "local_input":
                    lines.append("  media_rule: local non-text file was selected; it is not injected as text content")
                else:
                    lines.append("  media_rule: passed as a model attachment; do not treat it as text content")
                continue
            content = "[文件读取失败：文件不存在或无法读取。]"
        lines.append(f"  文件名：{file_name}")
        if max_text_chars is not None and len(content) > max_text_chars:
            lines.append("  原文摘要：")
            lines.append(_truncate_prompt_text(content, max_text_chars))
            lines.append(f"  原文省略：truncated from {len(content)} chars to {max_text_chars} chars")
        else:
            lines.append("  原文：")
            lines.append(content)
    return lines


def format_result_package_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: Any,
) -> list[str]:
    if not isinstance(value, dict) or value.get("kind") != "result_package":
        lines = format_state_prompt_lines(key, definition)
        lines.append(f"  value: {format_prompt_value(value)}")
        return lines

    outputs = value.get("outputs")
    if not isinstance(outputs, dict) or not outputs:
        status_text = _compact_result_package_status_text(value)
        if not status_text:
            return []
        virtual_definition = NodeSystemStateDefinition(
            name=_state_definition_name(key, definition),
            description=_state_definition_description(definition),
            type=NodeSystemStateType.TEXT,
        )
        return [
            *format_state_prompt_lines(key, virtual_definition),
            f"  value: {status_text}",
        ]

    artifact_refs = collect_result_package_artifact_refs(value, outputs)
    lines: list[str] = []
    if artifact_refs:
        artifact_definition = NodeSystemStateDefinition(
            name=f"{_state_definition_name(key, definition)} Artifact References".strip(),
            description="Compact artifact references returned by the capability.",
            type=NodeSystemStateType.JSON,
        )
        lines.extend(format_state_prompt_lines(f"{key}_artifact_refs", artifact_definition))
        lines.append("  value:")
        for ref in artifact_refs:
            lines.append(f"    - {json.dumps(ref, ensure_ascii=False, sort_keys=True)}")

    for output_key, raw_output in outputs.items():
        if not isinstance(raw_output, dict):
            virtual_definition = NodeSystemStateDefinition(
                name=str(output_key),
                type=NodeSystemStateType.JSON if isinstance(raw_output, (dict, list)) else NodeSystemStateType.TEXT,
            )
            output_display, output_truncated, output_original_chars = format_budgeted_prompt_value(
                raw_output,
                max_chars=RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT,
            )
            lines.extend(format_state_prompt_lines(str(output_key), virtual_definition))
            lines.extend(
                format_budgeted_value_lines(
                    output_display,
                    output_truncated=output_truncated,
                    original_chars=output_original_chars,
                    max_chars=RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT,
                )
            )
            continue

        output_type = _coerce_result_package_output_type(raw_output.get("type"))
        virtual_definition = NodeSystemStateDefinition(
            name=str(raw_output.get("name") or output_key),
            description=str(raw_output.get("description") or ""),
            type=output_type,
        )
        output_value = raw_output.get("value")
        lines.extend(format_state_prompt_lines(str(output_key), virtual_definition))
        if _is_file_reference_prompt_state(virtual_definition):
            lines.extend(
                format_file_state_prompt_lines(
                    output_value,
                    allow_text=output_type == NodeSystemStateType.FILE,
                    declared_state_type=output_type,
                    max_text_chars=RESULT_PACKAGE_ARTIFACT_TEXT_CHAR_LIMIT,
                )
            )
        else:
            output_display, output_truncated, output_original_chars = format_budgeted_prompt_value(
                output_value,
                max_chars=RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT,
            )
            lines.extend(
                format_budgeted_value_lines(
                    output_display,
                    output_truncated=output_truncated,
                    original_chars=output_original_chars,
                    max_chars=RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT,
                )
            )
    return lines


def _compact_result_package_status_text(value: dict[str, Any]) -> str:
    parts: list[str] = []
    status = str(value.get("status") or "").strip()
    if status:
        parts.append(f"status={status}")
    error_type = str(value.get("errorType") or "").strip()
    error = str(value.get("error") or "").strip()
    if error_type:
        parts.append(f"error_type={error_type}")
    if error:
        parts.append(f"error={_truncate_prompt_text(error, 500)}")
    return "; ".join(parts)


def format_budgeted_prompt_value(value: Any, *, max_chars: int) -> tuple[str, bool, int]:
    display = format_prompt_value(value)
    original_chars = len(display)
    if original_chars <= max_chars:
        return display, False, original_chars
    return _truncate_prompt_text(display, max_chars), True, original_chars


def format_budgeted_value_lines(
    display: str,
    *,
    output_truncated: bool,
    original_chars: int,
    max_chars: int,
) -> list[str]:
    if not output_truncated:
        return [f"  value: {display}"]
    return [
        f"  value_summary: {display}",
        f"  value_omitted: truncated from {original_chars} chars to {max_chars} chars",
    ]


def collect_result_package_artifact_refs(package: dict[str, Any], outputs: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for key in ("artifact_refs", "artifactRefs"):
        append_compact_artifact_refs(package.get(key), refs)
    for raw_output in outputs.values():
        if not isinstance(raw_output, dict):
            continue
        append_artifact_refs_from_value(raw_output.get("value"), refs)
        if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
            break
    return refs[:RESULT_PACKAGE_MAX_ARTIFACT_REFS]


def append_artifact_refs_from_value(value: Any, refs: list[dict[str, Any]]) -> None:
    if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
        return
    if isinstance(value, dict):
        for key in ("artifact_refs", "artifactRefs"):
            append_compact_artifact_refs(value.get(key), refs)
            if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
                return
        for child in value.values():
            append_artifact_refs_from_value(child, refs)
            if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
                return
    elif isinstance(value, list):
        for item in value:
            append_artifact_refs_from_value(item, refs)
            if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
                return


def append_compact_artifact_refs(value: Any, refs: list[dict[str, Any]]) -> None:
    if not isinstance(value, list):
        return
    for item in value:
        if len(refs) >= RESULT_PACKAGE_MAX_ARTIFACT_REFS:
            return
        if not isinstance(item, dict):
            continue
        compact = {}
        for key in ARTIFACT_REF_KEYS:
            compact_value = _compact_artifact_ref_value(item.get(key))
            if compact_value not in (None, "", [], {}):
                compact[key] = compact_value
        if compact:
            refs.append(compact)


def _compact_artifact_ref_value(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == value and value not in (float("inf"), float("-inf")):
        return int(value) if value.is_integer() else value
    normalized = str(value or "").strip()
    return _truncate_prompt_text(normalized, 240) if normalized else None


def _build_file_context_records(
    *,
    state_key: str,
    value: Any,
    definition: NodeSystemStateDefinition | None,
    output_key: str | None = None,
    output_type: NodeSystemStateType | None = None,
) -> list[dict[str, Any]]:
    declared_type = output_type or (definition.type if definition is not None else None)
    if declared_type not in {
        NodeSystemStateType.FILE,
        NodeSystemStateType.IMAGE,
        NodeSystemStateType.AUDIO,
        NodeSystemStateType.VIDEO,
    }:
        return []

    records: list[dict[str, Any]] = []
    for reference in _collect_file_state_references(value):
        reference_source = reference.get("source", "capability_artifact")
        local_path = str(reference.get("local_path") or "")
        requested_name = str(reference.get("name") or "")
        requested_content_type = str(reference.get("content_type") or "")
        file_name = requested_name or _filename_from_local_path(local_path)
        content_type = requested_content_type or _content_type_for_file_reference(file_name, declared_type)
        char_count = 0
        size_bytes = 0
        readable = True
        text_injected = False
        try:
            if reference_source == "local_input":
                metadata = read_local_input_file_metadata(
                    str(reference.get("root") or ""),
                    str(reference.get("relative_path") or ""),
                )
            else:
                metadata = read_capability_artifact_file_metadata(local_path)
            file_name = requested_name or str(metadata.get("name") or file_name)
            content_type = requested_content_type or str(metadata.get("content_type") or content_type)
            try:
                size_bytes = max(0, int(metadata.get("size") or 0))
            except (TypeError, ValueError):
                size_bytes = 0
            if declared_type == NodeSystemStateType.FILE and _is_text_like_artifact(file_name, content_type):
                if reference_source == "local_input":
                    artifact = read_local_input_text_for_prompt(
                        str(reference.get("root") or ""),
                        str(reference.get("relative_path") or ""),
                    )
                else:
                    artifact = read_capability_artifact_text_for_prompt(local_path)
                char_count = len(str(artifact.get("content") or ""))
                text_injected = True
        except Exception:
            readable = False

        record: dict[str, Any] = {
            "state_key": state_key,
            "source": str(reference_source),
            "name": file_name,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "char_count": char_count,
            "token_estimate": _estimate_tokens(char_count),
            "text_injected": text_injected,
            "readable": readable,
            "role": "memory" if _looks_like_memory_file(file_name, state_key) else "file",
        }
        if output_key:
            record["output_key"] = output_key
        if reference_source == "local_input":
            if reference.get("relative_path"):
                record["relative_path"] = str(reference.get("relative_path") or "")
        elif local_path:
            record["local_path"] = local_path
        records.append(record)
    return records


def _build_result_package_context_records(
    *,
    state_key: str,
    package: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    if not isinstance(package, dict) or package.get("kind") != "result_package":
        return [], [], []
    outputs = package.get("outputs")
    if not isinstance(outputs, dict):
        return [], [], []

    output_records: list[dict[str, Any]] = []
    file_records: list[dict[str, Any]] = []
    knowledge_chunks: list[dict[str, Any]] = []
    for output_key, raw_output in outputs.items():
        output_value = raw_output.get("value") if isinstance(raw_output, dict) else raw_output
        output_type = (
            _coerce_result_package_output_type(raw_output.get("type"))
            if isinstance(raw_output, dict)
            else (NodeSystemStateType.JSON if isinstance(raw_output, (dict, list)) else NodeSystemStateType.TEXT)
        )
        value_chars = _count_value_chars(output_value)
        prompt_limit = (
            RESULT_PACKAGE_ARTIFACT_TEXT_CHAR_LIMIT
            if output_type in {
                NodeSystemStateType.FILE,
                NodeSystemStateType.IMAGE,
                NodeSystemStateType.AUDIO,
                NodeSystemStateType.VIDEO,
            }
            else RESULT_PACKAGE_OUTPUT_PROMPT_CHAR_LIMIT
        )
        output_record = {
            "state_key": state_key,
            "source_type": str(package.get("sourceType") or ""),
            "source_key": str(package.get("sourceKey") or ""),
            "output_key": str(output_key),
            "name": str(raw_output.get("name") or output_key) if isinstance(raw_output, dict) else str(output_key),
            "type": output_type.value,
            "value_chars": value_chars,
            "prompt_chars": min(value_chars, prompt_limit),
            "token_estimate": _estimate_tokens(min(value_chars, prompt_limit)),
            "prompt_char_limit": prompt_limit,
            "prompt_omitted": value_chars > prompt_limit,
        }
        output_records.append(output_record)
        file_records.extend(
            _build_file_context_records(
                state_key=state_key,
                value=output_value,
                definition=None,
                output_key=str(output_key),
                output_type=output_type,
            )
        )
        knowledge_chunks.extend(
            _build_knowledge_chunk_context_records(
                state_key=state_key,
                value=output_value,
                source_kind="result_output",
                source_key=str(output_key),
                enabled=_is_knowledge_output(str(output_key), raw_output),
            )
        )
    return output_records, file_records, knowledge_chunks


def _build_knowledge_chunk_context_records(
    *,
    state_key: str,
    value: Any,
    source_kind: str,
    source_key: str,
    enabled: bool,
) -> list[dict[str, Any]]:
    if not enabled:
        return []
    records: list[dict[str, Any]] = []
    _append_knowledge_chunk_context_records(
        value,
        records,
        state_key=state_key,
        source_kind=source_kind,
        source_key=source_key,
    )
    return records


def _append_knowledge_chunk_context_records(
    value: Any,
    records: list[dict[str, Any]],
    *,
    state_key: str,
    source_kind: str,
    source_key: str,
) -> None:
    if isinstance(value, list):
        for item in value:
            _append_knowledge_chunk_context_records(
                item,
                records,
                state_key=state_key,
                source_kind=source_kind,
                source_key=source_key,
            )
        return
    if not isinstance(value, dict):
        return

    chunk_text = _first_non_empty_string(
        value,
        ("content", "text", "excerpt", "summary"),
    )
    has_chunk_shape = any(key in value for key in ("title", "section", "source", "url", "score", "chunk_id", "chunkId"))
    if chunk_text and has_chunk_shape:
        char_count = len(chunk_text)
        records.append(
            {
                "state_key": state_key,
                "source_kind": source_kind,
                "source_key": source_key,
                "title": str(value.get("title") or ""),
                "section": str(value.get("section") or ""),
                "source": str(value.get("source") or value.get("url") or ""),
                "char_count": char_count,
                "token_estimate": _estimate_tokens(char_count),
            }
        )
        return

    for nested_key in ("results", "chunks", "items", "knowledge_chunks", "knowledgeChunks"):
        nested_value = value.get(nested_key)
        if nested_value is not None:
            _append_knowledge_chunk_context_records(
                nested_value,
                records,
                state_key=state_key,
                source_kind=source_kind,
                source_key=source_key,
            )


def _memory_records_from_file_records(file_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "state_key": str(record.get("state_key") or ""),
            "name": str(record.get("name") or ""),
            "source": str(record.get("source") or ""),
            "char_count": int(record.get("char_count") or 0),
            "token_estimate": int(record.get("token_estimate") or 0),
            **({"output_key": str(record.get("output_key") or "")} if record.get("output_key") else {}),
        }
        for record in file_records
        if record.get("role") == "memory"
    ]


def _count_prompt_chars(lines: list[str]) -> int:
    return len("\n".join(lines))


def _count_value_chars(value: Any) -> int:
    return len(format_prompt_value(value))


def _estimate_tokens(char_count: int) -> int:
    if char_count <= 0:
        return 0
    return max(1, (char_count + 3) // 4)


def _hash_text(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_json(value: Any) -> str:
    return _hash_text(json.dumps(value, ensure_ascii=False, sort_keys=True))


def _optional_positive_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _state_definition_name(state_key: str, definition: NodeSystemStateDefinition | None) -> str:
    if definition is None:
        return state_key
    return definition.name.strip() or state_key


def _state_definition_description(definition: NodeSystemStateDefinition | None) -> str:
    return definition.description.strip() if definition is not None else ""


def _state_definition_type(definition: NodeSystemStateDefinition | None) -> str:
    return definition.type.value if definition is not None else "unknown"


def _classify_context_state(state_key: str, definition: NodeSystemStateDefinition | None) -> str:
    if definition is not None:
        if definition.type == NodeSystemStateType.RESULT_PACKAGE:
            return "result_package"
        if definition.type == NodeSystemStateType.KNOWLEDGE_BASE:
            return "knowledge_base"
        if definition.type in {
            NodeSystemStateType.FILE,
            NodeSystemStateType.IMAGE,
            NodeSystemStateType.AUDIO,
            NodeSystemStateType.VIDEO,
        }:
            return "file"
    if _looks_like_memory_context(state_key, definition):
        return "memory"
    return "state"


def _is_knowledge_context_state(state_key: str, definition: NodeSystemStateDefinition | None) -> bool:
    if definition is not None and definition.type == NodeSystemStateType.KNOWLEDGE_BASE:
        return True
    searchable = " ".join(
        [
            state_key,
            definition.name if definition is not None else "",
            definition.description if definition is not None else "",
        ]
    ).lower()
    return "knowledge" in searchable or "chunk" in searchable


def _is_knowledge_output(output_key: str, raw_output: Any) -> bool:
    if isinstance(raw_output, dict):
        output_type = str(raw_output.get("type") or "").lower()
        searchable = " ".join(
            [
                output_key,
                str(raw_output.get("name") or ""),
                str(raw_output.get("description") or ""),
            ]
        ).lower()
        return output_type == "knowledge_base" or "knowledge" in searchable or "chunk" in searchable
    return "knowledge" in output_key.lower() or "chunk" in output_key.lower()


def _looks_like_memory_context(state_key: str, definition: NodeSystemStateDefinition | None) -> bool:
    searchable = " ".join(
        [
            state_key,
            definition.name if definition is not None else "",
            definition.description if definition is not None else "",
        ]
    ).lower()
    return "memory" in searchable or "memories" in searchable


def _looks_like_memory_file(file_name: str, state_key: str) -> bool:
    normalized = file_name.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return normalized == "memory.md" or "memory" in state_key.lower()


def _truncate_prompt_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[: max(0, max_chars - 1)]}…"


def _coerce_result_package_output_type(value: Any) -> NodeSystemStateType:
    try:
        return NodeSystemStateType(str(value or "json").strip())
    except ValueError:
        return NodeSystemStateType.JSON


def _indent_lines(lines: list[str], spaces: int) -> list[str]:
    prefix = " " * spaces
    return [f"{prefix}{line}" if line else line for line in lines]


def _is_file_reference_prompt_state(definition: NodeSystemStateDefinition | None) -> bool:
    return definition is not None and definition.type in {
        NodeSystemStateType.FILE,
        NodeSystemStateType.IMAGE,
        NodeSystemStateType.AUDIO,
        NodeSystemStateType.VIDEO,
    }


def _is_result_package_prompt_state(definition: NodeSystemStateDefinition | None) -> bool:
    return definition is not None and definition.type == NodeSystemStateType.RESULT_PACKAGE


def _collect_file_state_references(value: Any) -> list[dict[str, str]]:
    references: list[dict[str, str]] = []
    _append_file_state_references(value, references)
    return references


def _append_file_state_references(value: Any, references: list[dict[str, str]]) -> None:
    envelope = normalize_uploaded_file_envelope(value)
    if envelope is not None:
        _append_file_record(envelope, references)
        return
    if isinstance(value, str):
        parsed = _parse_file_state_json(value)
        if parsed is not None:
            _append_file_state_references(parsed, references)
            return
        trimmed = value.strip()
        if trimmed:
            references.append({"local_path": trimmed})
        return
    if isinstance(value, dict):
        if value.get("kind") == "local_folder":
            _append_local_folder_references(value, references)
            return
        _append_file_record(value, references)
        return
    if isinstance(value, list):
        for item in value:
            _append_file_state_references(item, references)


def _append_file_record(record: dict[str, Any], references: list[dict[str, str]]) -> None:
    local_path = _first_non_empty_string(record, ("local_path", "localPath", "path"))
    if not local_path:
        return
    name = _first_non_empty_string(record, ("filename", "name"))
    reference = {"local_path": local_path}
    if name:
        reference["name"] = name
    content_type = _first_non_empty_string(record, ("content_type", "contentType", "mimeType"))
    if content_type:
        reference["content_type"] = content_type
    references.append(reference)


def _append_local_folder_references(record: dict[str, Any], references: list[dict[str, str]]) -> None:
    root = _first_non_empty_string(record, ("root", "path"))
    selected = record.get("selected")
    if not root or not isinstance(selected, list):
        return
    for item in selected:
        if not isinstance(item, str) or not item.strip():
            continue
        relative_path = item.strip().replace("\\", "/")
        references.append(
            {
                "source": "local_input",
                "root": root,
                "relative_path": relative_path,
                "local_path": f"{root.rstrip('/')}/{relative_path}",
                "name": relative_path,
            }
        )


def _parse_file_state_json(value: str) -> Any | None:
    trimmed = value.strip()
    if not trimmed.startswith(("{", "[")):
        return None
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        return None


def _first_non_empty_string(record: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _filename_from_local_path(local_path: str) -> str:
    return str(local_path).replace("\\", "/").rstrip("/").rsplit("/", 1)[-1] or "document"


def _content_type_for_file_reference(file_name: str, declared_state_type: NodeSystemStateType | None) -> str:
    if declared_state_type == NodeSystemStateType.IMAGE:
        return _mime_type_from_file_name(file_name, default="image/png", media_prefix="image/")
    if declared_state_type == NodeSystemStateType.AUDIO:
        return _mime_type_from_file_name(file_name, default="audio/mpeg", media_prefix="audio/")
    if declared_state_type == NodeSystemStateType.VIDEO:
        return _mime_type_from_file_name(file_name, default="video/mp4", media_prefix="video/")
    return _mime_type_from_file_name(file_name, default="application/octet-stream")


def _mime_type_from_file_name(file_name: str, *, default: str, media_prefix: str = "") -> str:
    import mimetypes

    guessed = mimetypes.guess_type(file_name)[0] or ""
    if guessed and (not media_prefix or guessed.startswith(media_prefix)):
        return guessed
    return default


def example_output_value_for_state(definition: NodeSystemStateDefinition | None) -> Any:
    if definition is None:
        return "在此填写完整内容"
    if definition.type == NodeSystemStateType.JSON:
        return {}
    if definition.type == NodeSystemStateType.CAPABILITY:
        return {"kind": "none"}
    if definition.type == NodeSystemStateType.RESULT_PACKAGE:
        return {}
    if definition.type == NodeSystemStateType.NUMBER:
        return 0
    if definition.type == NodeSystemStateType.BOOLEAN:
        return False
    return "在此填写完整内容"


def format_state_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    *,
    value: str | None = None,
    include_output_contract: bool = False,
) -> list[str]:
    if definition is None and value is not None:
        return [f"- {key}: {value}"]

    lines = [f"- key: {key}"]
    if definition is not None:
        name = definition.name.strip()
        if name and name != key:
            lines.append(f"  name: {name}")
        lines.append(f"  type: {definition.type.value}")
        description = definition.description.strip()
        if description:
            lines.append(f"  description: {description}")
        if include_output_contract:
            lines.extend(format_state_output_contract_lines(definition.type))
    if value is not None:
        lines.append(f"  value: {value}")
    return lines


def format_state_output_contract_lines(state_type: NodeSystemStateType) -> list[str]:
    if state_type == NodeSystemStateType.MARKDOWN:
        return [
            "  output_format: markdown string inside the JSON value",
            "  output_rule: 这个字段的值必须是 Markdown 内容字符串；不要把整个 JSON 包进 Markdown 代码块。",
        ]
    if state_type == NodeSystemStateType.HTML:
        return [
            "  output_format: HTML document string inside the JSON value",
            "  output_rule: 这个字段的值必须是可渲染 HTML 内容字符串；不要把整个 JSON 包进 HTML 或 Markdown 代码块。",
        ]
    if state_type == NodeSystemStateType.JSON:
        return [
            "  output_format: JSON value inside the JSON value",
            "  output_rule: 这个字段的值必须是合法 JSON 值；不要把对象或数组再序列化成字符串。",
        ]
    if state_type == NodeSystemStateType.CAPABILITY:
        return [
            "  output_format: capability JSON object",
            "  output_rule: 这个字段只能是单个能力对象；kind 必须是 action、subgraph 或 none；不要返回数组。",
        ]
    if state_type == NodeSystemStateType.RESULT_PACKAGE:
        return [
            "  output_format: result_package JSON object",
            "  output_rule: 这个字段只能由动态能力运行时写入；不要在普通 LLM 输出中手写或改写包壳。",
        ]
    if state_type in {
        NodeSystemStateType.FILE,
        NodeSystemStateType.IMAGE,
        NodeSystemStateType.AUDIO,
        NodeSystemStateType.VIDEO,
    }:
        return [
            "  output_format: local artifact path string or JSON array of local artifact path strings",
            "  output_rule: 只能使用输入或Action 结果中已经存在的本地文件路径；不要编造路径。",
        ]
    if state_type == NodeSystemStateType.NUMBER:
        return ["  output_format: JSON number"]
    if state_type == NodeSystemStateType.BOOLEAN:
        return ["  output_format: JSON boolean"]
    return ["  output_format: JSON string"]


def _is_text_like_artifact(file_name: str, content_type: str) -> bool:
    normalized_type = content_type.lower().strip()
    if normalized_type.startswith("text/"):
        return True
    if normalized_type in {
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/x-ndjson",
    }:
        return True
    if normalized_type.endswith("+json") or normalized_type.endswith("+xml"):
        return True
    return file_name.lower().endswith(
        (
            ".txt",
            ".md",
            ".markdown",
            ".csv",
            ".tsv",
            ".json",
            ".jsonl",
            ".yaml",
            ".yml",
            ".xml",
            ".html",
            ".htm",
            ".css",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".py",
            ".java",
            ".c",
            ".cc",
            ".cpp",
            ".h",
            ".hpp",
            ".cs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".sh",
            ".bash",
            ".zsh",
            ".fish",
            ".bat",
            ".cmd",
            ".ps1",
            ".sql",
            ".log",
            ".ini",
            ".toml",
            ".env",
            ".gitignore",
        )
    )
