from __future__ import annotations

from dataclasses import dataclass
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
    SkillSourceScope,
)
from app.core.storage.skill_store import GRAPHITE_SKILLS_DIR, get_skill_status_map, list_managed_skill_keys
from app.skills.registry import get_skill_registry


ROOT_DIR = Path(__file__).resolve().parents[3]
CLAUDE_EXTERNAL_DIR = ROOT_DIR / ".claude" / "agents"
OPENCLAW_EXTERNAL_DIR = ROOT_DIR / ".openclaw" / "workspace" / "skills"
CODEX_EXTERNAL_DIR = ROOT_DIR / ".codex" / "skills"


@dataclass
class SkillDefinitionRecord:
    definition: SkillDefinition
    source_format: SkillSourceFormat
    source_scope: SkillSourceScope
    source_path: str


def list_skill_definitions(*, include_disabled: bool = False) -> list[SkillDefinition]:
    catalog = list_skill_catalog(include_disabled=include_disabled)
    return [item for item in catalog if item.source_scope == SkillSourceScope.GRAPHITE_MANAGED]


def list_skill_catalog(*, include_disabled: bool = True) -> list[SkillDefinition]:
    registry_keys = set(get_skill_registry(include_disabled=include_disabled).keys())
    status_map = get_skill_status_map()
    managed_records = {record.definition.skill_key: record for record in _load_managed_skill_records()}
    external_records = {record.definition.skill_key: record for record in _load_external_skill_records()}
    skill_keys = sorted(set(managed_records) | set(external_records))

    catalog: list[SkillDefinition] = []
    for skill_key in skill_keys:
        record = managed_records.get(skill_key) or external_records.get(skill_key)
        if record is None:
            continue
        status = status_map.get(skill_key, SkillCatalogStatus.ACTIVE)
        if record.source_scope == SkillSourceScope.GRAPHITE_MANAGED:
            if status == SkillCatalogStatus.DELETED:
                record = external_records.get(skill_key)
                if record is None:
                    continue
                status = SkillCatalogStatus.ACTIVE
            elif status == SkillCatalogStatus.DISABLED and not include_disabled:
                continue
        runtime_registered = (
            skill_key in registry_keys and record.source_scope == SkillSourceScope.GRAPHITE_MANAGED and status == SkillCatalogStatus.ACTIVE
        )
        catalog.append(
            record.definition.model_copy(
                deep=True,
                update={
                    "source_format": record.source_format,
                    "source_scope": record.source_scope,
                    "source_path": record.source_path,
                    "runtime_registered": runtime_registered,
                    "status": status if record.source_scope == SkillSourceScope.GRAPHITE_MANAGED else SkillCatalogStatus.ACTIVE,
                    "can_manage": record.source_scope == SkillSourceScope.GRAPHITE_MANAGED,
                    "can_import": record.source_scope == SkillSourceScope.EXTERNAL,
                    "compatibility": _build_compatibility_reports(record.source_format, record.source_scope, record.definition),
                },
            )
        )
    return catalog


def get_skill_definition_registry(*, include_disabled: bool = False) -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition for definition in list_skill_definitions(include_disabled=include_disabled)}


def get_skill_catalog_registry(*, include_disabled: bool = True) -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition for definition in list_skill_catalog(include_disabled=include_disabled)}


def get_external_skill_catalog_registry() -> dict[str, SkillDefinition]:
    return {
        definition.skill_key: definition
        for definition in list_skill_catalog(include_disabled=True)
        if definition.source_scope == SkillSourceScope.EXTERNAL
    }


def _load_managed_skill_records() -> list[SkillDefinitionRecord]:
    records: list[SkillDefinitionRecord] = []
    for path in sorted((GRAPHITE_SKILLS_DIR / "claude_code").glob("*.md")):
        records.append(_parse_skill_file(path, SkillSourceFormat.CLAUDE_CODE, SkillSourceScope.GRAPHITE_MANAGED))
    for root, format_name in [
        (GRAPHITE_SKILLS_DIR / "openclaw", SkillSourceFormat.OPENCLAW),
        (GRAPHITE_SKILLS_DIR / "codex", SkillSourceFormat.CODEX),
        (GRAPHITE_SKILLS_DIR / "graphite", SkillSourceFormat.GRAPHITE),
    ]:
        if not root.exists():
            continue
        for path in sorted(root.glob("*/SKILL.md")):
            records.append(_parse_skill_file(path, format_name, SkillSourceScope.GRAPHITE_MANAGED))
    return records


def _load_external_skill_records() -> list[SkillDefinitionRecord]:
    records: list[SkillDefinitionRecord] = []
    managed_keys = list_managed_skill_keys()
    if CLAUDE_EXTERNAL_DIR.exists():
        for path in sorted(CLAUDE_EXTERNAL_DIR.glob("*.md")):
            record = _parse_skill_file(path, SkillSourceFormat.CLAUDE_CODE, SkillSourceScope.EXTERNAL)
            if record.definition.skill_key not in managed_keys:
                records.append(record)
    if OPENCLAW_EXTERNAL_DIR.exists():
        for path in sorted(OPENCLAW_EXTERNAL_DIR.glob("*/SKILL.md")):
            record = _parse_skill_file(path, SkillSourceFormat.OPENCLAW, SkillSourceScope.EXTERNAL)
            if record.definition.skill_key not in managed_keys:
                records.append(record)
    if CODEX_EXTERNAL_DIR.exists():
        for path in sorted(CODEX_EXTERNAL_DIR.glob("*/SKILL.md")):
            record = _parse_skill_file(path, SkillSourceFormat.CODEX, SkillSourceScope.EXTERNAL)
            if record.definition.skill_key not in managed_keys:
                records.append(record)
    return records


def _parse_skill_file(path: Path, source_format: SkillSourceFormat, source_scope: SkillSourceScope) -> SkillDefinitionRecord:
    raw = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw, path)
    payload = yaml.safe_load(frontmatter) or {}
    graphite = payload.get("graphite") or {}

    skill_key = str(graphite.get("skill_key") or payload.get("name") or path.stem)
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
    side_effects = [SkillSideEffect(str(item)) for item in graphite.get("side_effects", [])]

    definition = SkillDefinition(
        skillKey=skill_key,
        label=label,
        description=description or body.splitlines()[0].strip() if body.strip() else "",
        inputSchema=input_schema,
        outputSchema=output_schema,
        supportedValueTypes=[str(item) for item in graphite.get("supported_value_types", [])],
        sideEffects=side_effects,
    )
    return SkillDefinitionRecord(
        definition=definition,
        source_format=source_format,
        source_scope=source_scope,
        source_path=str(path),
    )


def _split_frontmatter(raw: str, path: Path) -> tuple[str, str]:
    if not raw.startswith("---\n"):
        raise ValueError(f"Skill file '{path}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Skill file '{path}' must close YAML frontmatter with '---'.")
    frontmatter, body = rest.split(marker, 1)
    return frontmatter, body.strip()


def _build_compatibility_reports(
    source_format: SkillSourceFormat,
    source_scope: SkillSourceScope,
    definition: SkillDefinition,
) -> list[SkillCompatibilityReport]:
    shared_missing_capabilities = ["缺少标准 JSON Schema 输入定义"]
    if definition.output_schema:
        shared_missing_capabilities.append("缺少标准化输出 schema 导出")

    claude_status = SkillCompatibilityStatus.NATIVE if source_format == SkillSourceFormat.CLAUDE_CODE else SkillCompatibilityStatus.PARTIAL
    claude_summary = (
        "当前 skill 以 Claude Code 风格文件存在。"
        if source_format == SkillSourceFormat.CLAUDE_CODE
        else "当前 skill 不是 Claude Code 原生文件，但可以映射。"
    )
    openclaw_status = SkillCompatibilityStatus.NATIVE if source_format == SkillSourceFormat.OPENCLAW else SkillCompatibilityStatus.PARTIAL
    openclaw_summary = (
        "当前 skill 已是 OpenClaw 原生目录格式。"
        if source_format == SkillSourceFormat.OPENCLAW
        else "当前 skill 还不是 OpenClaw 的 SKILL.md 目录格式。"
    )
    codex_status = SkillCompatibilityStatus.NATIVE if source_format == SkillSourceFormat.CODEX else SkillCompatibilityStatus.PARTIAL
    codex_summary = (
        "当前 skill 已是 Codex 原生 SKILL.md 目录格式。"
        if source_format == SkillSourceFormat.CODEX
        else "当前 skill 还没有 Codex 原生 SKILL.md 包装。"
    )

    return [
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.CLAUDE_CODE,
            status=claude_status,
            summary=claude_summary if source_scope == SkillSourceScope.GRAPHITE_MANAGED else f"{claude_summary} 当前仅作为外部源被发现，需先导入 GraphiteUI。",
            missingCapabilities=[] if claude_status == SkillCompatibilityStatus.NATIVE else [*shared_missing_capabilities],
        ),
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.OPENCLAW,
            status=openclaw_status,
            summary=openclaw_summary if source_scope == SkillSourceScope.GRAPHITE_MANAGED else f"{openclaw_summary} 当前仅作为外部源被发现，需先导入 GraphiteUI。",
            missingCapabilities=[] if openclaw_status == SkillCompatibilityStatus.NATIVE else [*shared_missing_capabilities, "缺少 OpenClaw 的技能目录包装", "缺少目录内 `SKILL.md` 主文件布局"],
        ),
        SkillCompatibilityReport(
            target=SkillCompatibilityTarget.CODEX,
            status=codex_status,
            summary=codex_summary if source_scope == SkillSourceScope.GRAPHITE_MANAGED else f"{codex_summary} 当前仅作为外部源被发现，需先导入 GraphiteUI。",
            missingCapabilities=[] if codex_status == SkillCompatibilityStatus.NATIVE else [*shared_missing_capabilities, "缺少 Codex 原生 SKILL.md 包装与目录约定"],
        ),
    ]
