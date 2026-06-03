from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from app.core.schemas.tools import (
    ToolCatalogStatus,
    ToolDefinition,
    ToolIoField,
    ToolLocalizedText,
    ToolRuntimeSpec,
    ToolSourceScope,
)
from app.core.storage.tool_store import OFFICIAL_TOOLS_DIR, USER_TOOLS_DIR, ensure_tool_settings
from app.graph_tools.registry import get_tool_registry, list_runtime_tool_keys
from app.graph_tools.runtime import validate_tool_runtime_spec


@dataclass
class ToolDefinitionRecord:
    definition: ToolDefinition
    source_scope: ToolSourceScope
    source_path: str


def list_tool_catalog(*, include_disabled: bool = True) -> list[ToolDefinition]:
    registry_keys = set(get_tool_registry(include_disabled=include_disabled).keys())
    runtime_supported_keys = list_runtime_tool_keys()
    managed_records = {record.definition.tool_key: record for record in _load_managed_tool_records()}
    settings_entries = ensure_tool_settings(set(managed_records))
    tool_keys = sorted(managed_records)

    catalog: list[ToolDefinition] = []
    for tool_key in tool_keys:
        record = managed_records.get(tool_key)
        if record is None:
            continue
        settings_entry = settings_entries.get(tool_key)
        status = ToolCatalogStatus.ACTIVE
        if isinstance(settings_entry, dict) and settings_entry.get("enabled") is False:
            status = ToolCatalogStatus.DISABLED
        if status == ToolCatalogStatus.DELETED:
            continue
        if status == ToolCatalogStatus.DISABLED and not include_disabled:
            continue
        tool_key = record.definition.tool_key
        runtime_registered = tool_key in registry_keys and status == ToolCatalogStatus.ACTIVE
        catalog.append(
            record.definition.model_copy(
                deep=True,
                update={
                    "source_scope": record.source_scope,
                    "source_path": record.source_path,
                    "runtime_ready": tool_key in runtime_supported_keys,
                    "runtime_registered": runtime_registered,
                    "status": status,
                    "can_manage": record.source_scope == ToolSourceScope.USER,
                },
            )
        )
    return catalog


def get_tool_definition_registry(*, include_disabled: bool = False) -> dict[str, ToolDefinition]:
    return {definition.tool_key: definition for definition in list_tool_catalog(include_disabled=include_disabled)}


def get_tool_catalog_registry(*, include_disabled: bool = True) -> dict[str, ToolDefinition]:
    return {definition.tool_key: definition for definition in list_tool_catalog(include_disabled=include_disabled)}


def _load_managed_tool_records() -> list[ToolDefinitionRecord]:
    records: list[ToolDefinitionRecord] = []
    seen_keys: set[str] = set()
    for tool_dir in _iter_tool_dirs(OFFICIAL_TOOLS_DIR):
        record = _parse_tool_dir(tool_dir, ToolSourceScope.OFFICIAL)
        if record is None:
            continue
        records.append(record)
        seen_keys.add(record.definition.tool_key)
    for tool_dir in _iter_tool_dirs(USER_TOOLS_DIR):
        record = _parse_tool_dir(tool_dir, ToolSourceScope.USER)
        if record is None or record.definition.tool_key in seen_keys:
            continue
        records.append(record)
        seen_keys.add(record.definition.tool_key)
    return records


def _iter_tool_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower())


def _parse_tool_dir(tool_dir: Path, source_scope: ToolSourceScope) -> ToolDefinitionRecord | None:
    manifest = tool_dir / "tool.json"
    if not manifest.is_file():
        return None
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    tool_key = str(payload.get("toolKey") or payload.get("tool_key") or tool_dir.name)
    definition = ToolDefinition(
        toolKey=tool_key,
        name=str(payload.get("name") or tool_key),
        description=str(payload.get("description") or "").strip(),
        localized=_parse_localized_text(payload.get("localized") or payload.get("locales") or {}),
        schemaVersion=str(payload.get("schemaVersion") or payload.get("schema_version") or ""),
        version=str(payload.get("version") or ""),
        permissions=[str(item) for item in payload.get("permissions", [])],
        runtime=_parse_runtime_spec(
            payload.get("runtime"),
            fallback_timeout_seconds=payload.get("timeoutSeconds") or payload.get("timeout_seconds"),
        ),
        verificationCommands=payload.get("verificationCommands") or payload.get("verification_commands") or [],
        dynamicStateInputs=bool(payload.get("dynamicStateInputs") or payload.get("dynamic_state_inputs") or False),
        inputPresentation=payload.get("inputPresentation") or payload.get("input_presentation") or {},
        inputSchema=_parse_io_fields(payload.get("inputSchema") or payload.get("input_schema") or []),
        outputSchema=_parse_io_fields(payload.get("outputSchema") or payload.get("output_schema") or []),
    )
    blockers = validate_tool_runtime_spec(
        tool_dir=tool_dir,
        runtime_type=definition.runtime.type,
        entrypoint=definition.runtime.entrypoint,
        command=definition.runtime.command,
    )
    definition.runtime_ready = not blockers
    return ToolDefinitionRecord(
        definition=definition,
        source_scope=source_scope,
        source_path=str(manifest),
    )


def _parse_runtime_spec(payload: object, *, fallback_timeout_seconds: object = None) -> ToolRuntimeSpec:
    if not isinstance(payload, dict):
        return ToolRuntimeSpec(
            type="none",
            entrypoint="",
            timeoutSeconds=_parse_float(fallback_timeout_seconds, 30.0),
        )
    return ToolRuntimeSpec(
        type=str(payload.get("type") or "none"),
        entrypoint=str(payload.get("entrypoint") or ""),
        command=[str(item) for item in payload.get("command") or []],
        timeoutSeconds=_parse_float(
            payload.get("timeoutSeconds") or payload.get("timeout_seconds") or fallback_timeout_seconds,
            30.0,
        ),
    )


def _parse_io_fields(fields: list[dict]) -> list[ToolIoField]:
    parsed_fields: list[ToolIoField] = []
    for field in fields:
        if "label" in field:
            raise ValueError("Tool IO field 'label' is no longer supported. Use 'name'.")
        parsed_fields.append(
            ToolIoField(
                key=str(field["key"]),
                name=str(field.get("name") or field["key"]),
                valueType=str(field.get("valueType") or field.get("value_type") or "text"),
                description=str(field.get("description") or ""),
            )
        )
    return parsed_fields


def _parse_localized_text(payload: object) -> dict[str, ToolLocalizedText]:
    if not isinstance(payload, dict):
        return {}
    localized: dict[str, ToolLocalizedText] = {}
    for locale, value in payload.items():
        locale_key = str(locale).strip()
        if not locale_key or not isinstance(value, dict):
            continue
        localized[locale_key] = ToolLocalizedText(
            name=str(value.get("name") or "").strip(),
            description=str(value.get("description") or "").strip(),
        )
    return localized


def _parse_float(value: object, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback
