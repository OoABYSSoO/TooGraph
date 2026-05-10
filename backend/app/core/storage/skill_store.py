from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

import yaml

from app.core.schemas.skills import SkillCapabilityPolicies, SkillCapabilityPolicy, SkillCatalogStatus
from app.core.storage.json_file_utils import read_json_file, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[4]
SKILLS_ROOT = ROOT_DIR / "skill"
OFFICIAL_SKILLS_DIR = SKILLS_ROOT / "official"
USER_SKILLS_DIR = SKILLS_ROOT / "user"
SKILL_SETTINGS_PATH = SKILLS_ROOT / "settings.json"

SKILLS_DIR = OFFICIAL_SKILLS_DIR
SKILL_STATE_DATA_DIR = SKILLS_ROOT
SKILL_STATE_PATH = SKILL_SETTINGS_PATH
SKILL_SETTINGS_SCHEMA_VERSION = "toograph.skill-settings/v1"


def skill_directory_for(skill_key: str) -> Path:
    return USER_SKILLS_DIR / skill_key


def official_skill_directory_for(skill_key: str) -> Path:
    return OFFICIAL_SKILLS_DIR / skill_key


def user_skill_directory_for(skill_key: str) -> Path:
    return USER_SKILLS_DIR / skill_key


def list_managed_skill_keys() -> set[str]:
    return list_official_skill_keys() | list_user_skill_keys()


def list_official_skill_keys() -> set[str]:
    return _list_skill_keys(OFFICIAL_SKILLS_DIR)


def list_user_skill_keys() -> set[str]:
    return _list_skill_keys(USER_SKILLS_DIR)


def _list_skill_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    if not root.exists():
        return keys
    for path in root.iterdir():
        if path.is_dir() and ((path / "skill.json").is_file() or (path / "SKILL.md").is_file()):
            keys.add(path.name)
    return keys


def build_default_skill_capability_policy(permissions: list[str]) -> SkillCapabilityPolicies:
    _ = permissions
    return SkillCapabilityPolicies(
        default=SkillCapabilityPolicy(selectable=True, requiresApproval=False),
        origins={},
    )


def ensure_skill_settings(default_policies: dict[str, SkillCapabilityPolicies]) -> dict[str, dict]:
    payload, changed = _read_skill_settings_payload()
    entries = payload["entries"]
    for skill_key in default_policies:
        normalized_entry, entry_changed = _normalize_skill_settings_entry(entries.get(skill_key))
        if entry_changed or skill_key not in entries:
            entries[skill_key] = normalized_entry
            changed = True
    if changed or not SKILL_SETTINGS_PATH.exists():
        write_json_file(SKILL_SETTINGS_PATH, payload)
    return entries


def get_skill_capability_policy_from_entry(entry: object, default_policy: SkillCapabilityPolicies) -> SkillCapabilityPolicies:
    _ = entry
    return SkillCapabilityPolicies(
        default=default_policy.default.model_copy(deep=True),
        origins={},
    )


def get_skill_status_map() -> dict[str, SkillCatalogStatus]:
    payload, _changed = _read_skill_settings_payload()
    statuses: dict[str, SkillCatalogStatus] = {}
    for skill_key, entry in payload["entries"].items():
        if not isinstance(entry, dict):
            continue
        statuses[str(skill_key)] = (
            SkillCatalogStatus.ACTIVE if entry.get("enabled", True) else SkillCatalogStatus.DISABLED
        )
    return statuses


def set_skill_status(skill_key: str, status: SkillCatalogStatus) -> None:
    payload, _changed = _read_skill_settings_payload()
    entry, _entry_changed = _normalize_skill_settings_entry(payload["entries"].get(skill_key))
    entry["enabled"] = status == SkillCatalogStatus.ACTIVE
    payload["entries"][skill_key] = entry
    write_json_file(SKILL_SETTINGS_PATH, payload)


def clear_skill_status(skill_key: str) -> None:
    payload, changed = _read_skill_settings_payload()
    if skill_key in payload["entries"]:
        payload["entries"].pop(skill_key, None)
        changed = True
    if changed:
        write_json_file(SKILL_SETTINGS_PATH, payload)


def delete_skill(skill_key: str) -> None:
    root = user_skill_directory_for(skill_key)
    if root.is_file():
        root.unlink()
    elif root.is_dir():
        shutil.rmtree(root)
    clear_skill_status(skill_key)


def disable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.DISABLED)


def enable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.ACTIVE)


def extract_skill_archive(archive_path: Path, destination: Path) -> Path:
    if not zipfile.is_zipfile(archive_path):
        raise ValueError("Only .zip Skill archives are supported.")
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


def import_skill_from_directory(source_root: Path) -> str:
    skill_file = _find_single_skill_manifest(source_root)
    skill_key = _derive_skill_key(skill_file)
    if official_skill_directory_for(skill_key).exists():
        raise ValueError(f"Skill key '{skill_key}' is already used by an official Skill.")
    destination = _managed_skill_directory_for(skill_key, skill_file)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(skill_file.parent, destination)
    enable_skill(skill_key)
    return skill_key


def _read_skill_settings_payload() -> tuple[dict[str, object], bool]:
    raw_payload = read_json_file(SKILL_SETTINGS_PATH, default=None)
    changed = raw_payload is None
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    if payload.get("schemaVersion") != SKILL_SETTINGS_SCHEMA_VERSION:
        payload = {**payload, "schemaVersion": SKILL_SETTINGS_SCHEMA_VERSION}
        changed = True
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
        changed = True
    payload["entries"] = entries
    return payload, changed


def _normalize_skill_settings_entry(entry: object) -> tuple[dict[str, object], bool]:
    changed = not isinstance(entry, dict)
    payload = dict(entry) if isinstance(entry, dict) else {}
    enabled = payload.get("enabled", True)
    normalized_enabled = enabled if isinstance(enabled, bool) else bool(enabled)
    normalized_entry = {"enabled": normalized_enabled}
    if payload != normalized_entry:
        changed = True
    return normalized_entry, changed


def _find_single_skill_manifest(source_root: Path) -> Path:
    if not source_root.exists():
        raise ValueError("Uploaded Skill source does not exist.")
    native_candidates = [
        path
        for path in source_root.rglob("skill.json")
        if path.is_file() and "__MACOSX" not in path.relative_to(source_root).parts
    ]
    if len(native_candidates) > 1:
        raise ValueError("Uploaded Skill must contain exactly one skill.json file.")
    if native_candidates:
        return native_candidates[0]
    legacy_candidates = [
        path
        for path in source_root.rglob("SKILL.md")
        if path.is_file() and "__MACOSX" not in path.relative_to(source_root).parts
    ]
    if not legacy_candidates:
        raise ValueError("Uploaded Skill must contain one skill.json or SKILL.md file.")
    if len(legacy_candidates) > 1:
        raise ValueError("Uploaded Skill must contain exactly one SKILL.md file.")
    return legacy_candidates[0]


def _derive_skill_key(skill_file: Path) -> str:
    if skill_file.name == "skill.json":
        try:
            payload = json.loads(skill_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Skill manifest '{skill_file}' must be valid JSON.") from exc
        skill_key = str(payload.get("skillKey") or payload.get("skill_key") or skill_file.parent.name).strip()
        return _validate_skill_key(skill_key)
    raw = skill_file.read_text(encoding="utf-8")
    frontmatter = _read_frontmatter(raw, skill_file)
    payload = yaml.safe_load(frontmatter) or {}
    toograph = payload.get("toograph") or {}
    skill_key = str(toograph.get("skill_key") or skill_file.parent.name).strip()
    return _validate_skill_key(skill_key)


def _managed_skill_directory_for(skill_key: str, skill_file: Path) -> Path:
    return user_skill_directory_for(skill_key)


def _validate_skill_key(skill_key: str) -> str:
    if not skill_key or skill_key in {".", ".."} or "/" in skill_key or "\\" in skill_key:
        raise ValueError("Uploaded Skill has an invalid skill key.")
    return skill_key


def _read_frontmatter(raw: str, skill_file: Path) -> str:
    if not raw.startswith("---\n"):
        raise ValueError(f"Skill file '{skill_file}' must start with YAML frontmatter.")
    _, rest = raw.split("---\n", 1)
    marker = "\n---\n"
    if marker not in rest:
        raise ValueError(f"Skill file '{skill_file}' must close YAML frontmatter with '---'.")
    frontmatter, _body = rest.split(marker, 1)
    return frontmatter


def _safe_child_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Uploaded Skill contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Skill contains an unsafe path.")
    return target
