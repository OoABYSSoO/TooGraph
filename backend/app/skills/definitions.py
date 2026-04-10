from __future__ import annotations

from pathlib import Path

import yaml

from app.core.schemas.skills import (
    SkillCatalogStatus,
    SkillCompatibilityReport,
    SkillCompatibilityStatus,
    SkillCompatibilityTarget,
    SkillDefinition,
    SkillIoField,
    SkillSideEffect,
    SkillSourceFormat,
)
from app.core.storage.skill_store import get_skill_status_map
from app.skills.registry import get_skill_registry


ROOT_DIR = Path(__file__).resolve().parents[3]
CLAUDE_AGENTS_DIR = ROOT_DIR / ".claude" / "agents"


def list_skill_definitions(*, include_disabled: bool = False) -> list[SkillDefinition]:
    registry_keys = set(get_skill_registry(include_disabled=include_disabled).keys())
    status_map = get_skill_status_map()
    definitions: list[SkillDefinition] = []
    for definition in _load_claude_code_skill_definitions():
        status = status_map.get(definition.skill_key, SkillCatalogStatus.ACTIVE)
        if status == SkillCatalogStatus.DELETED:
            continue
        if status == SkillCatalogStatus.DISABLED and not include_disabled:
            continue
        runtime_registered = definition.skill_key in registry_keys
        definitions.append(
            definition.model_copy(
                deep=True,
                update={
                    "source_format": SkillSourceFormat.CLAUDE_CODE,
                    "runtime_registered": runtime_registered,
                    "status": status,
                    "compatibility": _build_compatibility_reports(definition),
                },
            )
        )
    return definitions


def get_skill_definition_registry(*, include_disabled: bool = False) -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition for definition in list_skill_definitions(include_disabled=include_disabled)}


def _load_claude_code_skill_definitions() -> list[SkillDefinition]:
    if not CLAUDE_AGENTS_DIR.exists():
        return []
    definitions: list[SkillDefinition] = []
    for path in sorted(CLAUDE_AGENTS_DIR.glob("*.md")):
        definitions.append(_parse_claude_code_skill_file(path))
    return definitions


def _parse_claude_code_skill_file(path: Path) -> SkillDefinition:
    raw = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw, path)
    payload = yaml.safe_load(frontmatter) or {}
    graphite = payload.get("graphite") or {}

    skill_key = str(graphite.get("skill_key") or path.stem)
    label = str(payload.get("name") or graphite.get("label") or skill_key)
    description = str(payload.get("description") or "").strip()

    input_schema = [
        SkillIoField(
            key=str(field["key"]),
            label=str(field.get("label") or field["key"]),
            valueType=str(field.get("valueType") or field.get("value_type") or "text"),
            required=bool(field.get("required", False)),
            description=str(field.get("description") or ""),
        )
        for field in graphite.get("input_schema", [])
    ]
    output_schema = [
        SkillIoField(
            key=str(field["key"]),
            label=str(field.get("label") or field["key"]),
            valueType=str(field.get("valueType") or field.get("value_type") or "text"),
            required=bool(field.get("required", False)),
            description=str(field.get("description") or ""),
        )
        for field in graphite.get("output_schema", [])
    ]
    side_effects = [
        SkillSideEffect(str(item))
        for item in graphite.get("side_effects", [])
    ]

    return SkillDefinition(
        skillKey=skill_key,
        label=label,
        description=description or body.splitlines()[0].strip() if body.strip() else "",
        inputSchema=input_schema,
        outputSchema=output_schema,
        supportedValueTypes=[str(item) for item in graphite.get("supported_value_types", [])],
        sideEffects=side_effects,
    )


def _split_frontmatter(raw: str, path: Path) -> tuple[str, str]:
    if not raw.startswith("---\n"):
        raise ValueError(f"Claude skill file '{path}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Claude skill file '{path}' must close YAML frontmatter with '---'.")
    frontmatter, body = rest.split(marker, 1)
    return frontmatter, body.strip()


def _build_compatibility_reports(definition: SkillDefinition) -> list[SkillCompatibilityReport]:
    shared_missing_capabilities = ["缺少标准 JSON Schema 输入定义"]
    if definition.output_schema:
        shared_missing_capabilities.append("缺少标准化输出 schema 导出")
    return [
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.CLAUDE_CODE,
            status=SkillCompatibilityStatus.NATIVE,
            summary="当前 skill 已经以 Claude Code 风格 Markdown 文件作为定义源。",
            missingCapabilities=[],
        ),
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.OPENCLAW,
            status=SkillCompatibilityStatus.PARTIAL,
            summary="当前 skill 已采用 Claude Code 风格 Markdown 定义，和 OpenClaw 的 SKILL.md 结构非常接近，但还不是 OpenClaw 目录格式。",
            missingCapabilities=[
                *shared_missing_capabilities,
                "缺少 OpenClaw 的技能目录包装",
                "缺少目录内 `SKILL.md` 主文件布局",
            ],
        ),
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.CODEX,
            status=SkillCompatibilityStatus.PARTIAL,
            summary="当前 skill 已切到 Claude Code 原生格式，但还没有 Codex 原生 SKILL.md 包装。",
            missingCapabilities=[
                *shared_missing_capabilities,
                "缺少 Codex 原生 SKILL.md 包装与目录约定",
            ],
        ),
    ]
