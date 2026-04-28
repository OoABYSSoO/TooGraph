from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.schemas.node_system import NodeSystemCatalogStatus, NodeSystemGraphPayload, NodeSystemTemplate
from app.core.storage.json_file_utils import read_json_file, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[3]
GRAPH_TEMPLATE_ROOT = ROOT_DIR / "graph_template"
OFFICIAL_TEMPLATES_ROOT = GRAPH_TEMPLATE_ROOT / "official"
USER_TEMPLATES_ROOT = GRAPH_TEMPLATE_ROOT / "user"
TEMPLATE_SETTINGS_PATH = GRAPH_TEMPLATE_ROOT / "settings.json"
TEMPLATE_FILE_NAME = "template.json"
OFFICIAL_TEMPLATE_SOURCE = "official"
USER_TEMPLATE_SOURCE = "user"
TEMPLATE_SETTINGS_SCHEMA_VERSION = "toograph.template-settings/v1"


def list_template_records(include_disabled: bool = False) -> list[dict[str, Any]]:
    official_records = [
        load_template_record_from_path(path, source=OFFICIAL_TEMPLATE_SOURCE)
        for path in _iter_template_paths(OFFICIAL_TEMPLATES_ROOT)
    ]
    user_records = [
        load_template_record_from_path(path, source=USER_TEMPLATE_SOURCE)
        for path in _iter_template_paths(USER_TEMPLATES_ROOT)
    ]
    settings_entries = ensure_template_settings(
        {record["template_id"]: True for record in [*official_records, *user_records]}
    )
    records = [
        _with_template_status(record, settings_entries.get(record["template_id"]))
        for record in [*official_records, *user_records]
    ]
    records = [record for record in records if not _is_internal_template(record)]
    if include_disabled:
        return records
    return [record for record in records if record.get("status") != NodeSystemCatalogStatus.DISABLED.value]


def load_template_record(template_id: str) -> dict[str, Any]:
    official_path = _template_path(OFFICIAL_TEMPLATES_ROOT, template_id)
    if official_path.exists():
        record = load_template_record_from_path(official_path, source=OFFICIAL_TEMPLATE_SOURCE)
        settings_entries = ensure_template_settings({record["template_id"]: True})
        return _with_template_status(record, settings_entries.get(record["template_id"]))
    user_path = _template_path(USER_TEMPLATES_ROOT, template_id)
    if user_path.exists():
        record = load_template_record_from_path(user_path, source=USER_TEMPLATE_SOURCE)
        settings_entries = ensure_template_settings({record["template_id"]: True})
        return _with_template_status(record, settings_entries.get(record["template_id"]))
    raise KeyError(template_id)


def save_user_template_record(graph_payload: NodeSystemGraphPayload) -> dict[str, Any]:
    template_id = _generate_user_template_id()
    graph_data = graph_payload.model_dump(by_alias=True, mode="json")
    metadata = graph_data.get("metadata") if isinstance(graph_data.get("metadata"), dict) else {}
    template_name = _resolve_unique_template_name(graph_payload.name)
    record = NodeSystemTemplate.model_validate(
        {
            "template_id": template_id,
            "label": template_name,
            "description": str(metadata.get("description") or ""),
            "default_graph_name": template_name,
            "state_schema": graph_data["state_schema"],
            "nodes": graph_data["nodes"],
            "edges": graph_data["edges"],
            "conditional_edges": graph_data["conditional_edges"],
            "metadata": graph_data["metadata"],
        }
    ).model_dump(by_alias=True, mode="json", exclude={"status"})
    path = _template_path(USER_TEMPLATES_ROOT, template_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_file(path, record)
    set_template_enabled(template_id, True)
    return _with_template_status(_with_template_source(record, USER_TEMPLATE_SOURCE), {"enabled": True})


def load_template_record_from_path(path: Path, *, source: str) -> dict[str, Any]:
    payload = read_json_file(path, default={})
    template = NodeSystemTemplate.model_validate(payload)
    return _with_template_source(
        template.model_dump(by_alias=True, mode="json", exclude={"status"}),
        source,
    )


def disable_user_template_record(template_id: str) -> dict[str, Any]:
    return set_user_template_status(template_id, NodeSystemCatalogStatus.DISABLED)


def enable_user_template_record(template_id: str) -> dict[str, Any]:
    return set_user_template_status(template_id, NodeSystemCatalogStatus.ACTIVE)


def set_user_template_status(template_id: str, status: NodeSystemCatalogStatus) -> dict[str, Any]:
    _ensure_user_template_is_manageable(template_id)
    path = _template_path(USER_TEMPLATES_ROOT, template_id)
    if not path.exists():
        raise KeyError(template_id)
    set_template_enabled(template_id, status == NodeSystemCatalogStatus.ACTIVE)
    record = load_template_record_from_path(path, source=USER_TEMPLATE_SOURCE)
    return _with_template_status(record, {"enabled": status == NodeSystemCatalogStatus.ACTIVE})


def delete_user_template_record(template_id: str) -> None:
    _ensure_user_template_is_manageable(template_id)
    path = _template_path(USER_TEMPLATES_ROOT, template_id)
    if not path.exists():
        raise KeyError(template_id)
    shutil.rmtree(path.parent)
    remove_template_settings_entry(template_id)


def ensure_template_settings(default_enabled: dict[str, bool]) -> dict[str, dict]:
    payload, changed = _read_template_settings_payload()
    entries = payload["entries"]
    for template_id, enabled in default_enabled.items():
        entry = entries.get(template_id)
        if not isinstance(entry, dict):
            entries[template_id] = {"enabled": bool(enabled)}
            changed = True
        elif not isinstance(entry.get("enabled"), bool):
            entry["enabled"] = bool(entry.get("enabled", enabled))
            changed = True
    if changed or not TEMPLATE_SETTINGS_PATH.exists():
        write_json_file(TEMPLATE_SETTINGS_PATH, payload)
    return entries


def set_template_enabled(template_id: str, enabled: bool) -> None:
    payload, changed = _read_template_settings_payload()
    entry = payload["entries"].get(template_id)
    if not isinstance(entry, dict):
        entry = {}
        changed = True
    entry["enabled"] = bool(enabled)
    payload["entries"][template_id] = entry
    write_json_file(TEMPLATE_SETTINGS_PATH, payload)


def remove_template_settings_entry(template_id: str) -> None:
    payload, changed = _read_template_settings_payload()
    if template_id in payload["entries"]:
        payload["entries"].pop(template_id, None)
        changed = True
    if changed:
        write_json_file(TEMPLATE_SETTINGS_PATH, payload)


def _iter_template_paths(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        (path / TEMPLATE_FILE_NAME for path in root.iterdir() if (path / TEMPLATE_FILE_NAME).is_file()),
        key=lambda path: path.parent.name.lower(),
    )


def _template_path(root: Path, template_id: str) -> Path:
    _validate_template_id(template_id)
    return root / template_id / TEMPLATE_FILE_NAME


def _ensure_user_template_is_manageable(template_id: str) -> None:
    official_path = _template_path(OFFICIAL_TEMPLATES_ROOT, template_id)
    if official_path.exists():
        raise PermissionError("Official templates are read-only.")


def _with_template_source(record: dict[str, Any], source: str) -> dict[str, Any]:
    return {**record, "source": source}


def _with_template_status(record: dict[str, Any], settings_entry: object) -> dict[str, Any]:
    enabled = True
    if isinstance(settings_entry, dict):
        enabled = settings_entry.get("enabled", True) is not False
    status = NodeSystemCatalogStatus.ACTIVE if enabled else NodeSystemCatalogStatus.DISABLED
    return {**record, "status": status.value}


def _read_template_settings_payload() -> tuple[dict[str, object], bool]:
    raw_payload = read_json_file(TEMPLATE_SETTINGS_PATH, default=None)
    changed = raw_payload is None
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    if payload.get("schemaVersion") != TEMPLATE_SETTINGS_SCHEMA_VERSION:
        payload = {**payload, "schemaVersion": TEMPLATE_SETTINGS_SCHEMA_VERSION}
        changed = True
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        changed = True
    payload["entries"] = entries
    return payload, changed


def _is_internal_template(record: dict[str, Any]) -> bool:
    metadata = record.get("metadata")
    return isinstance(metadata, dict) and metadata.get("internal") is True


def _generate_user_template_id() -> str:
    return f"user_template_{uuid4().hex[:10]}"


def _validate_template_id(template_id: str) -> None:
    if not template_id or template_id in {".", ".."} or "/" in template_id or "\\" in template_id:
        raise KeyError(template_id)


def _resolve_unique_template_name(requested_name: str) -> str:
    existing_name_keys: set[str] = set()
    for record in list_template_records(include_disabled=True):
        label = str(record.get("label") or "").strip()
        default_graph_name = str(record.get("default_graph_name") or "").strip()
        if label:
            existing_name_keys.add(_name_key(label))
        if default_graph_name:
            existing_name_keys.add(_name_key(default_graph_name))
    return _resolve_unique_name(requested_name, existing_name_keys)


def _resolve_unique_name(requested_name: str, existing_name_keys: set[str]) -> str:
    base_name = requested_name.strip()
    candidate = base_name
    suffix = 1
    while _name_key(candidate) in existing_name_keys:
        candidate = f"{base_name}_{suffix}"
        suffix += 1
    return candidate


def _name_key(name: str) -> str:
    return name.strip().casefold()
