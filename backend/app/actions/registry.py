from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from app.core.schemas.actions import ActionCatalogStatus
from app.core.storage.action_store import (
    OFFICIAL_ACTIONS_DIR,
    USER_ACTIONS_DIR,
    get_action_status_map,
    list_managed_action_keys,
)
from app.actions.runtime import (
    ScriptActionRunner,
    build_lifecycle_after_llm_action_runner,
    build_script_action_runner,
    has_lifecycle_after_llm,
    validate_script_runtime_spec,
)


ActionFunc = ScriptActionRunner


def _build_runtime_action_registry() -> dict[str, ActionFunc]:
    registry: dict[str, ActionFunc] = {}
    for action_dir in _iter_action_dirs([OFFICIAL_ACTIONS_DIR, USER_ACTIONS_DIR]):
        manifest = action_dir / "action.json"
        if not manifest.is_file():
            continue
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if "skillKey" in payload or "skill_key" in payload:
            continue
        action_key = str(payload.get("actionKey") or payload.get("action_key") or action_dir.name).strip()
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
        if has_lifecycle_after_llm(action_dir):
            if action_key in registry:
                continue
            registry[action_key] = build_lifecycle_after_llm_action_runner(
                action_key=action_key,
                action_dir=action_dir,
                timeout_seconds=timeout_seconds,
            )
            continue
        if validate_script_runtime_spec(
            action_dir=action_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
        ):
            continue
        if action_key in registry:
            continue
        registry[action_key] = build_script_action_runner(
            action_key=action_key,
            action_dir=action_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
            timeout_seconds=timeout_seconds,
        )
    return registry


def _iter_action_dirs(roots: Iterable[Path]) -> list[Path]:
    action_dirs: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        action_dirs.extend(
            sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower())
        )
    return action_dirs


def list_runtime_action_keys() -> set[str]:
    return set(_build_runtime_action_registry().keys())


def get_action_registry(*, include_disabled: bool = False) -> dict[str, ActionFunc]:
    registry = _build_runtime_action_registry()
    if include_disabled:
        allowed_keys = list_managed_action_keys()
        return {key: value for key, value in registry.items() if key in allowed_keys}
    status_map = get_action_status_map()
    return {
        key: value
        for key, value in registry.items()
        if status_map.get(key, ActionCatalogStatus.ACTIVE) == ActionCatalogStatus.ACTIVE
    }
