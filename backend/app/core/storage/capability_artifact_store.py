from __future__ import annotations

import mimetypes
from pathlib import Path, PurePosixPath
import re
from typing import Any
from uuid import uuid4

from app.core.storage.database import DATA_DIR


CAPABILITY_ARTIFACT_DATA_DIR = DATA_DIR / "outputs" / "capability_artifacts"
MAX_CAPABILITY_ARTIFACT_READ_BYTES = 2_000_000


def create_capability_artifact_context(
    *,
    run_id: str,
    node_id: str,
    invocation_index: int,
    action_key: str = "",
    capability_kind: str = "action",
    capability_key: str = "",
) -> dict[str, Any]:
    resolved_capability_key = str(capability_key or action_key or "capability")
    resolved_capability_kind = str(capability_kind or "capability")
    relative_dir = "/".join(
        [
            _safe_segment(run_id, fallback="run"),
            _safe_segment(node_id, fallback="node"),
            _safe_segment(resolved_capability_key, fallback=resolved_capability_kind),
            f"invocation_{max(1, invocation_index):03d}",
        ]
    )
    artifact_dir = resolve_capability_artifact_path(relative_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return {
        "run_id": run_id,
        "node_id": node_id,
        "capability_kind": resolved_capability_kind,
        "capability_key": resolved_capability_key,
        "invocation_index": max(1, invocation_index),
        "artifact_dir": str(artifact_dir),
        "artifact_relative_dir": relative_dir,
    }


def read_capability_artifact_text(relative_path: str) -> dict[str, Any]:
    return _read_capability_artifact_text(relative_path, max_bytes=MAX_CAPABILITY_ARTIFACT_READ_BYTES)


def read_capability_artifact_text_for_prompt(relative_path: str) -> dict[str, Any]:
    return _read_capability_artifact_text(relative_path, max_bytes=None)


def _read_capability_artifact_text(relative_path: str, *, max_bytes: int | None) -> dict[str, Any]:
    normalized_path = normalize_capability_artifact_relative_path(relative_path)
    target = resolve_capability_artifact_path(normalized_path)
    try:
        if not target.is_file():
            raise FileNotFoundError(f"Capability artifact '{normalized_path}' does not exist.")
        size = target.stat().st_size
    except OSError as exc:
        raise FileNotFoundError(f"Capability artifact '{normalized_path}' does not exist.") from exc
    if max_bytes is not None and size > max_bytes:
        raise ValueError(f"Capability artifact '{normalized_path}' is too large to preview.")
    content_type = _guess_text_content_type(target)
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise FileNotFoundError(f"Capability artifact '{normalized_path}' does not exist.") from exc
    return {
        "path": normalized_path,
        "name": target.name,
        "size": size,
        "content_type": content_type,
        "content": content,
    }


def read_capability_artifact_file_metadata(relative_path: str) -> dict[str, Any]:
    normalized_path = normalize_capability_artifact_relative_path(relative_path)
    target = resolve_capability_artifact_path(normalized_path)
    try:
        if not target.is_file():
            raise FileNotFoundError(f"Capability artifact '{normalized_path}' does not exist.")
        size = target.stat().st_size
    except OSError as exc:
        raise FileNotFoundError(f"Capability artifact '{normalized_path}' does not exist.") from exc
    return {
        "path": normalized_path,
        "name": target.name,
        "size": size,
        "content_type": mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        "filesystem_path": target,
    }


def create_uploaded_capability_artifact(*, file_name: str, content_type: str, payload: bytes) -> dict[str, Any]:
    safe_name = _safe_upload_filename(file_name)
    relative_path = f"uploads/{uuid4().hex[:12]}-{safe_name}"
    target = resolve_capability_artifact_path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    stored_type = content_type.strip() or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    return {
        "local_path": relative_path,
        "filename": safe_name,
        "content_type": stored_type,
        "size": len(payload),
    }


def resolve_capability_artifact_path(relative_path: str) -> Path:
    normalized_path = normalize_capability_artifact_relative_path(relative_path)
    root = CAPABILITY_ARTIFACT_DATA_DIR.resolve()
    target = (root / Path(*PurePosixPath(normalized_path).parts)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Capability artifact path must stay inside the capability artifact folder.")
    return target


def normalize_capability_artifact_relative_path(relative_path: str) -> str:
    normalized = str(relative_path or "").strip().replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Capability artifact path must stay inside the capability artifact folder.")
    return "/".join(path.parts)


def _safe_segment(value: str, *, fallback: str) -> str:
    segment = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "").strip()).strip("._-")
    return segment or fallback


def _safe_upload_filename(value: str) -> str:
    filename = Path(str(value or "").replace("\\", "/")).name.strip()
    filename = re.sub(r"[^A-Za-z0-9_. -]+", "_", filename).strip(" ._-")
    return filename or "upload.bin"


def _guess_text_content_type(path: Path) -> str:
    if path.suffix.lower() in {".md", ".markdown"}:
        return "text/markdown"
    guessed = mimetypes.guess_type(path.name)[0]
    if guessed and (guessed.startswith("text/") or guessed in {"application/json"}):
        return guessed
    return "text/plain"
