from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


MAX_CONTENT_CHARS = 200_000
MAX_OUTPUT_CHARS = 200_000
DEFAULT_TIMEOUT_SECONDS = 30
MAX_TIMEOUT_SECONDS = 120

READ_ROOTS = ["backend/data", "skill", "docs", "README.md", "AGENTS.md"]
WRITE_ROOTS = ["backend/data"]
EXECUTE_ROOTS = ["backend/data/tmp", "backend/data/skills/user"]
DENIED_ROOTS = [".git", ".env", "backend/data/settings"]
EXECUTE_EXTENSIONS = {".py", ".js", ".mjs", ".sh", ".bat", ".ps1"}


def local_workspace_executor(**skill_inputs: Any) -> dict[str, Any]:
    action = _as_text(skill_inputs.get("action")).strip().lower()
    repo_root = _repo_root()
    if action == "read":
        return _read_file(repo_root, skill_inputs)
    if action == "list":
        return _list_directory(repo_root, skill_inputs)
    if action in {"write", "append"}:
        return _write_file(repo_root, skill_inputs, append=action == "append")
    if action == "execute":
        return _execute_script(repo_root, skill_inputs)
    return _failed(action or "unknown", "", "invalid_action", "action must be one of read, list, write, append, execute.")


def _read_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    action = "read"
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(action, _as_text(payload.get("path")), target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed(action, _display_path(repo_root, target), "not_found", "Path is not a file.")
    content = target.read_text(encoding="utf-8", errors="replace")
    truncated = content[:MAX_CONTENT_CHARS]
    return _success(
        action=action,
        path=_display_path(repo_root, target),
        summary=f"Read `{_display_path(repo_root, target)}` ({len(content)} characters).",
        content=truncated,
        errors=[] if len(content) <= MAX_CONTENT_CHARS else [{"type": "truncated", "message": "Content was truncated."}],
    )


def _list_directory(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    action = "list"
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(action, _as_text(payload.get("path")), target_result["type"], target_result["message"])
    target = target_result
    if not target.is_dir():
        return _failed(action, _display_path(repo_root, target), "not_found", "Path is not a directory.")
    entries = []
    for child in sorted(target.iterdir(), key=lambda item: item.name.lower()):
        entries.append(
            {
                "name": child.name,
                "path": _display_path(repo_root, child),
                "type": "directory" if child.is_dir() else "file",
                "size": child.stat().st_size if child.is_file() else 0,
            }
        )
    return _success(
        action=action,
        path=_display_path(repo_root, target),
        summary=f"Listed `{_display_path(repo_root, target)}` ({len(entries)} entries).",
        entries=entries,
    )


def _write_file(repo_root: Path, payload: dict[str, Any], *, append: bool) -> dict[str, Any]:
    action = "append" if append else "write"
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), WRITE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(action, _as_text(payload.get("path")), target_result["type"], target_result["message"])
    target = target_result
    content = _as_text(payload.get("content"))
    target.parent.mkdir(parents=True, exist_ok=True)
    if append:
        with target.open("a", encoding="utf-8") as handle:
            handle.write(content)
    else:
        target.write_text(content, encoding="utf-8")
    verb = "Appended to" if append else "Wrote"
    return _success(
        action=action,
        path=_display_path(repo_root, target),
        summary=f"{verb} `{_display_path(repo_root, target)}` ({len(content)} characters).",
    )


def _execute_script(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    action = "execute"
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), EXECUTE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(action, _as_text(payload.get("path")), target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed(action, _display_path(repo_root, target), "not_found", "Path is not a file.")
    if target.suffix.lower() not in EXECUTE_EXTENSIONS:
        return _failed(action, _display_path(repo_root, target), "unsupported_extension", "Script extension is not allowed.")

    cwd_result = _resolve_allowed_path(repo_root, payload.get("cwd") or _display_path(repo_root, target.parent), EXECUTE_ROOTS)
    if isinstance(cwd_result, dict):
        return _failed(action, _display_path(repo_root, target), cwd_result["type"], cwd_result["message"])
    if not cwd_result.is_dir():
        return _failed(action, _display_path(repo_root, target), "not_found", "Working directory is not a directory.")

    command_result = _build_execute_command(target, _as_string_list(payload.get("args")))
    if isinstance(command_result, dict):
        return _failed(action, _display_path(repo_root, target), command_result["type"], command_result["message"])

    timeout_seconds = _timeout_seconds(payload.get("timeout_seconds"))
    try:
        completed = subprocess.run(
            command_result,
            text=True,
            capture_output=True,
            cwd=cwd_result,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return _success(
            action=action,
            path=_display_path(repo_root, target),
            summary=f"Timed out executing `{_display_path(repo_root, target)}` after {timeout_seconds} seconds.",
            stdout=_truncate(exc.stdout or ""),
            stderr=_truncate(exc.stderr or ""),
            exit_code=124,
            errors=[{"type": "timeout", "message": f"Execution timed out after {timeout_seconds} seconds."}],
            status="failed",
        )
    return _success(
        action=action,
        path=_display_path(repo_root, target),
        summary=f"Executed `{_display_path(repo_root, target)}` with exit code {completed.returncode}.",
        stdout=_truncate(completed.stdout),
        stderr=_truncate(completed.stderr),
        exit_code=completed.returncode,
        errors=[] if completed.returncode == 0 else [{"type": "process_failed", "message": f"Process exited with code {completed.returncode}.", "exit_code": completed.returncode}],
        status="succeeded" if completed.returncode == 0 else "failed",
    )


def _build_execute_command(target: Path, args: list[str]) -> list[str] | dict[str, str]:
    suffix = target.suffix.lower()
    if suffix == ".py":
        return [sys.executable, str(target), *args]
    if suffix in {".js", ".mjs"}:
        return ["node", str(target), *args]
    if suffix == ".sh":
        return ["bash", str(target), *args]
    if suffix == ".bat":
        if os.name != "nt":
            return {"type": "unsupported_platform", "message": ".bat execution is only supported on Windows."}
        return ["cmd", "/c", str(target), *args]
    if suffix == ".ps1":
        shell = shutil.which("pwsh") or shutil.which("powershell")
        if not shell:
            return {"type": "missing_command", "message": "pwsh or powershell is required to run .ps1 scripts."}
        return [shell, "-File", str(target), *args]
    return {"type": "unsupported_extension", "message": "Script extension is not allowed."}


def _resolve_allowed_path(repo_root: Path, value: Any, allowed_roots: list[str]) -> Path | dict[str, str]:
    raw_path = _as_text(value).strip()
    if not raw_path:
        return {"type": "invalid_path", "message": "path is required."}
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = repo_root / candidate
    resolved = candidate.resolve(strict=False)
    if not _is_within(resolved, repo_root):
        return {"type": "permission_denied", "message": "Path must stay inside the GraphiteUI repository."}
    for denied in DENIED_ROOTS:
        denied_path = (repo_root / denied).resolve(strict=False)
        if _is_within(resolved, denied_path):
            return {"type": "permission_denied", "message": f"Path is inside denied root `{denied}`."}
    for allowed in allowed_roots:
        allowed_path = (repo_root / allowed).resolve(strict=False)
        if _is_within(resolved, allowed_path):
            return resolved
    return {"type": "permission_denied", "message": f"Path is outside allowed roots: {', '.join(allowed_roots)}."}


def _is_within(path: Path, root: Path) -> bool:
    return path == root or path.is_relative_to(root)


def _repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2]


def _display_path(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        return str(path)


def _timeout_seconds(value: Any) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_SECONDS
    return max(1, min(parsed, MAX_TIMEOUT_SECONDS))


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)


def _truncate(value: str | bytes | None) -> str:
    if value is None:
        return ""
    text = value.decode("utf-8", errors="replace") if isinstance(value, bytes) else str(value)
    return text[:MAX_OUTPUT_CHARS]


def _success(
    *,
    action: str,
    path: str,
    summary: str,
    status: str = "succeeded",
    content: str = "",
    entries: list[dict[str, Any]] | None = None,
    stdout: str = "",
    stderr: str = "",
    exit_code: int = 0,
    errors: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "summary": summary,
        "action": action,
        "path": path,
        "content": content,
        "entries": entries or [],
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "errors": errors or [],
    }


def _failed(action: str, path: str, error_type: str, message: str) -> dict[str, Any]:
    return _success(
        status="failed",
        action=action,
        path=path,
        summary=f"{action} failed: {message}",
        exit_code=1,
        errors=[{"type": error_type, "message": message}],
    )


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(local_workspace_executor(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
