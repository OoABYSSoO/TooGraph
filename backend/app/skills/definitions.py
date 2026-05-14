from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import yaml

from app.core.schemas.skills import (
    SkillLlmNodeEligibility,
    SkillCatalogStatus,
    SkillDefinition,
    SkillIoField,
    SkillRuntimeSpec,
    SkillSourceScope,
)
from app.core.storage.skill_store import (
    OFFICIAL_SKILLS_DIR,
    USER_SKILLS_DIR,
    build_default_skill_capability_policy,
    ensure_skill_settings,
    get_skill_capability_policy_from_entry,
)
from app.skills.runtime import has_lifecycle_after_llm, validate_script_runtime_spec
from app.skills.registry import get_skill_registry, list_runtime_skill_keys


@dataclass
class SkillDefinitionRecord:
    definition: SkillDefinition
    source_scope: SkillSourceScope
    source_path: str


def list_skill_definitions(*, include_disabled: bool = False) -> list[SkillDefinition]:
    catalog = list_skill_catalog(include_disabled=include_disabled)
    return [item for item in catalog if is_llm_attachable_skill(item)]


def is_llm_attachable_skill(definition: SkillDefinition) -> bool:
    return (
        definition.status == SkillCatalogStatus.ACTIVE
        and definition.llm_node_eligibility == SkillLlmNodeEligibility.READY
        and definition.runtime_ready
        and definition.runtime_registered
    )


def list_skill_catalog(*, include_disabled: bool = True) -> list[SkillDefinition]:
    registry_keys = set(get_skill_registry(include_disabled=include_disabled).keys())
    runtime_supported_keys = list_runtime_skill_keys()
    managed_records = {record.definition.skill_key: record for record in _load_managed_skill_records()}
    default_policies = {
        skill_key: build_default_skill_capability_policy(record.definition.permissions)
        for skill_key, record in managed_records.items()
    }
    settings_entries = ensure_skill_settings(default_policies)
    skill_keys = sorted(managed_records)

    catalog: list[SkillDefinition] = []
    for skill_key in skill_keys:
        record = managed_records.get(skill_key)
        if record is None:
            continue
        settings_entry = settings_entries.get(skill_key)
        status = SkillCatalogStatus.ACTIVE
        if isinstance(settings_entry, dict) and settings_entry.get("enabled") is False:
            status = SkillCatalogStatus.DISABLED
        if status == SkillCatalogStatus.DELETED:
            continue
        if status == SkillCatalogStatus.DISABLED and not include_disabled:
            continue
        runtime_registered = record.definition.skill_key in registry_keys and status == SkillCatalogStatus.ACTIVE
        runtime_ready = record.definition.skill_key in runtime_supported_keys
        capability_policy = get_skill_capability_policy_from_entry(
            settings_entry,
            default_policies[skill_key],
        )
        catalog.append(
            record.definition.model_copy(
                deep=True,
                update={
                    "source_scope": record.source_scope,
                    "source_path": record.source_path,
                    "runtime_ready": runtime_ready,
                    "runtime_registered": runtime_registered,
                    "status": status,
                    "can_manage": record.source_scope == SkillSourceScope.USER,
                    "capability_policy": capability_policy,
                },
            )
        )
    return catalog


def get_skill_definition_registry(*, include_disabled: bool = False) -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition for definition in list_skill_definitions(include_disabled=include_disabled)}


def get_skill_catalog_registry(*, include_disabled: bool = True) -> dict[str, SkillDefinition]:
    return {definition.skill_key: definition for definition in list_skill_catalog(include_disabled=include_disabled)}


def _load_managed_skill_records() -> list[SkillDefinitionRecord]:
    records: list[SkillDefinitionRecord] = []
    seen_keys: set[str] = set()
    for skill_dir in _iter_skill_dirs(OFFICIAL_SKILLS_DIR):
        record = _parse_skill_dir(skill_dir, SkillSourceScope.OFFICIAL)
        if record is None:
            continue
        records.append(record)
        seen_keys.add(record.definition.skill_key)
    for skill_dir in _iter_skill_dirs(USER_SKILLS_DIR):
        record = _parse_skill_dir(skill_dir, SkillSourceScope.USER)
        if record is None or record.definition.skill_key in seen_keys:
            continue
        records.append(record)
        seen_keys.add(record.definition.skill_key)
    return records


def _iter_skill_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower())


def _parse_skill_dir(skill_dir: Path, source_scope: SkillSourceScope) -> SkillDefinitionRecord | None:
    manifest = skill_dir / "skill.json"
    skill_file = skill_dir / "SKILL.md"
    if manifest.is_file():
        return _parse_native_skill_manifest(manifest, source_scope)
    if skill_file.is_file():
        return _parse_skill_file(skill_file, source_scope)
    return None


def _parse_native_skill_manifest(path: Path, source_scope: SkillSourceScope) -> SkillDefinitionRecord:
    payload = json.loads(path.read_text(encoding="utf-8"))
    _reject_legacy_targets(payload)
    _reject_legacy_label(payload)
    _reject_legacy_llm_fields(payload)
    _reject_legacy_skill_protocol_fields(payload)
    skill_key = str(payload.get("skillKey") or payload.get("skill_key") or path.parent.name)
    name = str(payload.get("name") or skill_key)
    definition = SkillDefinition(
        skillKey=skill_key,
        name=name,
        description=str(payload.get("description") or "").strip(),
        llmInstruction=str(payload.get("llmInstruction") or payload.get("llm_instruction") or "").strip(),
        schemaVersion=str(payload.get("schemaVersion") or payload.get("schema_version") or ""),
        version=str(payload.get("version") or ""),
        permissions=[str(item) for item in payload.get("permissions", [])],
        runtime=_parse_runtime_spec(
            payload.get("runtime"),
            fallback_timeout_seconds=payload.get("timeoutSeconds") or payload.get("timeout_seconds"),
        ),
        stateInputSchema=_parse_io_fields(payload.get("stateInputSchema") or payload.get("state_input_schema") or []),
        inputSchema=_parse_io_fields(payload.get("inputSchema") or payload.get("input_schema") or []),
        outputSchema=_parse_io_fields(payload.get("outputSchema") or payload.get("output_schema") or []),
    )
    eligibility, blockers = _resolve_llm_node_eligibility(definition, path.parent)
    definition.llm_node_eligibility = eligibility
    definition.llm_node_blockers = blockers
    return SkillDefinitionRecord(
        definition=definition,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_skill_file(path: Path, source_scope: SkillSourceScope) -> SkillDefinitionRecord:
    raw = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw, path)
    payload = yaml.safe_load(frontmatter) or {}
    toograph = payload.get("toograph") or {}
    _reject_legacy_targets(toograph)
    _reject_legacy_label(toograph)
    _reject_legacy_llm_fields(toograph)
    _reject_legacy_skill_protocol_fields(toograph)

    skill_key = str(toograph.get("skill_key") or payload.get("name") or path.stem)
    name = str(payload.get("name") or toograph.get("name") or skill_key)
    description = str(payload.get("description") or "").strip()

    state_input_schema = _parse_io_fields(toograph.get("state_input_schema") or toograph.get("stateInputSchema") or [])
    input_schema = _parse_io_fields(toograph.get("input_schema", []))
    output_schema = _parse_io_fields(toograph.get("output_schema", []))

    definition = SkillDefinition(
        skillKey=skill_key,
        name=name,
        description=description or body.splitlines()[0].strip() if body.strip() else "",
        llmInstruction=str(toograph.get("llmInstruction") or toograph.get("llm_instruction") or "").strip(),
        schemaVersion=str(toograph.get("schema_version") or toograph.get("schemaVersion") or ""),
        version=str(toograph.get("version") or payload.get("version") or ""),
        permissions=[str(item) for item in toograph.get("permissions", [])],
        runtime=_parse_runtime_spec(
            toograph.get("runtime"),
            fallback_timeout_seconds=toograph.get("timeout_seconds") or toograph.get("timeoutSeconds"),
        ),
        stateInputSchema=state_input_schema,
        inputSchema=input_schema,
        outputSchema=output_schema,
    )
    eligibility, blockers = _resolve_llm_node_eligibility(definition, path.parent)
    definition.llm_node_eligibility = eligibility
    definition.llm_node_blockers = blockers
    return SkillDefinitionRecord(
        definition=definition,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_io_fields(fields: list[dict]) -> list[SkillIoField]:
    parsed_fields: list[SkillIoField] = []
    for field in fields:
        if "label" in field:
            raise ValueError("Skill IO field 'label' is no longer supported. Use 'name'.")
        parsed_fields.append(
            SkillIoField(
                key=str(field["key"]),
                name=str(field.get("name") or field["key"]),
                valueType=str(field.get("valueType") or field.get("value_type") or "text"),
                required=bool(field.get("required", False)),
                description=str(field.get("description") or ""),
            )
        )
    return parsed_fields


def _parse_runtime_spec(payload: object, *, fallback_timeout_seconds: object = None) -> SkillRuntimeSpec:
    if not isinstance(payload, dict):
        return SkillRuntimeSpec(
            type="none",
            entrypoint="",
            timeoutSeconds=_parse_float(fallback_timeout_seconds, 30.0),
        )
    return SkillRuntimeSpec(
        type=str(payload.get("type") or "none"),
        entrypoint=str(payload.get("entrypoint") or ""),
        command=[str(item) for item in payload.get("command") or []],
        timeoutSeconds=_parse_float(
            payload.get("timeoutSeconds") or payload.get("timeout_seconds") or fallback_timeout_seconds,
            30.0,
        ),
    )


def _reject_legacy_targets(payload: object) -> None:
    if isinstance(payload, dict) and "targets" in payload:
        raise ValueError(
            "Skill manifest field 'targets' is no longer supported. Skill visibility is controlled by skill/settings.json."
        )
    if isinstance(payload, dict) and "executionTargets" in payload:
        raise ValueError(
            "Skill manifest field 'executionTargets' is no longer supported. Skill visibility is controlled by skill/settings.json."
        )


def _reject_legacy_label(payload: object) -> None:
    if isinstance(payload, dict) and "label" in payload:
        raise ValueError(
            "Skill manifest field 'label' is no longer supported. Use 'name' and put selection guidance in 'description'."
        )


def _reject_legacy_llm_fields(payload: object) -> None:
    if not isinstance(payload, dict):
        return
    legacy_fields = {
        "agentInstruction": "llmInstruction",
        "agent_instruction": "llm_instruction",
        "agentNodeEligibility": "llmNodeEligibility",
        "agentNodeBlockers": "llmNodeBlockers",
    }
    for legacy, replacement in legacy_fields.items():
        if legacy in payload:
            raise ValueError(
                f"Skill manifest field '{legacy}' is no longer supported. Use '{replacement}'."
            )


def _reject_legacy_skill_protocol_fields(payload: object) -> None:
    if not isinstance(payload, dict):
        return
    legacy_fields = {
        "capabilityPolicy": "graph or Buddy permission mode; visibility uses skill/settings.json",
        "capability_policy": "graph or Buddy permission mode; visibility uses skill/settings.json",
        "runPolicies": "graph or Buddy permission mode; visibility uses skill/settings.json",
        "run_policies": "graph or Buddy permission mode; visibility uses skill/settings.json",
        "supportedValueTypes": "outputSchema",
        "supported_value_types": "output_schema",
        "sideEffects": "permissions",
        "side_effects": "permissions",
        "health": "skill/settings.json and runtime readiness",
        "configured": "skill/settings.json and runtime readiness",
        "healthy": "skill/settings.json and runtime readiness",
        "kind": "no longer supported",
        "mode": "no longer supported",
        "scope": "no longer supported",
    }
    for legacy, replacement in legacy_fields.items():
        if legacy in payload:
            raise ValueError(
                f"Skill manifest field '{legacy}' is no longer supported. Use '{replacement}'."
            )


def _parse_float(value: object, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _resolve_llm_node_eligibility(definition: SkillDefinition, skill_dir: Path) -> tuple[SkillLlmNodeEligibility, list[str]]:
    blockers: list[str] = []
    if not has_lifecycle_after_llm(skill_dir):
        blockers.extend(
            validate_script_runtime_spec(
                skill_dir=skill_dir,
                runtime_type=definition.runtime.type,
                entrypoint=definition.runtime.entrypoint,
                command=definition.runtime.command,
            )
        )
    if not definition.output_schema:
        blockers.append("Skill manifest is missing outputSchema.")

    if blockers:
        return SkillLlmNodeEligibility.NEEDS_MANIFEST, blockers
    return SkillLlmNodeEligibility.READY, []


def _split_frontmatter(raw: str, path: Path) -> tuple[str, str]:
    if not raw.startswith("---\n"):
        raise ValueError(f"Skill file '{path}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Skill file '{path}' must close YAML frontmatter with '---'.")
    frontmatter, body = rest.split(marker, 1)
    return frontmatter, body.strip()
