from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any
from uuid import uuid4


DEFAULT_ALLOWED_ROOTS = (
    "backend/data/companion",
    "backend/data/agent_memory",
    "backend/data/graph_memory",
    "backend/data/skill_artifacts",
)
DENIED_SEGMENTS = {".git", ".worktrees", "node_modules", "dist", "__pycache__"}
DENIED_PREFIXES = ("backend/data/settings",)
DENIED_BASENAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".npmrc",
    ".pypirc",
    ".netrc",
}
SECTION_TAG_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")


class SkillError(Exception):
    pass


def main() -> None:
    payload = _read_stdin_payload()
    operation = str(payload.get("operation") or "").strip().lower()
    try:
        if operation == "read_json":
            result = read_json_operation(payload)
        elif operation == "read_text":
            result = read_text_operation(payload)
        elif operation == "write_json":
            result = write_json_operation(payload)
        elif operation == "write_text":
            result = write_text_operation(payload)
        else:
            raise SkillError(f"Unsupported operation: {operation or '<empty>'}")
    except Exception as exc:
        result = {"status": "failed", "error": str(exc)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


def read_json_operation(payload: dict[str, Any]) -> dict[str, Any]:
    target, normalized_path = resolve_target_path(payload.get("path"), payload)
    exists = target.is_file()
    if exists:
        value = json.loads(target.read_text(encoding="utf-8"))
    else:
        value = deepcopy(payload.get("default_value"))
    content = json.dumps(value, ensure_ascii=False, indent=2)
    return {
        "status": "succeeded",
        "path": normalized_path,
        "exists": exists,
        "content": content,
        "json_content": value,
        "prompt_section": build_prompt_section(value, content, payload),
        "warnings": [],
    }


def read_text_operation(payload: dict[str, Any]) -> dict[str, Any]:
    target, normalized_path = resolve_target_path(payload.get("path"), payload)
    exists = target.is_file()
    if exists:
        content = target.read_text(encoding="utf-8")
    else:
        content = "" if payload.get("default_value") is None else str(payload.get("default_value"))
    return {
        "status": "succeeded",
        "path": normalized_path,
        "exists": exists,
        "content": content,
        "json_content": None,
        "prompt_section": build_prompt_section(content, content, payload),
        "warnings": [],
    }


def write_json_operation(payload: dict[str, Any]) -> dict[str, Any]:
    target, normalized_path = resolve_target_path(payload.get("path"), payload, for_write=True)
    content = coerce_json_content(payload.get("content"))
    previous_value = read_existing_json(target)
    revision = write_revision_if_requested(payload, previous_value=previous_value, next_value=content)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return write_success_result(
        normalized_path,
        content=json.dumps(content, ensure_ascii=False, indent=2),
        json_content=content,
        revision=revision,
    )


def write_text_operation(payload: dict[str, Any]) -> dict[str, Any]:
    target, normalized_path = resolve_target_path(payload.get("path"), payload, for_write=True)
    content = "" if payload.get("content") is None else str(payload.get("content"))
    previous_value = target.read_text(encoding="utf-8") if target.is_file() else None
    revision = write_revision_if_requested(payload, previous_value=previous_value, next_value=content)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return write_success_result(normalized_path, content=content, json_content=None, revision=revision)


def write_success_result(
    normalized_path: str,
    *,
    content: str,
    json_content: Any,
    revision: dict[str, Any] | None,
) -> dict[str, Any]:
    write_result = {
        "path": normalized_path,
        "bytes": len(content.encode("utf-8")),
        "revision_id": revision.get("revision_id") if isinstance(revision, dict) else None,
    }
    return {
        "status": "succeeded",
        "path": normalized_path,
        "content": content,
        "json_content": json_content,
        "write_result": write_result,
        "revision": revision,
        "warnings": [],
    }


def resolve_target_path(raw_path: Any, payload: dict[str, Any], *, for_write: bool = False) -> tuple[Path, str]:
    normalized_path = normalize_repo_relative_path(raw_path)
    root = repo_root()
    target = root / Path(*PurePosixPath(normalized_path).parts)
    allowed_roots = resolve_allowed_roots(payload)
    resolved_target = target.resolve(strict=target.exists())

    if for_write and target.exists() and target.is_symlink():
        raise SkillError("Path points to a symlink and cannot be written.")

    if not any(is_relative_to(resolved_target, allowed_root) for allowed_root in allowed_roots):
        raise SkillError("Path is outside the local file allowlist.")

    parent = target.parent
    resolved_parent = parent.resolve(strict=parent.exists())
    if not any(is_relative_to(resolved_parent, allowed_root) for allowed_root in allowed_roots):
        raise SkillError("Path parent is outside the local file allowlist.")

    return target, normalized_path


def normalize_repo_relative_path(raw_path: Any) -> str:
    value = str(raw_path or "").strip().replace("\\", "/")
    if not value:
        raise SkillError("Path is required.")
    path = PurePosixPath(value)
    if path.is_absolute():
        raise SkillError("Path must be repository-relative.")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise SkillError("Path cannot contain empty, '.', or '..' segments.")
    if any(part in DENIED_SEGMENTS for part in path.parts):
        raise SkillError("Path contains a denied directory segment.")

    normalized = "/".join(path.parts)
    lowered = normalized.lower()
    basename = path.name.lower()
    if basename in DENIED_BASENAMES or basename.startswith(".dev_") or basename.endswith(".log"):
        raise SkillError("Path is outside the local file allowlist.")
    for prefix in DENIED_PREFIXES:
        if lowered == prefix or lowered.startswith(f"{prefix}/"):
            raise SkillError("Path is outside the local file allowlist.")
    return normalized


def resolve_allowed_roots(payload: dict[str, Any]) -> list[Path]:
    root = repo_root()
    requested_roots = parse_requested_roots(payload.get("allowed_roots"))
    if not requested_roots:
        requested_roots = list(DEFAULT_ALLOWED_ROOTS)

    built_in_roots = [
        (root / Path(*PurePosixPath(item).parts)).resolve(strict=False)
        for item in DEFAULT_ALLOWED_ROOTS
    ]
    resolved_roots: list[Path] = []
    for requested in requested_roots:
        normalized = normalize_repo_relative_path(requested)
        candidate = (root / Path(*PurePosixPath(normalized).parts)).resolve(strict=False)
        if not any(is_relative_to(candidate, built_in_root) for built_in_root in built_in_roots):
            raise SkillError("Allowed root is outside the built-in local file allowlist.")
        resolved_roots.append(candidate)
    return resolved_roots


def parse_requested_roots(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise SkillError(f"allowed_roots must be a JSON array or delimited string: {exc}") from exc
            if not isinstance(parsed, list):
                raise SkillError("allowed_roots JSON value must be an array.")
            return [str(item) for item in parsed if str(item).strip()]
        return [part.strip() for part in re.split(r"[\n,;]+", stripped) if part.strip()]
    raise SkillError("allowed_roots must be a list or string.")


def build_prompt_section(value: Any, content: str, payload: dict[str, Any]) -> str:
    body = prompt_body(value, content, payload)
    tag = str(payload.get("section_tag") or "").strip()
    if not tag:
        return body
    if SECTION_TAG_RE.fullmatch(tag) is None:
        raise SkillError("section_tag must be a short alphanumeric tag name.")
    return f"<{tag}>\n{body}\n</{tag}>"


def prompt_body(value: Any, content: str, payload: dict[str, Any]) -> str:
    empty_message = str(payload.get("empty_message") or "").strip()
    if empty_message and is_empty_value(value):
        return empty_message
    return content


def is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (list, dict, str)):
        return len(value) == 0
    return False


def coerce_json_content(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise SkillError(f"write_json content must be valid JSON: {exc}") from exc
    return value


def read_existing_json(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def write_revision_if_requested(
    payload: dict[str, Any],
    *,
    previous_value: Any,
    next_value: Any,
) -> dict[str, Any] | None:
    raw_revision_path = str(payload.get("revision_path") or "").strip()
    if not raw_revision_path:
        return None

    revision_path, normalized_revision_path = resolve_target_path(raw_revision_path, payload, for_write=True)
    revisions = read_existing_json(revision_path)
    if not isinstance(revisions, list):
        revisions = []

    revision = {
        "revision_id": f"rev_{uuid4().hex[:12]}",
        "target_type": str(payload.get("revision_target_type") or "file").strip() or "file",
        "target_id": str(payload.get("revision_target_id") or payload.get("path") or "file").strip() or "file",
        "operation": str(payload.get("revision_operation") or ("update" if previous_value is not None else "create")),
        "previous_value": previous_value,
        "next_value": next_value,
        "changed_by": str(payload.get("changed_by") or "local_file_skill").strip() or "local_file_skill",
        "change_reason": str(payload.get("change_reason") or "Local file skill write.").strip(),
        "path": normalize_repo_relative_path(payload.get("path")),
        "revision_path": normalized_revision_path,
        "created_at": utc_now_iso(),
    }
    revisions.append(revision)
    revision_path.parent.mkdir(parents=True, exist_ok=True)
    revision_path.write_text(json.dumps(revisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return revision


def repo_root() -> Path:
    override = str(os.environ.get("GRAPHITE_REPO_ROOT") or "").strip()
    if override:
        return Path(override).resolve()
    skill_dir = Path(os.environ.get("GRAPHITE_SKILL_DIR") or Path(__file__).resolve().parent).resolve()
    return skill_dir.parents[1]


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_stdin_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


if __name__ == "__main__":
    main()
