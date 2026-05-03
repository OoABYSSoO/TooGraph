from __future__ import annotations

import json
from typing import Any

from app.core.runtime.agent_multimodal import normalize_uploaded_file_envelope, summarize_data_url
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType


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
            display = format_prompt_value(value)
            parts.extend(format_state_prompt_lines(key, resolved_state_schema.get(key), value=display))

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
        return {
            str(key): summarize_data_url(raw_value)
            if str(key) == "content" and isinstance(raw_value, str) and raw_value.startswith("data:")
            else sanitize_prompt_value(raw_value)
            for key, raw_value in envelope.items()
        }
    if isinstance(value, dict):
        return {
            str(key): summarize_data_url(raw_value)
            if isinstance(raw_value, str) and raw_value.startswith("data:")
            else sanitize_prompt_value(raw_value)
            for key, raw_value in value.items()
        }
    if isinstance(value, list):
        return [sanitize_prompt_value(item) for item in value]
    if isinstance(value, str) and value.startswith("data:"):
        return summarize_data_url(value)
    return value


def example_output_value_for_state(definition: NodeSystemStateDefinition | None) -> Any:
    if definition is None:
        return "在此填写完整内容"
    if definition.type in {NodeSystemStateType.JSON, NodeSystemStateType.OBJECT}:
        return {}
    if definition.type in {NodeSystemStateType.ARRAY, NodeSystemStateType.FILE_LIST}:
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
    if state_type in {NodeSystemStateType.ARRAY, NodeSystemStateType.FILE_LIST}:
        return [
            "  output_format: JSON array inside the JSON value",
            "  output_rule: 这个字段的值必须是数组；不要把数组再序列化成字符串。",
        ]
    if state_type == NodeSystemStateType.NUMBER:
        return ["  output_format: JSON number"]
    if state_type == NodeSystemStateType.BOOLEAN:
        return ["  output_format: JSON boolean"]
    return ["  output_format: JSON string"]
