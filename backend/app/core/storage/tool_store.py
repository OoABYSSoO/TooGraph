from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

from app.core.schemas.tools import ToolCatalogStatus
from app.core.storage.json_file_utils import read_json_file, write_json_file


REPO_ROOT = Path(__file__).resolve().parents[4]
TOOL_ROOT = REPO_ROOT / "tool"
OFFICIAL_TOOLS_DIR = TOOL_ROOT / "official"
USER_TOOLS_DIR = TOOL_ROOT / "user"
TOOL_SETTINGS_PATH = TOOL_ROOT / "settings.json"
TOOL_SETTINGS_SCHEMA_VERSION = "toograph.tool-settings/v1"


def official_tool_directory_for(tool_key: str) -> Path:
    return OFFICIAL_TOOLS_DIR / tool_key


def user_tool_directory_for(tool_key: str) -> Path:
    return USER_TOOLS_DIR / tool_key


def list_managed_tool_keys() -> set[str]:
    return list_official_tool_keys() | list_user_tool_keys()


def list_official_tool_keys() -> set[str]:
    return _list_tool_keys(OFFICIAL_TOOLS_DIR)


def list_user_tool_keys() -> set[str]:
    return _list_tool_keys(USER_TOOLS_DIR)


def ensure_tool_settings(tool_keys: set[str]) -> dict[str, dict]:
    payload, changed = _read_tool_settings_payload()
    entries = payload["entries"]
    for tool_key in tool_keys:
        normalized_entry, entry_changed = _normalize_tool_settings_entry(entries.get(tool_key))
        if entry_changed or tool_key not in entries:
            entries[tool_key] = normalized_entry
            changed = True
    if changed or not TOOL_SETTINGS_PATH.exists():
        write_json_file(TOOL_SETTINGS_PATH, payload)
    return entries


def get_tool_status_map() -> dict[str, ToolCatalogStatus]:
    payload, _changed = _read_tool_settings_payload()
    statuses: dict[str, ToolCatalogStatus] = {}
    for tool_key, entry in payload["entries"].items():
        if not isinstance(entry, dict):
            continue
        statuses[str(tool_key)] = ToolCatalogStatus.ACTIVE if entry.get("enabled", True) else ToolCatalogStatus.DISABLED
    return statuses


def set_tool_status(tool_key: str, status: ToolCatalogStatus) -> None:
    payload, _changed = _read_tool_settings_payload()
    entry, _entry_changed = _normalize_tool_settings_entry(payload["entries"].get(tool_key))
    entry["enabled"] = status == ToolCatalogStatus.ACTIVE
    payload["entries"][tool_key] = entry
    write_json_file(TOOL_SETTINGS_PATH, payload)


def clear_tool_status(tool_key: str) -> None:
    payload, changed = _read_tool_settings_payload()
    if tool_key in payload["entries"]:
        payload["entries"].pop(tool_key, None)
        changed = True
    if changed:
        write_json_file(TOOL_SETTINGS_PATH, payload)


def delete_tool(tool_key: str) -> None:
    root = user_tool_directory_for(tool_key)
    if root.is_file():
        root.unlink()
    elif root.is_dir():
        shutil.rmtree(root)
    clear_tool_status(tool_key)


def disable_tool(tool_key: str) -> None:
    set_tool_status(tool_key, ToolCatalogStatus.DISABLED)


def enable_tool(tool_key: str) -> None:
    set_tool_status(tool_key, ToolCatalogStatus.ACTIVE)


def extract_tool_archive(archive_path: Path, destination: Path) -> Path:
    if not zipfile.is_zipfile(archive_path):
        raise ValueError("Only .zip Tool archives are supported.")
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            target = _safe_child_path(destination, member.filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    return destination


def import_tool_from_directory(source_root: Path) -> str:
    manifest = _find_single_tool_manifest(source_root)
    tool_key = _derive_tool_key(manifest)
    if official_tool_directory_for(tool_key).exists():
        raise ValueError(f"Tool key '{tool_key}' is already used by an official Tool.")
    destination = user_tool_directory_for(tool_key)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(manifest.parent, destination)
    enable_tool(tool_key)
    return tool_key


def _list_tool_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    if not root.exists():
        return keys
    for path in root.iterdir():
        if path.is_dir() and (path / "tool.json").is_file():
            keys.add(path.name)
    return keys


def _read_tool_settings_payload() -> tuple[dict[str, object], bool]:
    raw_payload = read_json_file(TOOL_SETTINGS_PATH, default=None)
    changed = raw_payload is None
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    if payload.get("schemaVersion") != TOOL_SETTINGS_SCHEMA_VERSION:
        payload = {**payload, "schemaVersion": TOOL_SETTINGS_SCHEMA_VERSION}
        changed = True
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        changed = True
    payload["entries"] = entries
    return payload, changed


def _normalize_tool_settings_entry(entry: object) -> tuple[dict[str, object], bool]:
    changed = not isinstance(entry, dict)
    payload = dict(entry) if isinstance(entry, dict) else {}
    enabled = payload.get("enabled", True)
    normalized_enabled = enabled if isinstance(enabled, bool) else bool(enabled)
    normalized_entry = {"enabled": normalized_enabled}
    if payload != normalized_entry:
        changed = True
    return normalized_entry, changed


def _find_single_tool_manifest(source_root: Path) -> Path:
    if not source_root.exists():
        raise ValueError("Uploaded Tool source does not exist.")
    candidates = [
        path
        for path in source_root.rglob("tool.json")
        if path.is_file() and "__MACOSX" not in path.relative_to(source_root).parts
    ]
    if not candidates:
        raise ValueError("Uploaded Tool must contain exactly one tool.json file.")
    if len(candidates) > 1:
        raise ValueError("Uploaded Tool must contain exactly one tool.json file.")
    return candidates[0]


def _derive_tool_key(manifest: Path) -> str:
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Tool manifest '{manifest}' must be valid JSON.") from exc
    if any(key in payload for key in ("skillKey", "skill_key", "actionKey", "action_key")):
        raise ValueError("Tool manifest must use toolKey; legacy skill/action keys are not supported.")
    tool_key = str(payload.get("toolKey") or payload.get("tool_key") or manifest.parent.name).strip()
    return _validate_tool_key(tool_key)


def _validate_tool_key(tool_key: str) -> str:
    if not tool_key or tool_key in {".", ".."} or "/" in tool_key or "\\" in tool_key:
        raise ValueError("Uploaded Tool has an invalid tool key.")
    return tool_key


def _safe_child_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Uploaded Tool contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Tool contains an unsafe path.")
    return target
