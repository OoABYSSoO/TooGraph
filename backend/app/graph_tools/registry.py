from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from app.core.storage.tool_store import OFFICIAL_TOOLS_DIR, USER_TOOLS_DIR
from app.graph_tools.runtime import build_script_tool_runner, validate_tool_runtime_spec


ToolFunc = Any


def _build_runtime_tool_registry() -> dict[str, ToolFunc]:
    registry: dict[str, ToolFunc] = {}
    for tool_dir in _iter_tool_dirs([OFFICIAL_TOOLS_DIR, USER_TOOLS_DIR]):
        manifest = tool_dir / "tool.json"
        if not manifest.is_file():
            continue
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if any(key in payload for key in ("skillKey", "skill_key", "actionKey", "action_key")):
            continue
        tool_key = str(payload.get("toolKey") or payload.get("tool_key") or tool_dir.name).strip()
        runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
        runtime_type = str(runtime.get("type") or "none")
        entrypoint = str(runtime.get("entrypoint") or "")
        command = [str(item) for item in runtime.get("command") or []]
        timeout_seconds = (
            runtime.get("timeoutSeconds")
            or runtime.get("timeout_seconds")
            or payload.get("timeoutSeconds")
            or payload.get("timeout_seconds")
        )
        if validate_tool_runtime_spec(
            tool_dir=tool_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
        ):
            continue
        if tool_key in registry:
            continue
        registry[tool_key] = build_script_tool_runner(
            tool_key=tool_key,
            tool_dir=tool_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
            timeout_seconds=timeout_seconds,
        )
    return registry


def _iter_tool_dirs(roots: Iterable[Path]) -> list[Path]:
    tool_dirs: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        tool_dirs.extend(sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower()))
    return tool_dirs


def list_runtime_tool_keys() -> set[str]:
    return set(_build_runtime_tool_registry().keys())


def get_tool_registry(*, include_disabled: bool = False) -> dict[str, ToolFunc]:
    _ = include_disabled
    return _build_runtime_tool_registry()
