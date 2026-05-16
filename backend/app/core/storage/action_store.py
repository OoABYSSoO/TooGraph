from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

import yaml

from app.core.schemas.actions import ActionCapabilityPolicies, ActionCapabilityPolicy, ActionCatalogStatus
from app.core.storage.json_file_utils import read_json_file, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[4]
ACTIONS_ROOT = ROOT_DIR / "action"
OFFICIAL_ACTIONS_DIR = ACTIONS_ROOT / "official"
USER_ACTIONS_DIR = ACTIONS_ROOT / "user"
ACTION_SETTINGS_PATH = ACTIONS_ROOT / "settings.json"

ACTIONS_DIR = OFFICIAL_ACTIONS_DIR
ACTION_STATE_DATA_DIR = ACTIONS_ROOT
ACTION_STATE_PATH = ACTION_SETTINGS_PATH
ACTION_SETTINGS_SCHEMA_VERSION = "toograph.action-settings/v1"


def action_directory_for(action_key: str) -> Path:
    return USER_ACTIONS_DIR / action_key


def official_action_directory_for(action_key: str) -> Path:
    return OFFICIAL_ACTIONS_DIR / action_key


def user_action_directory_for(action_key: str) -> Path:
    return USER_ACTIONS_DIR / action_key


def list_managed_action_keys() -> set[str]:
    return list_official_action_keys() | list_user_action_keys()


def list_official_action_keys() -> set[str]:
    return _list_action_keys(OFFICIAL_ACTIONS_DIR)


def list_user_action_keys() -> set[str]:
    return _list_action_keys(USER_ACTIONS_DIR)


def _list_action_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    if not root.exists():
        return keys
    for path in root.iterdir():
        if path.is_dir() and ((path / "action.json").is_file() or (path / "ACTION.md").is_file()):
            keys.add(path.name)
    return keys


def build_default_action_capability_policy(permissions: list[str]) -> ActionCapabilityPolicies:
    _ = permissions
    return ActionCapabilityPolicies(
        default=ActionCapabilityPolicy(selectable=True, requiresApproval=False),
        origins={},
    )


def ensure_action_settings(default_policies: dict[str, ActionCapabilityPolicies]) -> dict[str, dict]:
    payload, changed = _read_action_settings_payload()
    entries = payload["entries"]
    for action_key in default_policies:
        normalized_entry, entry_changed = _normalize_action_settings_entry(entries.get(action_key))
        if entry_changed or action_key not in entries:
            entries[action_key] = normalized_entry
            changed = True
    if changed or not ACTION_SETTINGS_PATH.exists():
        write_json_file(ACTION_SETTINGS_PATH, payload)
    return entries


def get_action_capability_policy_from_entry(entry: object, default_policy: ActionCapabilityPolicies) -> ActionCapabilityPolicies:
    _ = entry
    return ActionCapabilityPolicies(
        default=default_policy.default.model_copy(deep=True),
        origins={},
    )


def get_action_status_map() -> dict[str, ActionCatalogStatus]:
    payload, _changed = _read_action_settings_payload()
    statuses: dict[str, ActionCatalogStatus] = {}
    for action_key, entry in payload["entries"].items():
        if not isinstance(entry, dict):
            continue
        statuses[str(action_key)] = (
            ActionCatalogStatus.ACTIVE if entry.get("enabled", True) else ActionCatalogStatus.DISABLED
        )
    return statuses


def set_action_status(action_key: str, status: ActionCatalogStatus) -> None:
    payload, _changed = _read_action_settings_payload()
    entry, _entry_changed = _normalize_action_settings_entry(payload["entries"].get(action_key))
    entry["enabled"] = status == ActionCatalogStatus.ACTIVE
    payload["entries"][action_key] = entry
    write_json_file(ACTION_SETTINGS_PATH, payload)


def clear_action_status(action_key: str) -> None:
    payload, changed = _read_action_settings_payload()
    if action_key in payload["entries"]:
        payload["entries"].pop(action_key, None)
        changed = True
    if changed:
        write_json_file(ACTION_SETTINGS_PATH, payload)


def delete_action(action_key: str) -> None:
    root = user_action_directory_for(action_key)
    if root.is_file():
        root.unlink()
    elif root.is_dir():
        shutil.rmtree(root)
    clear_action_status(action_key)


def disable_action(action_key: str) -> None:
    set_action_status(action_key, ActionCatalogStatus.DISABLED)


def enable_action(action_key: str) -> None:
    set_action_status(action_key, ActionCatalogStatus.ACTIVE)


def extract_action_archive(archive_path: Path, destination: Path) -> Path:
    if not zipfile.is_zipfile(archive_path):
        raise ValueError("Only .zip Action archives are supported.")
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


def import_action_from_directory(source_root: Path) -> str:
    action_file = _find_single_action_manifest(source_root)
    action_key = _derive_action_key(action_file)
    if official_action_directory_for(action_key).exists():
        raise ValueError(f"Action key '{action_key}' is already used by an official Action.")
    destination = _managed_action_directory_for(action_key, action_file)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(action_file.parent, destination)
    enable_action(action_key)
    return action_key


def _read_action_settings_payload() -> tuple[dict[str, object], bool]:
    raw_payload = read_json_file(ACTION_SETTINGS_PATH, default=None)
    changed = raw_payload is None
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    if payload.get("schemaVersion") != ACTION_SETTINGS_SCHEMA_VERSION:
        payload = {**payload, "schemaVersion": ACTION_SETTINGS_SCHEMA_VERSION}
        changed = True
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        changed = True
    payload["entries"] = entries
    return payload, changed


def _normalize_action_settings_entry(entry: object) -> tuple[dict[str, object], bool]:
    changed = not isinstance(entry, dict)
    payload = dict(entry) if isinstance(entry, dict) else {}
    enabled = payload.get("enabled", True)
    normalized_enabled = enabled if isinstance(enabled, bool) else bool(enabled)
    normalized_entry = {"enabled": normalized_enabled}
    if payload != normalized_entry:
        changed = True
    return normalized_entry, changed


def _find_single_action_manifest(source_root: Path) -> Path:
    if not source_root.exists():
        raise ValueError("Uploaded Action source does not exist.")
    native_candidates = [
        path
        for path in source_root.rglob("action.json")
        if path.is_file() and "__MACOSX" not in path.relative_to(source_root).parts
    ]
    if len(native_candidates) > 1:
        raise ValueError("Uploaded Action must contain exactly one action.json file.")
    if native_candidates:
        return native_candidates[0]
    legacy_candidates = [
        path
        for path in source_root.rglob("ACTION.md")
        if path.is_file() and "__MACOSX" not in path.relative_to(source_root).parts
    ]
    if not legacy_candidates:
        raise ValueError("Uploaded Action must contain one action.json or ACTION.md file.")
    if len(legacy_candidates) > 1:
        raise ValueError("Uploaded Action must contain exactly one ACTION.md file.")
    return legacy_candidates[0]


def _derive_action_key(action_file: Path) -> str:
    if action_file.name == "action.json":
        try:
            payload = json.loads(action_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Action manifest '{action_file}' must be valid JSON.") from exc
        if "skillKey" in payload or "skill_key" in payload:
            raise ValueError("Action manifest must use actionKey; legacy skillKey is not supported.")
        action_key = str(payload.get("actionKey") or payload.get("action_key") or action_file.parent.name).strip()
        return _validate_action_key(action_key)
    raw = action_file.read_text(encoding="utf-8")
    frontmatter = _read_frontmatter(raw, action_file)
    payload = yaml.safe_load(frontmatter) or {}
    toograph = payload.get("toograph") or {}
    if isinstance(toograph, dict) and "skill_key" in toograph:
        raise ValueError("Action frontmatter must use action_key; legacy skill_key is not supported.")
    action_key = str(toograph.get("action_key") or action_file.parent.name).strip()
    return _validate_action_key(action_key)


def _managed_action_directory_for(action_key: str, action_file: Path) -> Path:
    return user_action_directory_for(action_key)


def _validate_action_key(action_key: str) -> str:
    if not action_key or action_key in {".", ".."} or "/" in action_key or "\\" in action_key:
        raise ValueError("Uploaded Action has an invalid action key.")
    return action_key


def _read_frontmatter(raw: str, action_file: Path) -> str:
    if not raw.startswith("---\n"):
        raise ValueError(f"Action file '{action_file}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Action file '{action_file}' must close YAML frontmatter with '---'.")
    frontmatter, _body = rest.split(marker, 1)
    return frontmatter


def _safe_child_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Uploaded Action contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Action contains an unsafe path.")
    return target
