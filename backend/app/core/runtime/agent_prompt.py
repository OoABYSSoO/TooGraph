from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType


def build_effective_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    now: datetime | None = None,
) -> str:
    return build_auto_system_prompt(output_keys, input_values, skill_context, state_schema=state_schema, now=now)


def build_auto_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    now: datetime | None = None,
) -> str:
    resolved_state_schema = state_schema or {}
    parts = [
        "你是一个工作流处理节点。根据输入和技能结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]
    parts.extend(format_runtime_context_lines(now))

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


def format_runtime_context_lines(now: datetime | None = None) -> list[str]:
    current_time = now.astimezone() if now is not None else datetime.now().astimezone()
    timezone_name = format_timezone_label(current_time)
    return [
        "\n== Runtime Context ==",
        f"- current_datetime: {current_time.isoformat(timespec='seconds')}",
        f"- current_date: {current_time.date().isoformat()}",
        f"- current_year: {current_time.year}",
        f"- current_weekday: {current_time.strftime('%A')}",
        f"- timezone: {timezone_name}",
        "- freshness_rule: 把 current_date 作为“今天、最新、当前、最近、发布日期、价格、新闻、版本”等问题的时间锚点；涉及时效性事实时，优先使用搜索或外部证据，不要只凭模型记忆回答。",
    ]


def format_timezone_label(current_time: datetime) -> str:
    timezone_name = resolve_local_timezone_name()
    offset = format_timezone_offset(current_time)
    if timezone_name and offset:
        return f"{timezone_name} ({offset})"
    return timezone_name or offset or current_time.tzname() or str(current_time.tzinfo or "")


def format_timezone_offset(current_time: datetime) -> str:
    offset = current_time.strftime("%z")
    if len(offset) == 5:
        return f"{offset[:3]}:{offset[3:]}"
    return offset


@lru_cache(maxsize=1)
def resolve_local_timezone_name() -> str:
    tz_env = os.getenv("TZ", "").strip()
    if tz_env:
        return tz_env

    try:
        timezone_file = Path("/etc/timezone")
        if timezone_file.exists():
            timezone_name = timezone_file.read_text(encoding="utf-8").strip()
            if timezone_name:
                return timezone_name
    except (OSError, UnicodeDecodeError):
        pass

    try:
        localtime_target = os.path.realpath("/etc/localtime")
    except OSError:
        localtime_target = ""

    marker = "/zoneinfo/"
    if marker in localtime_target:
        return localtime_target.split(marker, 1)[1]

    return ""


def format_prompt_value(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return "" if value is None else str(value)


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
