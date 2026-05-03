from __future__ import annotations

import mimetypes
from pathlib import Path, PurePosixPath
import re
from typing import Any

from app.core.storage.database import DATA_DIR


SKILL_ARTIFACT_DATA_DIR = DATA_DIR / "outputs" / "skill_artifacts"
MAX_SKILL_ARTIFACT_READ_BYTES = 2_000_000


def create_skill_artifact_context(
    *,
    run_id: str,
    node_id: str,
    skill_key: str,
    invocation_index: int,
) -> dict[str, Any]:
    relative_dir = "/".join(
        [
            _safe_segment(run_id, fallback="run"),
            _safe_segment(node_id, fallback="node"),
            _safe_segment(skill_key, fallback="skill"),
            f"invocation_{max(1, invocation_index):03d}",
        ]
    )
    artifact_dir = resolve_skill_artifact_path(relative_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return {
        "run_id": run_id,
        "node_id": node_id,
        "skill_key": skill_key,
        "invocation_index": max(1, invocation_index),
        "artifact_dir": str(artifact_dir),
        "artifact_relative_dir": relative_dir,
    }


def read_skill_artifact_text(relative_path: str) -> dict[str, Any]:
    normalized_path = normalize_skill_artifact_relative_path(relative_path)
    target = resolve_skill_artifact_path(normalized_path)
    if not target.is_file():
        raise FileNotFoundError(f"Skill artifact '{normalized_path}' does not exist.")
    size = target.stat().st_size
    if size > MAX_SKILL_ARTIFACT_READ_BYTES:
        raise ValueError(f"Skill artifact '{normalized_path}' is too large to preview.")
    content_type = _guess_text_content_type(target)
    return {
        "path": normalized_path,
        "name": target.name,
        "size": size,
        "content_type": content_type,
        "content": target.read_text(encoding="utf-8", errors="replace"),
    }


def resolve_skill_artifact_path(relative_path: str) -> Path:
    normalized_path = normalize_skill_artifact_relative_path(relative_path)
    root = SKILL_ARTIFACT_DATA_DIR.resolve()
    target = (root / Path(*PurePosixPath(normalized_path).parts)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Skill artifact path must stay inside the skill artifact folder.")
    return target


def normalize_skill_artifact_relative_path(relative_path: str) -> str:
    normalized = str(relative_path or "").strip().replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Skill artifact path must stay inside the skill artifact folder.")
    return "/".join(path.parts)


def _safe_segment(value: str, *, fallback: str) -> str:
    segment = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "").strip()).strip("._-")
    return segment or fallback


def _guess_text_content_type(path: Path) -> str:
    if path.suffix.lower() in {".md", ".markdown"}:
        return "text/markdown"
    guessed = mimetypes.guess_type(path.name)[0]
    if guessed and (guessed.startswith("text/") or guessed in {"application/json"}):
        return guessed
    return "text/plain"
