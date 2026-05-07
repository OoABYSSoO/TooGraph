from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any, Literal

from app.core.storage.database import SETTINGS_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


LOCAL_EXECUTOR_POLICY_PATH = SETTINGS_DATA_DIR / "security" / "local_executor_policy.json"
POLICY_ROOT_KINDS = {"read": "read_roots", "write": "write_roots", "execute": "execute_roots"}
DEFAULT_LOCAL_EXECUTOR_POLICY: dict[str, Any] = {
    "read_roots": ["."],
    "write_roots": ["backend/data"],
    "execute_roots": ["backend/data/skills/user", "backend/data/tmp"],
    "denied_roots": [".git", ".env", "backend/data/settings/security"],
    "allowed_commands": ["python", "python3", "node", "npm", "bash", "sh", "pwsh", "powershell", "cmd"],
    "allowed_script_extensions": [".py", ".js", ".mjs", ".sh", ".bat", ".ps1"],
}


def load_local_executor_policy() -> dict[str, Any]:
    payload = read_json_file(LOCAL_EXECUTOR_POLICY_PATH, default={}) or {}
    return normalize_local_executor_policy(payload)


def save_local_executor_policy(policy: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_local_executor_policy(policy)
    LOCAL_EXECUTOR_POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_json_file(LOCAL_EXECUTOR_POLICY_PATH, normalized)
    return normalized


def add_local_executor_allowed_root(*, kind: Literal["read", "write", "execute"], path: str) -> dict[str, Any]:
    target_key = POLICY_ROOT_KINDS[kind]
    normalized_path = normalize_policy_relative_path(path)
    policy = load_local_executor_policy()
    if _path_matches_any_root(normalized_path, policy["denied_roots"]):
        raise ValueError(f"Path '{normalized_path}' is protected and cannot be added to the local executor policy.")
    roots = list(policy[target_key])
    if normalized_path not in roots:
        roots.append(normalized_path)
        policy[target_key] = roots
    return save_local_executor_policy(policy)


def normalize_local_executor_policy(payload: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, fallback in DEFAULT_LOCAL_EXECUTOR_POLICY.items():
        normalized[key] = _normalize_string_list(payload.get(key), fallback)
    for protected in DEFAULT_LOCAL_EXECUTOR_POLICY["denied_roots"]:
        if protected not in normalized["denied_roots"]:
            normalized["denied_roots"].append(protected)
    return normalized


def normalize_policy_relative_path(path: str) -> str:
    normalized = str(path or "").strip().replace("\\", "/").strip("/")
    if normalized == ".":
        return "."
    parsed = PurePosixPath(normalized)
    if parsed.is_absolute() or not parsed.parts or any(part in {"", ".", ".."} for part in parsed.parts):
        raise ValueError("Policy path must be a relative path inside the GraphiteUI workspace.")
    return "/".join(parsed.parts)


def _normalize_string_list(value: Any, fallback: list[str]) -> list[str]:
    items = value if isinstance(value, list) else fallback
    result: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def _path_matches_any_root(path: str, roots: list[str]) -> bool:
    return any(path == root or path.startswith(f"{root.rstrip('/')}/") for root in roots)
