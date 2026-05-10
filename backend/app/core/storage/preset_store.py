from __future__ import annotations

import shutil
from pathlib import Path

from app.core.schemas.preset import NodeSystemPresetDocument, NodeSystemPresetPayload, NodeSystemPresetStatus
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[4]
PRESET_ROOT = ROOT_DIR / "node_preset"
OFFICIAL_PRESET_ROOT = PRESET_ROOT / "official"
USER_PRESET_ROOT = PRESET_ROOT / "user"
PRESET_SETTINGS_PATH = PRESET_ROOT / "settings.local.json"
PRESET_DATA_DIR = USER_PRESET_ROOT
PRESET_FILE_NAME = "preset.json"
PRESET_SETTINGS_SCHEMA_VERSION = "graphiteui.node-preset-settings/v1"


def save_preset(payload: NodeSystemPresetPayload) -> NodeSystemPresetDocument:
    if payload.definition.node.kind != "agent":
        raise ValueError("Only LLM nodes can be saved as presets.")
    USER_PRESET_ROOT.mkdir(parents=True, exist_ok=True)
    path = _preset_path(USER_PRESET_ROOT, payload.preset_id)
    existing_document = _read_preset_document(path, NodeSystemPresetStatus.ACTIVE) if path.exists() else None
    timestamp = utc_now_iso()
    document = NodeSystemPresetDocument.model_validate(
        {
            **payload.model_dump(by_alias=True),
            "createdAt": existing_document.created_at if existing_document else timestamp,
            "updatedAt": timestamp,
            "status": NodeSystemPresetStatus.ACTIVE,
        }
    )
    _write_preset_document(path, document)
    set_preset_enabled(payload.preset_id, True)
    return document


def load_preset(preset_id: str) -> NodeSystemPresetDocument:
    path, _source = _find_preset_path(preset_id)
    settings_entries = ensure_preset_settings({preset_id: True})
    status = _status_from_settings(settings_entries.get(preset_id))
    return _read_preset_document(path, status)


def list_presets(include_disabled: bool = False) -> list[NodeSystemPresetDocument]:
    preset_paths = _iter_preset_paths(OFFICIAL_PRESET_ROOT) + _iter_preset_paths(USER_PRESET_ROOT)
    default_enabled = {path.parent.name: True for path in preset_paths}
    settings_entries = ensure_preset_settings(default_enabled)
    items: list[NodeSystemPresetDocument] = []
    seen: set[str] = set()
    for path in sorted(preset_paths, key=lambda item: item.parent.name.lower()):
        preset_id = path.parent.name
        if preset_id in seen:
            continue
        seen.add(preset_id)
        status = _status_from_settings(settings_entries.get(preset_id))
        try:
            document = _read_preset_document(path, status)
            if document.definition.node.kind != "agent":
                continue
            if document.status == NodeSystemPresetStatus.DISABLED and not include_disabled:
                continue
            items.append(document)
        except Exception:
            continue
    items.sort(key=lambda item: ((item.updated_at or ""), item.preset_id), reverse=True)
    return items


def disable_preset(preset_id: str) -> NodeSystemPresetDocument:
    return set_preset_status(preset_id, NodeSystemPresetStatus.DISABLED)


def enable_preset(preset_id: str) -> NodeSystemPresetDocument:
    return set_preset_status(preset_id, NodeSystemPresetStatus.ACTIVE)


def set_preset_status(preset_id: str, status: NodeSystemPresetStatus) -> NodeSystemPresetDocument:
    path, _source = _find_preset_path(preset_id)
    set_preset_enabled(preset_id, status == NodeSystemPresetStatus.ACTIVE)
    return _read_preset_document(path, status)


def delete_preset(preset_id: str) -> None:
    path = _preset_path(USER_PRESET_ROOT, preset_id)
    if not path.exists():
        if _preset_path(OFFICIAL_PRESET_ROOT, preset_id).exists():
            raise FileNotFoundError(f"Preset '{preset_id}' is read-only.")
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    shutil.rmtree(path.parent)
    remove_preset_settings_entry(preset_id)


def ensure_preset_settings(default_enabled: dict[str, bool]) -> dict[str, dict]:
    payload, changed = _read_preset_settings_payload()
    entries = payload["entries"]
    for preset_id, enabled in default_enabled.items():
        entry = entries.get(preset_id)
        if not isinstance(entry, dict):
            entries[preset_id] = {"enabled": bool(enabled)}
            changed = True
        elif not isinstance(entry.get("enabled"), bool):
            entry["enabled"] = bool(entry.get("enabled", enabled))
            changed = True
    if changed or not PRESET_SETTINGS_PATH.exists():
        write_json_file(PRESET_SETTINGS_PATH, payload)
    return entries


def set_preset_enabled(preset_id: str, enabled: bool) -> None:
    payload, _changed = _read_preset_settings_payload()
    entry = payload["entries"].get(preset_id)
    if not isinstance(entry, dict):
        entry = {}
    entry["enabled"] = bool(enabled)
    payload["entries"][preset_id] = entry
    write_json_file(PRESET_SETTINGS_PATH, payload)


def remove_preset_settings_entry(preset_id: str) -> None:
    payload, changed = _read_preset_settings_payload()
    if preset_id in payload["entries"]:
        payload["entries"].pop(preset_id, None)
        changed = True
    if changed:
        write_json_file(PRESET_SETTINGS_PATH, payload)


def _find_preset_path(preset_id: str) -> tuple[Path, str]:
    user_path = _preset_path(USER_PRESET_ROOT, preset_id)
    if user_path.exists():
        return user_path, "user"
    official_path = _preset_path(OFFICIAL_PRESET_ROOT, preset_id)
    if official_path.exists():
        return official_path, "official"
    raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")


def _iter_preset_paths(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        (path / PRESET_FILE_NAME for path in root.iterdir() if (path / PRESET_FILE_NAME).is_file()),
        key=lambda path: path.parent.name.lower(),
    )


def _preset_path(root: Path, preset_id: str) -> Path:
    _validate_preset_id(preset_id)
    return root / preset_id / PRESET_FILE_NAME


def _read_preset_document(path: Path, status: NodeSystemPresetStatus) -> NodeSystemPresetDocument:
    payload = read_json_file(path, default=None)
    if payload is None:
        raise FileNotFoundError(f"Preset '{path.parent.name}' does not exist.")
    return NodeSystemPresetDocument.model_validate({**payload, "status": status.value})


def _write_preset_document(path: Path, document: NodeSystemPresetDocument) -> None:
    payload = document.model_dump(by_alias=True, mode="json", exclude={"status"})
    write_json_file(path, payload)


def _status_from_settings(settings_entry: object) -> NodeSystemPresetStatus:
    enabled = True
    if isinstance(settings_entry, dict):
        enabled = settings_entry.get("enabled", True) is not False
    return NodeSystemPresetStatus.ACTIVE if enabled else NodeSystemPresetStatus.DISABLED


def _read_preset_settings_payload() -> tuple[dict[str, object], bool]:
    raw_payload = read_json_file(PRESET_SETTINGS_PATH, default=None)
    changed = raw_payload is None
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    if payload.get("schemaVersion") != PRESET_SETTINGS_SCHEMA_VERSION:
        payload = {**payload, "schemaVersion": PRESET_SETTINGS_SCHEMA_VERSION}
        changed = True
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        changed = True
    payload["entries"] = entries
    return payload, changed


def _validate_preset_id(preset_id: str) -> None:
    if not preset_id or preset_id in {".", ".."} or "/" in preset_id or "\\" in preset_id:
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
