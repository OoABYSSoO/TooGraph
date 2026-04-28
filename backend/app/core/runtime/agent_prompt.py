from __future__ import annotations

import json
from typing import Any

from app.core.runtime.agent_multimodal import normalize_uploaded_file_envelope
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.storage.local_input_sources import read_local_input_file_metadata, read_local_input_text_for_prompt
from app.core.storage.skill_artifact_store import read_skill_artifact_file_metadata, read_skill_artifact_text_for_prompt


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
            parts.extend(format_graph_state_input_prompt_lines(key, definition, value))

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


def format_graph_state_input_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: Any,
) -> list[str]:
    if _is_result_package_prompt_state(definition):
        return format_result_package_prompt_lines(key, definition, value)
    if _is_file_reference_prompt_state(definition):
        lines = format_state_prompt_lines(key, definition)
        lines.extend(
            format_file_state_prompt_lines(
                value,
                allow_text=definition.type == NodeSystemStateType.FILE,
                declared_state_type=definition.type,
            )
        )
        return lines
    return format_state_prompt_lines(key, definition, value=format_prompt_value(value))


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
) -> list[str]:
    references = _collect_file_state_references(value)
    if not references:
        return ["  value: "]

    lines: list[str] = []
    for index, reference in enumerate(references):
        if index > 0:
            lines.append("")
        reference_source = reference.get("source", "skill_artifact")
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
                metadata = read_skill_artifact_file_metadata(local_path)
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
                artifact = read_skill_artifact_text_for_prompt(local_path)
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
        lines.append("  原文：")
        lines.append(content)
    return lines


def format_result_package_prompt_lines(
    key: str,
    definition: NodeSystemStateDefinition | None,
    value: Any,
) -> list[str]:
    lines = format_state_prompt_lines(key, definition)
    if not isinstance(value, dict) or value.get("kind") != "result_package":
        lines.append(f"  value: {format_prompt_value(value)}")
        return lines

    for package_key in ("sourceType", "sourceKey", "sourceName", "status", "error", "errorType"):
        package_value = value.get(package_key)
        if package_value not in (None, "", [], {}):
            lines.append(f"  {package_key}: {format_prompt_value(package_value)}")
    if value.get("inputs") not in (None, "", [], {}):
        lines.append(f"  inputs: {format_prompt_value(value.get('inputs'))}")

    outputs = value.get("outputs")
    if not isinstance(outputs, dict) or not outputs:
        return lines

    lines.append("  outputs:")
    for output_key, raw_output in outputs.items():
        if not isinstance(raw_output, dict):
            virtual_definition = NodeSystemStateDefinition(
                name=str(output_key),
                type=NodeSystemStateType.JSON if isinstance(raw_output, (dict, list)) else NodeSystemStateType.TEXT,
            )
            lines.extend(_indent_lines(format_state_prompt_lines(str(output_key), virtual_definition, value=format_prompt_value(raw_output)), 4))
            continue

        output_type = _coerce_result_package_output_type(raw_output.get("type"))
        virtual_definition = NodeSystemStateDefinition(
            name=str(raw_output.get("name") or output_key),
            description=str(raw_output.get("description") or ""),
            type=output_type,
        )
        output_value = raw_output.get("value")
        lines.extend(_indent_lines(format_state_prompt_lines(str(output_key), virtual_definition), 4))
        if _is_file_reference_prompt_state(virtual_definition):
            lines.extend(
                _indent_lines(
                    format_file_state_prompt_lines(
                        output_value,
                        allow_text=output_type == NodeSystemStateType.FILE,
                        declared_state_type=output_type,
                    ),
                    4,
                )
            )
        else:
            lines.extend(_indent_lines([f"  value: {format_prompt_value(output_value)}"], 4))
    return lines


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
            "  output_rule: 这个字段只能是单个能力对象；kind 必须是 skill、subgraph 或 none；不要返回数组。",
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
            "  output_rule: 只能使用输入或技能结果中已经存在的本地文件路径；不要编造路径。",
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
