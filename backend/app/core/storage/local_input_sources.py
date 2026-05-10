from __future__ import annotations

from datetime import datetime, timezone
import mimetypes
import os
from pathlib import Path
from typing import Any, Iterable

from app.core.storage.database import BASE_DIR


REPO_ROOT = BASE_DIR.parent.resolve()
LOCAL_INPUT_READ_ROOTS_ENV = "GRAPHITEUI_LOCAL_INPUT_READ_ROOTS"
SKIPPED_DIRECTORY_NAMES = {
    ".git",
    ".hg",
    ".svn",
    ".worktrees",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
}
DENIED_RELATIVE_ROOTS = (
    ".git",
    ".env",
    "backend/data/settings",
)


def list_local_folder(path: str, *, read_roots: Iterable[str | Path] | None = None) -> dict[str, Any]:
    root = resolve_local_input_root(path, read_roots=read_roots)
    if not root.is_dir():
        raise ValueError(f"Local input path is not a folder: {path}")

    entries: list[dict[str, Any]] = []
    for current_dir, dir_names, file_names in os.walk(root):
        current_path = Path(current_dir)
        dir_names[:] = [
            name
            for name in sorted(dir_names)
            if not _should_skip_directory(current_path / name, read_roots=read_roots)
        ]
        for dir_name in dir_names:
            entry_path = current_path / dir_name
            entries.append(_build_directory_entry(root, entry_path))
        for file_name in sorted(file_names):
            file_path = current_path / file_name
            if is_denied_local_input_path(file_path, read_roots=read_roots):
                continue
            entries.append(_build_file_entry(root, file_path))

    return {
        "kind": "local_folder_tree",
        "root": path.strip(),
        "entries": entries,
    }


def read_local_input_file_metadata(
    root: str,
    relative_path: str,
    *,
    read_roots: Iterable[str | Path] | None = None,
) -> dict[str, Any]:
    target = resolve_local_input_file(root, relative_path, read_roots=read_roots)
    stat = target.stat()
    content_type = content_type_for_path(target)
    return {
        "path": _normalize_relative_path(relative_path),
        "name": _normalize_relative_path(relative_path),
        "size": stat.st_size,
        "content_type": content_type,
        "text_like": is_text_like_local_input(target.name, content_type),
        "modified_at": _format_timestamp(stat.st_mtime),
    }


def read_local_input_text_for_prompt(
    root: str,
    relative_path: str,
    *,
    read_roots: Iterable[str | Path] | None = None,
) -> dict[str, Any]:
    metadata = read_local_input_file_metadata(root, relative_path, read_roots=read_roots)
    target = resolve_local_input_file(root, relative_path, read_roots=read_roots)
    payload = target.read_bytes()
    return {
        **metadata,
        "content": payload.decode("utf-8", errors="replace"),
        "truncated": False,
    }


def resolve_local_input_file(
    root: str,
    relative_path: str,
    *,
    read_roots: Iterable[str | Path] | None = None,
) -> Path:
    base = resolve_local_input_root(root, read_roots=read_roots)
    normalized_relative_path = _normalize_relative_path(relative_path)
    target = (base / normalized_relative_path).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise ValueError("Local input file must stay inside the selected folder.") from exc
    if is_denied_local_input_path(target, read_roots=read_roots):
        raise ValueError("Local input file is denied by the read policy.")
    if not target.is_file():
        raise ValueError(f"Local input file does not exist: {relative_path}")
    return target


def resolve_local_input_root(path: str, *, read_roots: Iterable[str | Path] | None = None) -> Path:
    raw_path = str(path or "").strip()
    if not raw_path:
        raise ValueError("Local input folder path cannot be empty.")

    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    resolved = candidate.resolve()
    if not _is_under_any_read_root(resolved, read_roots=read_roots):
        raise ValueError("Local input path is outside configured read roots.")
    if is_denied_local_input_path(resolved, read_roots=read_roots):
        raise ValueError("Local input path is denied by the read policy.")
    return resolved


def is_denied_local_input_path(path: Path, *, read_roots: Iterable[str | Path] | None = None) -> bool:
    resolved = path.resolve()
    if not _is_under_any_read_root(resolved, read_roots=read_roots):
        return True
    if any(part in SKIPPED_DIRECTORY_NAMES for part in _parts_inside_read_root(resolved, read_roots=read_roots)):
        return True
    for denied_root in _denied_roots():
        if _is_relative_to(resolved, denied_root):
            return True
    return False


def content_type_for_path(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def is_text_like_local_input(file_name: str, content_type: str) -> bool:
    normalized_type = content_type.lower().strip()
    if normalized_type.startswith("text/"):
        return True
    if normalized_type in {
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/x-ndjson",
        "application/yaml",
        "application/x-yaml",
        "application/toml",
    }:
        return True
    if normalized_type.endswith("+json") or normalized_type.endswith("+xml"):
        return True
    return file_name.lower().endswith(
        (
            ".txt",
            ".md",
            ".markdown",
            ".csv",
            ".tsv",
            ".json",
            ".jsonl",
            ".yaml",
            ".yml",
            ".xml",
            ".html",
            ".htm",
            ".css",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".py",
            ".java",
            ".c",
            ".cc",
            ".cpp",
            ".h",
            ".hpp",
            ".cs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".sh",
            ".bash",
            ".zsh",
            ".fish",
            ".bat",
            ".cmd",
            ".ps1",
            ".sql",
            ".log",
            ".ini",
            ".toml",
            ".env",
            ".gitignore",
        )
    )


def _build_directory_entry(root: Path, path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "path": path.relative_to(root).as_posix(),
        "name": path.name,
        "type": "directory",
        "size": 0,
        "modified_at": _format_timestamp(stat.st_mtime),
        "content_type": "inode/directory",
        "text_like": False,
    }


def _build_file_entry(root: Path, path: Path) -> dict[str, Any]:
    stat = path.stat()
    content_type = content_type_for_path(path)
    return {
        "path": path.relative_to(root).as_posix(),
        "name": path.name,
        "type": "file",
        "size": stat.st_size,
        "modified_at": _format_timestamp(stat.st_mtime),
        "content_type": content_type,
        "text_like": is_text_like_local_input(path.name, content_type),
    }


def _should_skip_directory(path: Path, *, read_roots: Iterable[str | Path] | None) -> bool:
    return path.name in SKIPPED_DIRECTORY_NAMES or is_denied_local_input_path(path, read_roots=read_roots)


def _normalize_relative_path(value: str) -> str:
    normalized = str(value or "").replace("\\", "/").strip().strip("/")
    if not normalized:
        raise ValueError("Local input relative file path cannot be empty.")
    parts = Path(normalized).parts
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError("Local input relative file path cannot contain traversal segments.")
    if Path(normalized).is_absolute():
        raise ValueError("Local input relative file path cannot be absolute.")
    return normalized


def _read_roots(read_roots: Iterable[str | Path] | None) -> list[Path]:
    if read_roots is not None:
        roots = [Path(root).expanduser().resolve() for root in read_roots]
    else:
        configured = os.environ.get(LOCAL_INPUT_READ_ROOTS_ENV, "").strip()
        roots = [
            Path(item).expanduser().resolve()
            for item in configured.split(os.pathsep)
            if item.strip()
        ]
        if not roots:
            roots = [REPO_ROOT]
    return roots


def _denied_roots() -> list[Path]:
    roots: list[Path] = []
    for denied in DENIED_RELATIVE_ROOTS:
        path = Path(denied).expanduser()
        roots.append(path.resolve() if path.is_absolute() else (REPO_ROOT / path).resolve())
    return roots


def _is_under_any_read_root(path: Path, *, read_roots: Iterable[str | Path] | None) -> bool:
    return any(_is_relative_to(path, root) for root in _read_roots(read_roots))


def _parts_inside_read_root(path: Path, *, read_roots: Iterable[str | Path] | None) -> tuple[str, ...]:
    resolved = path.resolve()
    for root in _read_roots(read_roots):
        try:
            relative = resolved.relative_to(root.resolve())
        except ValueError:
            continue
        return () if str(relative) == "." else relative.parts
    return resolved.parts


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _format_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
