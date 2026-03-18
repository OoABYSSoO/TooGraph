from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import json
from pathlib import Path
from typing import TypeVar

import yaml

from app.core.schemas.skills import (
    SkillAgentNodeEligibility,
    SkillCatalogStatus,
    SkillDefinition,
    SkillHealthSpec,
    SkillIoField,
    SkillKind,
    SkillMode,
    SkillRuntimeSpec,
    SkillScope,
    SkillSideEffect,
    SkillSourceFormat,
    SkillSourceScope,
    SkillTarget,
)
from app.core.storage.skill_store import GRAPHITE_SKILLS_DIR, get_skill_status_map
from app.skills.registry import get_skill_registry, list_runtime_skill_keys


EnumValue = TypeVar("EnumValue", bound=Enum)


@dataclass
class SkillDefinitionRecord:
    definition: SkillDefinition
    source_format: SkillSourceFormat
    source_scope: SkillSourceScope
    source_path: str


def list_skill_definitions(*, include_disabled: bool = False) -> list[SkillDefinition]:
    catalog = list_skill_catalog(include_disabled=include_disabled)
    return [item for item in catalog if is_agent_attachable_skill(item)]


def is_agent_attachable_skill(definition: SkillDefinition) -> bool:
    return (
        definition.status == SkillCatalogStatus.ACTIVE
        and definition.agent_node_eligibility == SkillAgentNodeEligibility.READY
        and definition.runtime_ready
        and definition.runtime_registered
        and SkillTarget.AGENT_NODE in definition.targets
        and definition.configured
        and definition.healthy
    )


def list_skill_catalog(*, include_disabled: bool = True) -> list[SkillDefinition]:
    registry_keys = set(get_skill_registry(include_disabled=include_disabled).keys())
    runtime_supported_keys = list_runtime_skill_keys()
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
            _definition_runtime_entrypoint(record.definition) in registry_keys
            and record.source_scope == SkillSourceScope.GRAPHITE_MANAGED
            and status == SkillCatalogStatus.ACTIVE
        )
        runtime_ready = _definition_runtime_entrypoint(record.definition) in runtime_supported_keys
        catalog.append(
            record.definition.model_copy(
                deep=True,
                update={
                    "source_format": record.source_format,
                    "source_scope": record.source_scope,
                    "source_path": record.source_path,
                    "runtime_ready": runtime_ready,
                    "runtime_registered": runtime_registered,
                    "status": status if record.source_scope == SkillSourceScope.GRAPHITE_MANAGED else SkillCatalogStatus.ACTIVE,
                    "can_manage": record.source_scope == SkillSourceScope.GRAPHITE_MANAGED,
                    "can_import": record.source_scope == SkillSourceScope.EXTERNAL and skill_key in runtime_supported_keys,
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
    for path in sorted((GRAPHITE_SKILLS_DIR / "claude_code").glob("*/SKILL.md")):
        records.append(_parse_skill_file(path, SkillSourceFormat.CLAUDE_CODE, SkillSourceScope.GRAPHITE_MANAGED))
    for path in sorted((GRAPHITE_SKILLS_DIR / "graphite").glob("*/skill.json")):
        records.append(_parse_native_skill_manifest(path, SkillSourceScope.GRAPHITE_MANAGED))
    return records


def _load_external_skill_records() -> list[SkillDefinitionRecord]:
    # Native GraphiteUI Skills are imported explicitly. Local Claude/OpenClaw/Codex
    # directories are intentionally not auto-discovered into the product catalog.
    return []


def _parse_native_skill_manifest(path: Path, source_scope: SkillSourceScope) -> SkillDefinitionRecord:
    payload = json.loads(path.read_text(encoding="utf-8"))
    skill_key = str(payload.get("skillKey") or payload.get("skill_key") or path.parent.name)
    label = str(payload.get("label") or payload.get("name") or skill_key)
    definition = SkillDefinition(
        skillKey=skill_key,
        label=label,
        description=str(payload.get("description") or "").strip(),
        schemaVersion=str(payload.get("schemaVersion") or payload.get("schema_version") or ""),
        version=str(payload.get("version") or ""),
        targets=_parse_enum_list(payload.get("targets"), SkillTarget, [SkillTarget.AGENT_NODE]),
        kind=_parse_enum(payload.get("kind"), SkillKind, SkillKind.ATOMIC),
        mode=_parse_enum(payload.get("mode"), SkillMode, SkillMode.TOOL),
        scope=_parse_enum(payload.get("scope"), SkillScope, SkillScope.NODE),
        permissions=[str(item) for item in payload.get("permissions", [])],
        runtime=_parse_runtime_spec(payload.get("runtime")),
        health=_parse_health_spec(payload.get("health")),
        inputSchema=_parse_io_fields(payload.get("inputSchema") or payload.get("input_schema") or []),
        outputSchema=_parse_io_fields(payload.get("outputSchema") or payload.get("output_schema") or []),
        supportedValueTypes=[str(item) for item in payload.get("supportedValueTypes") or payload.get("supported_value_types") or []],
        sideEffects=[SkillSideEffect(str(item)) for item in payload.get("sideEffects") or payload.get("side_effects") or []],
        configured=bool(payload.get("configured", True)),
        healthy=bool(payload.get("healthy", True)),
    )
    eligibility, blockers = _resolve_agent_node_eligibility(definition)
    definition.agent_node_eligibility = eligibility
    definition.agent_node_blockers = blockers
    return SkillDefinitionRecord(
        definition=definition,
        source_format=SkillSourceFormat.GRAPHITE,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_skill_file(path: Path, source_format: SkillSourceFormat, source_scope: SkillSourceScope) -> SkillDefinitionRecord:
    raw = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw, path)
    payload = yaml.safe_load(frontmatter) or {}
    graphite = payload.get("graphite") or {}

    skill_key = str(graphite.get("skill_key") or payload.get("name") or path.stem)
    label = str(payload.get("name") or graphite.get("label") or skill_key)
    description = str(payload.get("description") or "").strip()

    input_schema = _parse_io_fields(graphite.get("input_schema", []))
    output_schema = _parse_io_fields(graphite.get("output_schema", []))
    side_effects = [SkillSideEffect(str(item)) for item in graphite.get("side_effects", [])]

    definition = SkillDefinition(
        skillKey=skill_key,
        label=label,
        description=description or body.splitlines()[0].strip() if body.strip() else "",
        schemaVersion=str(graphite.get("schema_version") or graphite.get("schemaVersion") or ""),
        version=str(graphite.get("version") or payload.get("version") or ""),
        targets=_parse_enum_list(graphite.get("targets"), SkillTarget, [SkillTarget.AGENT_NODE]),
        kind=_parse_enum(graphite.get("kind"), SkillKind, SkillKind.ATOMIC),
        mode=_parse_enum(graphite.get("mode"), SkillMode, SkillMode.TOOL),
        scope=_parse_enum(graphite.get("scope"), SkillScope, SkillScope.NODE),
        permissions=[str(item) for item in graphite.get("permissions", [])],
        runtime=_parse_runtime_spec(graphite.get("runtime")),
        health=_parse_health_spec(graphite.get("health")),
        inputSchema=input_schema,
        outputSchema=output_schema,
        supportedValueTypes=[str(item) for item in graphite.get("supported_value_types", [])],
        sideEffects=side_effects,
    )
    eligibility, blockers = _resolve_agent_node_eligibility(definition)
    definition.agent_node_eligibility = eligibility
    definition.agent_node_blockers = blockers
    return SkillDefinitionRecord(
        definition=definition,
        source_format=source_format,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_io_fields(fields: list[dict]) -> list[SkillIoField]:
    return [
        SkillIoField(
            key=str(field["key"]),
            label=str(field.get("label") or field["key"]),
            valueType=str(field.get("valueType") or field.get("value_type") or "text"),
            required=bool(field.get("required", False)),
            description=str(field.get("description") or ""),
        )
        for field in fields
    ]


def _parse_runtime_spec(payload: object) -> SkillRuntimeSpec:
    if not isinstance(payload, dict):
        return SkillRuntimeSpec(type="none", entrypoint="")
    return SkillRuntimeSpec(
        type=str(payload.get("type") or "builtin"),
        entrypoint=str(payload.get("entrypoint") or ""),
    )


def _parse_health_spec(payload: object) -> SkillHealthSpec:
    if not isinstance(payload, dict):
        return SkillHealthSpec(type="none")
    return SkillHealthSpec(type=str(payload.get("type") or "builtin"))


def _definition_runtime_entrypoint(definition: SkillDefinition) -> str:
    return definition.runtime.entrypoint or definition.skill_key


def _resolve_agent_node_eligibility(definition: SkillDefinition) -> tuple[SkillAgentNodeEligibility, list[str]]:
    blockers: list[str] = []
    if SkillTarget.AGENT_NODE not in definition.targets:
        return SkillAgentNodeEligibility.INCOMPATIBLE, ["Skill target does not include agent_node."]

    if definition.runtime.type != "builtin" or not definition.runtime.entrypoint:
        blockers.append("Skill manifest is missing a builtin runtime entrypoint.")
    if not definition.output_schema:
        blockers.append("Skill manifest is missing outputSchema.")

    if blockers:
        return SkillAgentNodeEligibility.NEEDS_MANIFEST, blockers
    return SkillAgentNodeEligibility.READY, []


def _parse_enum(value: object, enum_type: type[EnumValue], fallback: EnumValue) -> EnumValue:
    if value is None or value == "":
        return fallback
    return enum_type(str(value))


def _parse_enum_list(values: object, enum_type: type[EnumValue], fallback: list[EnumValue]) -> list[EnumValue]:
    if not values:
        return [*fallback]
    return [enum_type(str(value)) for value in values]


def _split_frontmatter(raw: str, path: Path) -> tuple[str, str]:
    if not raw.startswith("---\n"):
        raise ValueError(f"Skill file '{path}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Skill file '{path}' must close YAML frontmatter with '---'.")
    frontmatter, body = rest.split(marker, 1)
    return frontmatter, body.strip()
