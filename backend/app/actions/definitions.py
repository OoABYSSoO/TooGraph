from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import yaml

from app.core.schemas.actions import (
    ActionLlmNodeEligibility,
    ActionCatalogStatus,
    ActionDefinition,
    ActionIoField,
    ActionRuntimeSpec,
    ActionSourceScope,
)
from app.core.storage.action_store import (
    OFFICIAL_ACTIONS_DIR,
    USER_ACTIONS_DIR,
    build_default_action_capability_policy,
    ensure_action_settings,
    get_action_capability_policy_from_entry,
)
from app.actions.runtime import has_lifecycle_after_llm, validate_script_runtime_spec
from app.actions.registry import get_action_registry, list_runtime_action_keys


@dataclass
class ActionDefinitionRecord:
    definition: ActionDefinition
    source_scope: ActionSourceScope
    source_path: str


def list_action_definitions(*, include_disabled: bool = False) -> list[ActionDefinition]:
    catalog = list_action_catalog(include_disabled=include_disabled)
    return [item for item in catalog if is_llm_attachable_action(item)]


def is_llm_attachable_action(definition: ActionDefinition) -> bool:
    return (
        definition.status == ActionCatalogStatus.ACTIVE
        and definition.llm_node_eligibility == ActionLlmNodeEligibility.READY
        and definition.runtime_ready
        and definition.runtime_registered
    )


def list_action_catalog(*, include_disabled: bool = True) -> list[ActionDefinition]:
    registry_keys = set(get_action_registry(include_disabled=include_disabled).keys())
    runtime_supported_keys = list_runtime_action_keys()
    managed_records = {record.definition.action_key: record for record in _load_managed_action_records()}
    default_policies = {
        action_key: build_default_action_capability_policy(record.definition.permissions)
        for action_key, record in managed_records.items()
    }
    settings_entries = ensure_action_settings(default_policies)
    action_keys = sorted(managed_records)

    catalog: list[ActionDefinition] = []
    for action_key in action_keys:
        record = managed_records.get(action_key)
        if record is None:
            continue
        settings_entry = settings_entries.get(action_key)
        status = ActionCatalogStatus.ACTIVE
        if isinstance(settings_entry, dict) and settings_entry.get("enabled") is False:
            status = ActionCatalogStatus.DISABLED
        if status == ActionCatalogStatus.DELETED:
            continue
        if status == ActionCatalogStatus.DISABLED and not include_disabled:
            continue
        runtime_registered = record.definition.action_key in registry_keys and status == ActionCatalogStatus.ACTIVE
        runtime_ready = record.definition.action_key in runtime_supported_keys
        capability_policy = get_action_capability_policy_from_entry(
            settings_entry,
            default_policies[action_key],
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
                    "can_manage": record.source_scope == ActionSourceScope.USER,
                    "capability_policy": capability_policy,
                },
            )
        )
    return catalog


def get_action_definition_registry(*, include_disabled: bool = False) -> dict[str, ActionDefinition]:
    return {definition.action_key: definition for definition in list_action_definitions(include_disabled=include_disabled)}


def get_action_catalog_registry(*, include_disabled: bool = True) -> dict[str, ActionDefinition]:
    return {definition.action_key: definition for definition in list_action_catalog(include_disabled=include_disabled)}


def _load_managed_action_records() -> list[ActionDefinitionRecord]:
    records: list[ActionDefinitionRecord] = []
    seen_keys: set[str] = set()
    for action_dir in _iter_action_dirs(OFFICIAL_ACTIONS_DIR):
        record = _parse_action_dir(action_dir, ActionSourceScope.OFFICIAL)
        if record is None:
            continue
        records.append(record)
        seen_keys.add(record.definition.action_key)
    for action_dir in _iter_action_dirs(USER_ACTIONS_DIR):
        record = _parse_action_dir(action_dir, ActionSourceScope.USER)
        if record is None or record.definition.action_key in seen_keys:
            continue
        records.append(record)
        seen_keys.add(record.definition.action_key)
    return records


def _iter_action_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower())


def _parse_action_dir(action_dir: Path, source_scope: ActionSourceScope) -> ActionDefinitionRecord | None:
    manifest = action_dir / "action.json"
    action_file = action_dir / "ACTION.md"
    if manifest.is_file():
        return _parse_native_action_manifest(manifest, source_scope)
    if action_file.is_file():
        return _parse_action_file(action_file, source_scope)
    return None


def _parse_native_action_manifest(path: Path, source_scope: ActionSourceScope) -> ActionDefinitionRecord:
    payload = json.loads(path.read_text(encoding="utf-8"))
    _reject_legacy_targets(payload)
    _reject_legacy_label(payload)
    _reject_legacy_llm_fields(payload)
    _reject_legacy_action_protocol_fields(payload)
    action_key = str(payload.get("actionKey") or payload.get("action_key") or path.parent.name)
    name = str(payload.get("name") or action_key)
    definition = ActionDefinition(
        actionKey=action_key,
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
        llmOutputSchema=_parse_io_fields(payload.get("llmOutputSchema") or payload.get("llm_output_schema") or []),
        stateOutputSchema=_parse_io_fields(payload.get("stateOutputSchema") or payload.get("state_output_schema") or []),
    )
    eligibility, blockers = _resolve_llm_node_eligibility(definition, path.parent)
    definition.llm_node_eligibility = eligibility
    definition.llm_node_blockers = blockers
    return ActionDefinitionRecord(
        definition=definition,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_action_file(path: Path, source_scope: ActionSourceScope) -> ActionDefinitionRecord:
    raw = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw, path)
    payload = yaml.safe_load(frontmatter) or {}
    toograph = payload.get("toograph") or {}
    _reject_legacy_targets(toograph)
    _reject_legacy_label(toograph)
    _reject_legacy_llm_fields(toograph)
    _reject_legacy_action_protocol_fields(toograph)

    action_key = str(toograph.get("action_key") or payload.get("name") or path.stem)
    name = str(payload.get("name") or toograph.get("name") or action_key)
    description = str(payload.get("description") or "").strip()

    state_input_schema = _parse_io_fields(toograph.get("state_input_schema") or toograph.get("stateInputSchema") or [])
    llm_output_schema = _parse_io_fields(toograph.get("llm_output_schema") or toograph.get("llmOutputSchema") or [])
    state_output_schema = _parse_io_fields(toograph.get("state_output_schema") or toograph.get("stateOutputSchema") or [])

    definition = ActionDefinition(
        actionKey=action_key,
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
        llmOutputSchema=llm_output_schema,
        stateOutputSchema=state_output_schema,
    )
    eligibility, blockers = _resolve_llm_node_eligibility(definition, path.parent)
    definition.llm_node_eligibility = eligibility
    definition.llm_node_blockers = blockers
    return ActionDefinitionRecord(
        definition=definition,
        source_scope=source_scope,
        source_path=str(path),
    )


def _parse_io_fields(fields: list[dict]) -> list[ActionIoField]:
    parsed_fields: list[ActionIoField] = []
    for field in fields:
        if "label" in field:
            raise ValueError("Action IO field 'label' is no longer supported. Use 'name'.")
        if "required" in field:
            raise ValueError("Action IO field 'required' is no longer supported. Declare only required Action fields.")
        parsed_fields.append(
            ActionIoField(
                key=str(field["key"]),
                name=str(field.get("name") or field["key"]),
                valueType=str(field.get("valueType") or field.get("value_type") or "text"),
                description=str(field.get("description") or ""),
            )
        )
    return parsed_fields


def _parse_runtime_spec(payload: object, *, fallback_timeout_seconds: object = None) -> ActionRuntimeSpec:
    if not isinstance(payload, dict):
        return ActionRuntimeSpec(
            type="none",
            entrypoint="",
            timeoutSeconds=_parse_float(fallback_timeout_seconds, 30.0),
        )
    return ActionRuntimeSpec(
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
            "Action manifest field 'targets' is no longer supported. Action visibility is controlled by action/settings.json."
        )
    if isinstance(payload, dict) and "executionTargets" in payload:
        raise ValueError(
            "Action manifest field 'executionTargets' is no longer supported. Action visibility is controlled by action/settings.json."
        )


def _reject_legacy_label(payload: object) -> None:
    if isinstance(payload, dict) and "label" in payload:
        raise ValueError(
            "Action manifest field 'label' is no longer supported. Use 'name' and put selection guidance in 'description'."
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
                f"Action manifest field '{legacy}' is no longer supported. Use '{replacement}'."
            )


def _reject_legacy_action_protocol_fields(payload: object) -> None:
    if not isinstance(payload, dict):
        return
    legacy_fields = {
        "skillKey": "actionKey",
        "skill_key": "action_key",
        "capabilityPolicy": "graph or Buddy permission mode; visibility uses action/settings.json",
        "capability_policy": "graph or Buddy permission mode; visibility uses action/settings.json",
        "runPolicies": "graph or Buddy permission mode; visibility uses action/settings.json",
        "run_policies": "graph or Buddy permission mode; visibility uses action/settings.json",
        "supportedValueTypes": "stateOutputSchema",
        "supported_value_types": "state_output_schema",
        "inputSchema": "llmOutputSchema",
        "input_schema": "llm_output_schema",
        "outputSchema": "stateOutputSchema",
        "output_schema": "state_output_schema",
        "sideEffects": "permissions",
        "side_effects": "permissions",
        "health": "action/settings.json and runtime readiness",
        "configured": "action/settings.json and runtime readiness",
        "healthy": "action/settings.json and runtime readiness",
        "kind": "no longer supported",
        "mode": "no longer supported",
        "scope": "no longer supported",
    }
    for legacy, replacement in legacy_fields.items():
        if legacy in payload:
            raise ValueError(
                f"Action manifest field '{legacy}' is no longer supported. Use '{replacement}'."
            )


def _parse_float(value: object, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _resolve_llm_node_eligibility(definition: ActionDefinition, action_dir: Path) -> tuple[ActionLlmNodeEligibility, list[str]]:
    blockers: list[str] = []
    if not has_lifecycle_after_llm(action_dir):
        blockers.extend(
            validate_script_runtime_spec(
                action_dir=action_dir,
                runtime_type=definition.runtime.type,
                entrypoint=definition.runtime.entrypoint,
                command=definition.runtime.command,
            )
        )
    if not definition.state_output_schema:
        blockers.append("Action manifest is missing stateOutputSchema.")

    if blockers:
        return ActionLlmNodeEligibility.NEEDS_MANIFEST, blockers
    return ActionLlmNodeEligibility.READY, []


def _split_frontmatter(raw: str, path: Path) -> tuple[str, str]:
    if not raw.startswith("---\n"):
        raise ValueError(f"Action file '{path}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Action file '{path}' must close YAML frontmatter with '---'.")
    frontmatter, body = rest.split(marker, 1)
    return frontmatter, body.strip()
