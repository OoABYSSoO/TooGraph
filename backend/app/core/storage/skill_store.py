from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

import yaml

from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.database import SKILL_STATE_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[4]
GRAPHITE_SKILLS_DIR = ROOT_DIR / "skill"
SKILL_STATE_PATH = SKILL_STATE_DATA_DIR / "registry_states.json"


def graphite_managed_skill_path_for(skill_key: str) -> Path:
    return GRAPHITE_SKILLS_DIR / "claude_code" / skill_key / "SKILL.md"


def graphite_native_skill_path_for(skill_key: str) -> Path:
    return GRAPHITE_SKILLS_DIR / "graphite" / skill_key / "skill.json"


def list_managed_skill_keys() -> set[str]:
    claude_root = GRAPHITE_SKILLS_DIR / "claude_code"
    graphite_root = GRAPHITE_SKILLS_DIR / "graphite"
    keys: set[str] = set()
    if claude_root.exists():
        keys.update(path.parent.name for path in claude_root.glob("*/SKILL.md"))
    if graphite_root.exists():
        keys.update(path.parent.name for path in graphite_root.glob("*/skill.json"))
    return keys


def get_skill_status_map() -> dict[str, SkillCatalogStatus]:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    return {
        str(skill_key): SkillCatalogStatus(str(status))
        for skill_key, status in payload.items()
    }


def set_skill_status(skill_key: str, status: SkillCatalogStatus) -> None:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    payload[skill_key] = status.value
    write_json_file(SKILL_STATE_PATH, payload)


def clear_skill_status(skill_key: str) -> None:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    if skill_key in payload:
        payload.pop(skill_key, None)
        write_json_file(SKILL_STATE_PATH, payload)


def delete_skill(skill_key: str) -> None:
    for root in [
        GRAPHITE_SKILLS_DIR / "claude_code" / skill_key,
        GRAPHITE_SKILLS_DIR / "openclaw" / skill_key,
        GRAPHITE_SKILLS_DIR / "codex" / skill_key,
        GRAPHITE_SKILLS_DIR / "graphite" / skill_key,
    ]:
        if root.is_file():
            root.unlink()
        elif root.is_dir():
            shutil.rmtree(root)
    clear_skill_status(skill_key)


def disable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.DISABLED)


def enable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.ACTIVE)


def import_skill_from_source(skill_key: str, source_path: str) -> Path:
    source = Path(source_path)
    destination = graphite_native_skill_path_for(skill_key) if source.name == "skill.json" else graphite_managed_skill_path_for(skill_key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_dir = source.parent if source.is_file() else source
    shutil.copytree(source_dir, destination.parent, dirs_exist_ok=True)
    enable_skill(skill_key)
    return destination


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
    destination = _managed_skill_directory_for(skill_key, skill_file)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(skill_file.parent, destination)
    enable_skill(skill_key)
    return skill_key


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
    graphite = payload.get("graphite") or {}
    skill_key = str(graphite.get("skill_key") or skill_file.parent.name).strip()
    return _validate_skill_key(skill_key)


def _managed_skill_directory_for(skill_key: str, skill_file: Path) -> Path:
    if skill_file.name == "skill.json":
        return graphite_native_skill_path_for(skill_key).parent
    return graphite_managed_skill_path_for(skill_key).parent


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
