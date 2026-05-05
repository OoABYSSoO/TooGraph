from __future__ import annotations

import json
from typing import Any

from app.core.runtime.agent_multimodal import normalize_uploaded_file_envelope
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.storage.skill_artifact_store import read_skill_artifact_text_for_prompt


def build_effective_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    return build_auto_system_prompt(output_keys, input_values, skill_context, state_schema=state_schema)


def build_auto_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "你是一个工作流处理节点。根据输入和技能结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]

    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            definition = resolved_state_schema.get(key)
            if definition is not None and not definition.prompt_visible:
                continue
            if _is_file_prompt_state(definition):
                parts.extend(format_state_prompt_lines(key, definition))
                parts.extend(format_file_state_prompt_lines(value))
                continue
            display = format_prompt_value(value)
            parts.extend(format_state_prompt_lines(key, definition, value=display))

    if skill_context:
        parts.append("\n== Skill Results ==")
        parts.append("涉及事实、日期、天气、新闻或外部资料时，必须以技能结果为依据；不要编造技能结果中不存在的事实。")
        parts.append("如果技能结果没有提供足够证据，明确说明未检索到可靠答案。")
        parts.append("引用链接必须完整复制 URL；不要用省略号、截断链接或泛称代替标题和链接。")
        for skill_key, result in skill_context.items():
            parts.append(f"[{skill_key}]")
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


def format_file_state_prompt_lines(value: Any) -> list[str]:
    references = _collect_file_state_references(value)
    if not references:
        return ["  value: "]

    lines: list[str] = []
    for index, reference in enumerate(references):
        if index > 0:
            lines.append("")
        local_path = reference["local_path"]
        requested_name = reference.get("name", "")
        try:
            artifact = read_skill_artifact_text_for_prompt(local_path)
            file_name = requested_name or str(artifact.get("name") or _filename_from_local_path(local_path))
            content = str(artifact.get("content") or "")
        except Exception:
            file_name = requested_name or _filename_from_local_path(local_path)
            content = "[文件读取失败：文件不存在或无法读取。]"
        lines.append(f"  文件名：{file_name}")
        lines.append("  原文：")
        lines.append(content)
    return lines


def _is_file_prompt_state(definition: NodeSystemStateDefinition | None) -> bool:
    return definition is not None and definition.type in {NodeSystemStateType.FILE, NodeSystemStateType.FILE_LIST}


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
    references.append(reference)


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


def example_output_value_for_state(definition: NodeSystemStateDefinition | None) -> Any:
    if definition is None:
        return "在此填写完整内容"
    if definition.type in {NodeSystemStateType.JSON, NodeSystemStateType.OBJECT}:
        return {}
    if definition.type in {NodeSystemStateType.ARRAY, NodeSystemStateType.FILE_LIST, NodeSystemStateType.SKILL}:
        return []
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
    if state_type in {NodeSystemStateType.JSON, NodeSystemStateType.OBJECT}:
        return [
            "  output_format: JSON object inside the JSON value",
            "  output_rule: 这个字段的值必须是对象；不要把对象再序列化成字符串。",
        ]
    if state_type in {NodeSystemStateType.ARRAY, NodeSystemStateType.FILE_LIST, NodeSystemStateType.SKILL}:
        return [
            "  output_format: JSON array inside the JSON value",
            "  output_rule: 这个字段的值必须是数组；不要把数组再序列化成字符串。",
        ]
    if state_type == NodeSystemStateType.NUMBER:
        return ["  output_format: JSON number"]
    if state_type == NodeSystemStateType.BOOLEAN:
        return ["  output_format: JSON boolean"]
    return ["  output_format: JSON string"]
