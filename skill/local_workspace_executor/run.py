from __future__ import annotations

import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
from typing import Any


DEFAULT_POLICY: dict[str, Any] = {
    "read_roots": ["."],
    "write_roots": ["backend/data"],
    "execute_roots": ["backend/data/skills/user", "backend/data/tmp"],
    "denied_roots": [".git", ".env", "backend/data/settings/security"],
    "allowed_commands": ["python", "python3", "node", "npm", "bash", "sh", "pwsh", "powershell", "cmd"],
    "allowed_script_extensions": [".py", ".js", ".mjs", ".sh", ".bat", ".ps1"],
}
MAX_TEXT_READ_BYTES = 2_000_000
PROCESS_EXECUTION_WARNING = (
    "Subprocess execution is not an OS-level sandbox; GraphiteUI only preflights command, cwd, and script paths."
)


def local_workspace_executor(**skill_inputs: Any) -> dict[str, Any]:
    action = _compact_text(skill_inputs.get("action"))
    repo_root = _resolve_repo_root()
    policy = _load_policy(repo_root)
    try:
        if action == "read_file":
            return _read_file(repo_root=repo_root, policy=policy, path=_compact_text(skill_inputs.get("path")))
        if action == "write_file":
            return _write_file(
                repo_root=repo_root,
                policy=policy,
                path=_compact_text(skill_inputs.get("path")),
                content=str(skill_inputs.get("content") or ""),
            )
        if action == "list_dir":
            return _list_dir(repo_root=repo_root, policy=policy, path=_compact_text(skill_inputs.get("path")))
        if action == "delete_path":
            return _delete_path(repo_root=repo_root, policy=policy, path=_compact_text(skill_inputs.get("path")))
        if action == "run_command":
            return _run_command(
                repo_root=repo_root,
                policy=policy,
                command=skill_inputs.get("command"),
                cwd=_compact_text(skill_inputs.get("cwd")) or ".",
                timeout_seconds=_coerce_timeout(skill_inputs.get("timeout_seconds")),
            )
        if action == "run_script":
            return _run_script(
                repo_root=repo_root,
                policy=policy,
                path=_compact_text(skill_inputs.get("path")),
                cwd=_compact_text(skill_inputs.get("cwd")) or "",
                timeout_seconds=_coerce_timeout(skill_inputs.get("timeout_seconds")),
            )
        return _failed_response([f"Unsupported local_workspace_executor action: {action or '<empty>'}."])
    except Exception as exc:
        return _failed_response([str(exc)])


def _read_file(*, repo_root: Path, policy: dict[str, Any], path: str) -> dict[str, Any]:
    target = _resolve_workspace_path(repo_root, path)
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="read", target=target)
    if blocked:
        return blocked
    if not target.is_file():
        return _failed_response([f"File '{path}' does not exist."])
    if target.stat().st_size > MAX_TEXT_READ_BYTES:
        return _failed_response([f"File '{path}' is too large to read as text."])
    content = target.read_text(encoding="utf-8", errors="replace")
    relative_path = _relative_path(repo_root, target)
    return _base_response(
        status="succeeded",
        read_files=[relative_path],
        content=content,
        policy_decisions=[_policy_decision("read", relative_path, "allowed")],
    )


def _write_file(*, repo_root: Path, policy: dict[str, Any], path: str, content: str) -> dict[str, Any]:
    target = _resolve_workspace_path(repo_root, path)
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="write", target=target)
    if blocked:
        return blocked
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    relative_path = _relative_path(repo_root, target)
    return _base_response(
        status="succeeded",
        changed_paths=[relative_path],
        policy_decisions=[_policy_decision("write", relative_path, "allowed")],
    )


def _list_dir(*, repo_root: Path, policy: dict[str, Any], path: str) -> dict[str, Any]:
    target = _resolve_workspace_path(repo_root, path or ".")
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="read", target=target)
    if blocked:
        return blocked
    if not target.is_dir():
        return _failed_response([f"Directory '{path or '.'}' does not exist."])
    entries = [
        {
            "name": child.name,
            "path": _relative_path(repo_root, child),
            "type": "directory" if child.is_dir() else "file",
        }
        for child in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
    ]
    return _base_response(
        status="succeeded",
        entries=entries,
        policy_decisions=[_policy_decision("read", _relative_path(repo_root, target), "allowed")],
    )


def _delete_path(*, repo_root: Path, policy: dict[str, Any], path: str) -> dict[str, Any]:
    target = _resolve_workspace_path(repo_root, path)
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="write", target=target)
    if blocked:
        return blocked
    relative_path = _relative_path(repo_root, target)
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()
    else:
        return _failed_response([f"Path '{path}' does not exist."])
    return _base_response(
        status="succeeded",
        changed_paths=[relative_path],
        policy_decisions=[_policy_decision("write", relative_path, "allowed")],
    )


def _run_command(
    *,
    repo_root: Path,
    policy: dict[str, Any],
    command: Any,
    cwd: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    command_args = _normalize_command(command)
    if not command_args:
        return _failed_response(["Command must be a non-empty JSON array."])
    command_name = Path(command_args[0]).name
    if command_name not in set(policy["allowed_commands"]) and not (
        command_name.startswith("python") and "python" in policy["allowed_commands"]
    ):
        return _blocked_response(
            repo_root=repo_root,
            policy=policy,
            operation="execute",
            target=_resolve_workspace_path(repo_root, cwd),
            errors=[f"Command '{command_name}' is not allowed by local executor policy."],
        )

    cwd_path = _resolve_workspace_path(repo_root, cwd)
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="execute", target=cwd_path)
    if blocked:
        return blocked
    inline_block = _block_inline_execution_args(
        repo_root=repo_root,
        policy=policy,
        cwd_path=cwd_path,
        command=command_args,
    )
    if inline_block:
        return inline_block
    script_block = _block_disallowed_script_args(repo_root=repo_root, policy=policy, cwd_path=cwd_path, command=command_args)
    if script_block:
        return script_block
    try:
        completed = subprocess.run(
            command_args,
            cwd=cwd_path,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return _failed_response([f"Command timed out after {timeout_seconds:g} seconds."])
    except OSError as exc:
        return _failed_response([str(exc)])
    status = "succeeded" if completed.returncode == 0 else "failed"
    return _base_response(
        status=status,
        stdout=completed.stdout,
        stderr=completed.stderr,
        exit_code=completed.returncode,
        policy_decisions=[_policy_decision("execute", _relative_path(repo_root, cwd_path), "allowed")],
        warnings=[PROCESS_EXECUTION_WARNING],
        errors=[] if completed.returncode == 0 else [f"Command exited with code {completed.returncode}."],
    )


def _run_script(*, repo_root: Path, policy: dict[str, Any], path: str, cwd: str, timeout_seconds: float) -> dict[str, Any]:
    script_path = _resolve_workspace_path(repo_root, path)
    blocked = _policy_block(repo_root=repo_root, policy=policy, operation="execute", target=script_path)
    if blocked:
        return blocked
    if script_path.suffix.lower() not in set(policy["allowed_script_extensions"]):
        return _blocked_response(
            repo_root=repo_root,
            policy=policy,
            operation="execute",
            target=script_path,
            errors=[f"Script extension '{script_path.suffix}' is not allowed by local executor policy."],
        )
    command = _command_for_script(script_path)
    if command is None:
        return _failed_response([f"No runner is available for script extension '{script_path.suffix}'."])
    cwd_path = _resolve_workspace_path(repo_root, cwd) if cwd else script_path.parent
    return _run_command(
        repo_root=repo_root,
        policy=policy,
        command=[*command, str(script_path)],
        cwd=_relative_path(repo_root, cwd_path),
        timeout_seconds=timeout_seconds,
    )


def _policy_block(*, repo_root: Path, policy: dict[str, Any], operation: str, target: Path) -> dict[str, Any] | None:
    relative_path = _relative_path(repo_root, target)
    if _matches_roots(relative_path, policy["denied_roots"]):
        return _blocked_response(
            repo_root=repo_root,
            policy=policy,
            operation=operation,
            target=target,
            errors=[f"Path '{relative_path}' is protected by local executor policy."],
        )
    root_key = f"{operation}_roots" if operation != "execute" else "execute_roots"
    allowed_roots = policy.get(root_key, [])
    if not _matches_roots(relative_path, allowed_roots):
        return _blocked_response(
            repo_root=repo_root,
            policy=policy,
            operation=operation,
            target=target,
            errors=[f"Path '{relative_path}' is outside the local executor {operation} whitelist."],
        )
    return None


def _block_disallowed_script_args(
    *,
    repo_root: Path,
    policy: dict[str, Any],
    cwd_path: Path,
    command: list[str],
) -> dict[str, Any] | None:
    allowed_extensions = set(policy["allowed_script_extensions"])
    for argument in command[1:]:
        argument_text = str(argument)
        suffix = Path(argument_text).suffix.lower()
        if suffix not in allowed_extensions:
            continue
        script_path = (cwd_path / argument_text).resolve() if not Path(argument_text).is_absolute() else Path(argument_text).resolve()
        if not script_path.is_relative_to(repo_root):
            return _blocked_response(
                repo_root=repo_root,
                policy=policy,
                operation="execute",
                target=cwd_path,
                errors=[f"Script argument '{argument_text}' is outside the GraphiteUI workspace."],
            )
        blocked = _policy_block(repo_root=repo_root, policy=policy, operation="execute", target=script_path)
        if blocked:
            return blocked
    return None


def _block_inline_execution_args(
    *,
    repo_root: Path,
    policy: dict[str, Any],
    cwd_path: Path,
    command: list[str],
) -> dict[str, Any] | None:
    command_name = Path(command[0]).name.lower()
    args = [str(argument).lower() for argument in command[1:]]
    if command_name.startswith("python") and "-c" in args:
        return _blocked_inline_execution(repo_root=repo_root, policy=policy, target=cwd_path, command_name=command_name)
    if command_name in {"node", "npm"} and any(
        argument in {"-e", "--eval"} or argument.startswith("--eval=") for argument in args
    ):
        return _blocked_inline_execution(repo_root=repo_root, policy=policy, target=cwd_path, command_name=command_name)
    if command_name in {"bash", "sh"} and any(argument in {"-c", "--command"} for argument in args):
        return _blocked_inline_execution(repo_root=repo_root, policy=policy, target=cwd_path, command_name=command_name)
    if command_name in {"pwsh", "powershell"} and any(
        argument in {"-command", "-encodedcommand", "-enc"}
        or argument.startswith("-command:")
        or argument.startswith("-encodedcommand:")
        for argument in args
    ):
        return _blocked_inline_execution(repo_root=repo_root, policy=policy, target=cwd_path, command_name=command_name)
    if command_name == "cmd" and any(argument in {"/c", "/k"} for argument in args):
        if _cmd_invokes_allowed_batch(command):
            return None
        return _blocked_inline_execution(repo_root=repo_root, policy=policy, target=cwd_path, command_name=command_name)
    return None


def _blocked_inline_execution(
    *,
    repo_root: Path,
    policy: dict[str, Any],
    target: Path,
    command_name: str,
) -> dict[str, Any]:
    return _blocked_response(
        repo_root=repo_root,
        policy=policy,
        operation="execute",
        target=target,
        errors=[f"Inline command execution with '{command_name}' is not allowed; write a script file under an execute root."],
    )


def _cmd_invokes_allowed_batch(command: list[str]) -> bool:
    for index, argument in enumerate(command):
        if str(argument).lower() not in {"/c", "/k"}:
            continue
        if index + 1 >= len(command) or len(command) != index + 2:
            return False
        return Path(str(command[index + 1])).suffix.lower() == ".bat"
    return False


def _blocked_response(
    *,
    repo_root: Path,
    policy: dict[str, Any],
    operation: str,
    target: Path,
    errors: list[str],
) -> dict[str, Any]:
    relative_path = _relative_path(repo_root, target)
    suggested_path = _suggest_policy_root(relative_path)
    return _base_response(
        status="blocked",
        blocked_path=relative_path,
        blocked_operation=operation,
        suggested_policy_update={"kind": operation, "path": suggested_path},
        policy_decisions=[_policy_decision(operation, relative_path, "blocked")],
        errors=errors,
        current_policy=policy,
    )


def _base_response(
    *,
    status: str,
    stdout: str = "",
    stderr: str = "",
    exit_code: int | None = None,
    changed_paths: list[str] | None = None,
    read_files: list[str] | None = None,
    policy_decisions: list[dict[str, str]] | None = None,
    warnings: list[str] | None = None,
    errors: list[str] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "status": status,
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "changed_paths": changed_paths or [],
        "read_files": read_files or [],
        "policy_decisions": policy_decisions or [],
        "warnings": warnings or [],
        "blocked_path": str(extra.pop("blocked_path", "") or ""),
        "blocked_operation": str(extra.pop("blocked_operation", "") or ""),
        "suggested_policy_update": extra.pop("suggested_policy_update", {}),
        "errors": errors or [],
        **extra,
    }


def _failed_response(errors: list[str]) -> dict[str, Any]:
    return _base_response(status="failed", errors=errors)


def _policy_decision(operation: str, path: str, decision: str) -> dict[str, str]:
    return {"operation": operation, "path": path, "decision": decision}


def _load_policy(repo_root: Path) -> dict[str, Any]:
    policy_path = repo_root / "backend" / "data" / "settings" / "security" / "local_executor_policy.json"
    payload: dict[str, Any] = {}
    if policy_path.is_file():
        try:
            raw_payload = json.loads(policy_path.read_text(encoding="utf-8"))
            if isinstance(raw_payload, dict):
                payload = raw_payload
        except json.JSONDecodeError:
            payload = {}
    return _normalize_policy(payload)


def _normalize_policy(payload: dict[str, Any]) -> dict[str, Any]:
    policy: dict[str, Any] = {}
    for key, fallback in DEFAULT_POLICY.items():
        policy[key] = _normalize_string_list(payload.get(key), fallback)
    for protected in DEFAULT_POLICY["denied_roots"]:
        if protected not in policy["denied_roots"]:
            policy["denied_roots"].append(protected)
    return policy


def _normalize_string_list(value: Any, fallback: list[str]) -> list[str]:
    source = value if isinstance(value, list) else fallback
    result: list[str] = []
    for item in source:
        text = str(item or "").strip().replace("\\", "/").strip("/")
        if not text and item == ".":
            text = "."
        if text and text not in result:
            result.append(text)
    return result


def _resolve_repo_root() -> Path:
    env_root = _compact_text(os.getenv("GRAPHITE_REPO_ROOT"))
    if env_root:
        return Path(env_root).resolve()
    return Path(__file__).resolve().parents[2]


def _resolve_workspace_path(repo_root: Path, relative_path: str) -> Path:
    normalized = _normalize_relative_path(relative_path)
    target = (repo_root / Path(*PurePosixPath(normalized).parts)).resolve() if normalized != "." else repo_root
    if not target.is_relative_to(repo_root):
        raise ValueError("Path must stay inside the GraphiteUI workspace.")
    return target


def _normalize_relative_path(path: str) -> str:
    normalized = str(path or "").strip().replace("\\", "/").strip("/")
    if normalized == ".":
        return "."
    parsed = PurePosixPath(normalized)
    if parsed.is_absolute() or not parsed.parts or any(part in {"", ".", ".."} for part in parsed.parts):
        raise ValueError("Path must be a relative path inside the GraphiteUI workspace.")
    return "/".join(parsed.parts)


def _relative_path(repo_root: Path, path: Path) -> str:
    if path == repo_root:
        return "."
    return path.resolve().relative_to(repo_root).as_posix()


def _matches_roots(path: str, roots: list[str]) -> bool:
    return any(root == "." or path == root or path.startswith(f"{root.rstrip('/')}/") for root in roots)


def _suggest_policy_root(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if not parts:
        return "."
    if parts[:2] == ["backend", "data"] and len(parts) >= 3:
        return "/".join(parts[:3])
    return parts[0]


def _normalize_command(command: Any) -> list[str]:
    if isinstance(command, str):
        try:
            parsed = json.loads(command)
        except json.JSONDecodeError:
            return []
        command = parsed
    if not isinstance(command, list):
        return []
    return [str(item) for item in command if str(item).strip()]


def _command_for_script(script_path: Path) -> list[str] | None:
    suffix = script_path.suffix.lower()
    if suffix == ".py":
        return [sys.executable]
    if suffix in {".js", ".mjs"}:
        return ["node"]
    if suffix == ".sh":
        return ["bash"]
    if suffix == ".ps1":
        return ["pwsh"] if shutil.which("pwsh") else ["powershell"]
    if suffix == ".bat":
        return ["cmd", "/c"]
    return None


def _coerce_timeout(value: Any) -> float:
    try:
        timeout = float(value)
    except (TypeError, ValueError):
        timeout = 30.0
    return min(max(timeout, 1.0), 300.0)


def _compact_text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        payload = {"action": "", "error": f"Invalid JSON input: {exc}"}
    if not isinstance(payload, dict):
        payload = {"action": "", "error": "Skill input must be a JSON object."}
    result = local_workspace_executor(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
