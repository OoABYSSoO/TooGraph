from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


MAX_READ_CHARS = 200_000
MAX_OUTPUT_CHARS = 200_000
DEFAULT_TIMEOUT_SECONDS = 30
READ_ROOTS: list[str] | None = None
WRITE_ROOTS = ["backend/data", "skill/user", "graph_template/user", "node_preset/user"]
EXECUTE_ROOTS = ["backend/data/tmp", "skill/user"]
DENIED_ROOTS = [".git", ".env", "backend/data/settings"]
EXECUTE_EXTENSIONS = {".py", ".js", ".mjs", ".sh", ".bat", ".ps1"}


def local_workspace_executor(**skill_inputs: Any) -> dict[str, Any]:
    operation = _as_text(skill_inputs.get("operation")).strip().lower()
    if operation == "edit":
        operation = "write"
    repo_root = _repo_root()
    if operation == "read":
        return _read_file(repo_root, skill_inputs)
    if operation == "write":
        return _write_file(repo_root, skill_inputs)
    if operation == "execute":
        return _execute_script(repo_root, skill_inputs)
    return _failed("invalid_operation", "operation must be one of read, write, execute.")


def _read_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed("not_found", "Path is not a file.")
    content = target.read_text(encoding="utf-8", errors="replace")
    result = f"Read `{_display_path(repo_root, target)}` ({len(content)} characters).\n\n{content[:MAX_READ_CHARS]}"
    if len(content) > MAX_READ_CHARS:
        result += "\n\n[truncated]"
    return _succeeded(result)


def _write_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), WRITE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    if "content" not in payload or payload.get("content") is None:
        return _failed("missing_content", "content is required for write.")
    target = target_result
    content = _as_text(payload.get("content"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return _succeeded(f"Wrote `{_display_path(repo_root, target)}` ({len(content)} characters).")


def _execute_script(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), EXECUTE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed("not_found", "Path is not a file.")
    if target.suffix.lower() not in EXECUTE_EXTENSIONS:
        return _failed("unsupported_extension", "Script extension is not allowed.")

    command_result = _build_execute_command(target)
    if isinstance(command_result, dict):
        return _failed(command_result["type"], command_result["message"])

    try:
        completed = subprocess.run(
            command_result,
            text=True,
            capture_output=True,
            cwd=target.parent,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return _failed(
            "timeout",
            _format_execution_result(
                repo_root,
                target,
                124,
                _truncate(exc.stdout or ""),
                _truncate(exc.stderr or ""),
                prefix=f"Timed out after {DEFAULT_TIMEOUT_SECONDS} seconds.",
            ),
        )

    result = _format_execution_result(
        repo_root,
        target,
        completed.returncode,
        _truncate(completed.stdout),
        _truncate(completed.stderr),
    )
    if completed.returncode != 0:
        return _failed("process_failed", result)
    return _succeeded(result)


def _build_execute_command(target: Path) -> list[str] | dict[str, str]:
    suffix = target.suffix.lower()
    if suffix == ".py":
        return [sys.executable, str(target)]
    if suffix in {".js", ".mjs"}:
        return ["node", str(target)]
    if suffix == ".sh":
        return ["bash", str(target)]
    if suffix == ".bat":
        if os.name != "nt":
            return {"type": "unsupported_platform", "message": ".bat execution is only supported on Windows."}
        return ["cmd", "/c", str(target)]
    if suffix == ".ps1":
        shell = shutil.which("pwsh") or shutil.which("powershell")
        if not shell:
            return {"type": "missing_command", "message": "pwsh or powershell is required to run .ps1 scripts."}
        return [shell, "-File", str(target)]
    return {"type": "unsupported_extension", "message": "Script extension is not allowed."}


def _format_execution_result(
    repo_root: Path,
    target: Path,
    exit_code: int,
    stdout: str,
    stderr: str,
    *,
    prefix: str = "",
) -> str:
    lines = []
    if prefix:
        lines.append(prefix)
    lines.append(f"Executed `{_display_path(repo_root, target)}` with exit code {exit_code}.")
    if stdout:
        lines.extend(["", "STDOUT:", stdout])
    if stderr:
        lines.extend(["", "STDERR:", stderr])
    return "\n".join(lines)


def _resolve_allowed_path(repo_root: Path, value: Any, allowed_roots: list[str] | None) -> Path | dict[str, str]:
    raw_path = _as_text(value).strip()
    if not raw_path:
        return {"type": "invalid_path", "message": "path is required."}
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = repo_root / candidate
    resolved = candidate.resolve(strict=False)
    if not _is_within(resolved, repo_root):
        return {"type": "permission_denied", "message": "Path must stay inside the TooGraph repository."}
    for denied in DENIED_ROOTS:
        denied_path = (repo_root / denied).resolve(strict=False)
        if _is_within(resolved, denied_path):
            return {"type": "permission_denied", "message": f"Path is inside denied root `{denied}`."}
    if allowed_roots is None:
        return resolved
    for allowed in allowed_roots:
        allowed_path = (repo_root / allowed).resolve(strict=False)
        if _is_within(resolved, allowed_path):
            return resolved
    return {"type": "permission_denied", "message": f"Path is outside allowed roots: {', '.join(allowed_roots)}."}


def _is_within(path: Path, root: Path) -> bool:
    return path == root or path.is_relative_to(root)


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[3]


def _display_path(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        return str(path)


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


def _succeeded(result: str) -> dict[str, Any]:
    return {"success": True, "result": result}


def _failed(error_type: str, message: str) -> dict[str, Any]:
    return {"success": False, "result": f"{error_type}: {message}"}


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
