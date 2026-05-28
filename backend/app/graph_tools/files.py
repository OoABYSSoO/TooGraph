from __future__ import annotations

from pathlib import Path, PurePosixPath

from app.core.schemas.tools import ToolDefinition, ToolFileContentResponse, ToolFileNode, ToolFileTreeResponse


MAX_PREVIEW_BYTES = 128 * 1024
IGNORED_NAMES = {"__pycache__", ".DS_Store"}
EXECUTABLE_SUFFIXES = {".py", ".js", ".mjs", ".ts", ".tsx", ".sh", ".bat", ".ps1"}
LANGUAGE_BY_SUFFIX = {
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".sh": "shell",
    ".bat": "batch",
    ".ps1": "powershell",
    ".txt": "text",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".html": "html",
    ".css": "css",
}


def build_tool_file_tree(definition: ToolDefinition) -> ToolFileTreeResponse:
    root = _resolve_tool_root(definition)
    return ToolFileTreeResponse(
        toolKey=definition.tool_key,
        root=_build_node(root=root, path=root),
    )


def read_tool_file_content(definition: ToolDefinition, relative_path: str) -> ToolFileContentResponse:
    root = _resolve_tool_root(definition)
    target = _safe_tool_child_path(root, relative_path)
    if not target.exists() or not target.is_file():
        raise FileNotFoundError("Tool file does not exist.")

    stat = target.stat()
    language = _detect_language(target)
    executable = target.suffix.lower() in EXECUTABLE_SUFFIXES
    previewable = _is_previewable(target, stat.st_size)
    relative = _relative_posix(root, target)
    if stat.st_size > MAX_PREVIEW_BYTES:
        return ToolFileContentResponse(
            toolKey=definition.tool_key,
            path=relative,
            name=target.name,
            size=stat.st_size,
            language=language,
            previewable=False,
            executable=executable,
            encoding="too_large",
            content=None,
        )
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ToolFileContentResponse(
            toolKey=definition.tool_key,
            path=relative,
            name=target.name,
            size=stat.st_size,
            language=language,
            previewable=False,
            executable=executable,
            encoding="binary",
            content=None,
        )
    return ToolFileContentResponse(
        toolKey=definition.tool_key,
        path=relative,
        name=target.name,
        size=stat.st_size,
        language=language,
        previewable=previewable,
        executable=executable,
        encoding="utf-8",
        content=content,
    )


def _resolve_tool_root(definition: ToolDefinition) -> Path:
    source_path = Path(definition.source_path)
    if not source_path.exists():
        raise FileNotFoundError("Tool source path does not exist.")
    return source_path.parent if source_path.is_file() else source_path


def _build_node(*, root: Path, path: Path) -> ToolFileNode:
    relative = _relative_posix(root, path)
    if path.is_dir():
        children = [
            _build_node(root=root, path=child)
            for child in sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
            if child.name not in IGNORED_NAMES
        ]
        return ToolFileNode(name=path.name, path=relative, type="directory", children=children)
    stat = path.stat()
    return ToolFileNode(
        name=path.name,
        path=relative,
        type="file",
        size=stat.st_size,
        language=_detect_language(path),
        previewable=_is_previewable(path, stat.st_size),
        executable=path.suffix.lower() in EXECUTABLE_SUFFIXES,
    )


def _safe_tool_child_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Tool file path is unsafe.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Tool file path is unsafe.")
    return target


def _relative_posix(root: Path, path: Path) -> str:
    if path == root:
        return ""
    return path.relative_to(root).as_posix()


def _detect_language(path: Path) -> str:
    if path.name == "tool.json":
        return "json"
    return LANGUAGE_BY_SUFFIX.get(path.suffix.lower(), "")


def _is_previewable(path: Path, size: int) -> bool:
    if size > MAX_PREVIEW_BYTES:
        return False
    return _detect_language(path) != "" or path.name == "tool.json"
