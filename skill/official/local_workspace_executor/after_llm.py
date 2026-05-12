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
MAX_LIST_ENTRIES = 200
MAX_SEARCH_MATCHES = 100
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
    if operation == "list":
        return _list_files(repo_root, skill_inputs)
    if operation == "search":
        return _search_files(repo_root, skill_inputs)
    if operation == "write":
        return _write_file(repo_root, skill_inputs)
    if operation == "execute":
        return _execute_script(repo_root, skill_inputs)
    return _failed("invalid_operation", "operation must be one of read, list, search, write, execute.")


def _read_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed("not_found", "Path is not a file.")
    content = target.read_text(encoding="utf-8", errors="replace")
    display_path = _display_path(repo_root, target)
    result = f"Read `{display_path}` ({len(content)} characters).\n\n{content[:MAX_READ_CHARS]}"
    if len(content) > MAX_READ_CHARS:
        result += "\n\n[truncated]"
    return _succeeded(
        result,
        activity_events=[
            _activity_event(
                kind="file_read",
                summary=f"Read {display_path} ({len(content)} characters).",
                status="succeeded",
                detail={"path": display_path, "characters": len(content)},
            )
        ],
    )


def _list_files(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    raw_path = _as_text(payload.get("path")).strip()
    target_result = _resolve_allowed_path(repo_root, raw_path, READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(
            target_result["type"],
            target_result["message"],
            activity_events=[
                _file_activity_event(
                    kind="file_list",
                    path=raw_path,
                    summary=f"Failed to list {raw_path or '(missing path)'}.",
                    status="failed",
                    detail={"error_type": target_result["type"], "error": target_result["message"]},
                    error=target_result["message"],
                )
            ],
        )
    target = target_result
    if not target.exists():
        message = "Path does not exist."
        return _failed(
            "not_found",
            message,
            activity_events=[
                _file_activity_event(
                    kind="file_list",
                    path=_display_path(repo_root, target),
                    summary=f"Failed to list {_display_path(repo_root, target)}.",
                    status="failed",
                    detail={"error_type": "not_found", "error": message},
                    error=message,
                )
            ],
        )

    files, skipped_count = _collect_readable_files(repo_root, target)
    display_path = _display_path(repo_root, target)
    limited_files = files[:MAX_LIST_ENTRIES]
    result_lines = [f"Listed `{display_path}` ({len(files)} entries, skipped {skipped_count})."]
    if len(files) > MAX_LIST_ENTRIES:
        result_lines[0] += f" Showing first {MAX_LIST_ENTRIES} entries."
    result_lines.extend(f"- `{_display_path(repo_root, file_path)}`" for file_path in limited_files)
    if not limited_files:
        result_lines.append("- (no readable files)")
    return _succeeded(
        "\n".join(result_lines),
        activity_events=[
            _file_activity_event(
                kind="file_list",
                path=display_path,
                summary=f"Listed {display_path} ({len(files)} entries, skipped {skipped_count}).",
                status="succeeded",
                detail={
                    "entry_count": len(files),
                    "skipped_count": skipped_count,
                    "truncated": len(files) > MAX_LIST_ENTRIES,
                },
            )
        ],
    )


def _search_files(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    raw_path = _as_text(payload.get("path")).strip()
    query = _as_text(payload.get("query")).strip()
    if not query:
        message = "query is required for search."
        return _failed(
            "missing_query",
            message,
            activity_events=[
                _file_activity_event(
                    kind="file_search",
                    path=raw_path,
                    summary=f"Failed to search {raw_path or '(missing path)'}.",
                    status="failed",
                    detail={"query": query, "error_type": "missing_query", "error": message},
                    error=message,
                )
            ],
        )

    target_result = _resolve_allowed_path(repo_root, raw_path, READ_ROOTS)
    if isinstance(target_result, dict):
        return _failed(
            target_result["type"],
            target_result["message"],
            activity_events=[
                _file_activity_event(
                    kind="file_search",
                    path=raw_path,
                    summary=f"Failed to search {raw_path or '(missing path)'}.",
                    status="failed",
                    detail={"query": query, "error_type": target_result["type"], "error": target_result["message"]},
                    error=target_result["message"],
                )
            ],
        )
    target = target_result
    if not target.exists():
        message = "Path does not exist."
        return _failed(
            "not_found",
            message,
            activity_events=[
                _file_activity_event(
                    kind="file_search",
                    path=_display_path(repo_root, target),
                    summary=f"Failed to search {_display_path(repo_root, target)}.",
                    status="failed",
                    detail={"query": query, "error_type": "not_found", "error": message},
                    error=message,
                )
            ],
        )

    files, skipped_count = _collect_readable_files(repo_root, target)
    matches: list[tuple[str, int, str]] = []
    for file_path in files:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        for line_number, line in enumerate(content.splitlines(), start=1):
            if query.lower() not in line.lower():
                continue
            matches.append((_display_path(repo_root, file_path), line_number, line.strip()))
            if len(matches) >= MAX_SEARCH_MATCHES:
                break
        if len(matches) >= MAX_SEARCH_MATCHES:
            break

    display_path = _display_path(repo_root, target)
    result_lines = [f"Searched `{display_path}` for `{query}` ({len(matches)} matches, skipped {skipped_count})."]
    if len(matches) >= MAX_SEARCH_MATCHES:
        result_lines[0] += f" Showing first {MAX_SEARCH_MATCHES} matches."
    result_lines.extend(f"- `{path}:{line_number}` {line}" for path, line_number, line in matches)
    if not matches:
        result_lines.append("- (no matches)")
    match_noun = "match" if len(matches) == 1 else "matches"
    return _succeeded(
        "\n".join(result_lines),
        activity_events=[
            _file_activity_event(
                kind="file_search",
                path=display_path,
                summary=f"Searched {display_path} for `{query}` ({len(matches)} {match_noun}, skipped {skipped_count}).",
                status="succeeded",
                detail={
                    "query": query,
                    "match_count": len(matches),
                    "skipped_count": skipped_count,
                    "truncated": len(matches) >= MAX_SEARCH_MATCHES,
                },
            )
        ],
    )


def _write_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), WRITE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    if "content" not in payload or payload.get("content") is None:
        return _failed("missing_content", "content is required for write.")
    target = target_result
    content = _as_text(payload.get("content"))
    previous_text = target.read_text(encoding="utf-8", errors="replace") if target.is_file() else ""
    previous_lines = _line_count(previous_text)
    next_lines = _line_count(content)
    added = max(next_lines - previous_lines, 0)
    removed = max(previous_lines - next_lines, 0)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    display_path = _display_path(repo_root, target)
    return _succeeded(
        f"Wrote `{display_path}` ({len(content)} characters).",
        activity_events=[
            _activity_event(
                kind="file_write",
                summary=f"Editing {display_path} +{added} -{removed}",
                status="succeeded",
                detail={
                    "path": display_path,
                    "characters": len(content),
                    "added": added,
                    "removed": removed,
                },
            )
        ],
    )


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
        event = _command_activity_event(
            repo_root=repo_root,
            target=target,
            command=command_result,
            exit_code=124,
            stdout=_truncate(exc.stdout or ""),
            stderr=_truncate(exc.stderr or ""),
            status="failed",
        )
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
            activity_events=[event],
        )

    event = _command_activity_event(
        repo_root=repo_root,
        target=target,
        command=command_result,
        exit_code=completed.returncode,
        stdout=_truncate(completed.stdout),
        stderr=_truncate(completed.stderr),
        status="succeeded" if completed.returncode == 0 else "failed",
    )
    result = _format_execution_result(
        repo_root,
        target,
        completed.returncode,
        _truncate(completed.stdout),
        _truncate(completed.stderr),
    )
    if completed.returncode != 0:
        return _failed("process_failed", result, activity_events=[event])
    return _succeeded(result, activity_events=[event])


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


def _line_count(value: str) -> int:
    if not value:
        return 0
    return len(value.splitlines())


def _collect_readable_files(repo_root: Path, target: Path) -> tuple[list[Path], int]:
    if target.is_file():
        if _is_text_file(target):
            return [target], 0
        return [], 1
    if not target.is_dir():
        return [], 1

    files: list[Path] = []
    skipped_count = 0
    for current_dir, dir_names, file_names in os.walk(target):
        current_path = Path(current_dir)
        allowed_dirs: list[str] = []
        for dir_name in sorted(dir_names):
            child_dir = current_path / dir_name
            if is_denied_workspace_path(repo_root, child_dir):
                skipped_count += 1
                continue
            allowed_dirs.append(dir_name)
        dir_names[:] = allowed_dirs

        for file_name in sorted(file_names):
            file_path = current_path / file_name
            if is_denied_workspace_path(repo_root, file_path) or not _is_text_file(file_path):
                skipped_count += 1
                continue
            files.append(file_path)
    return files, skipped_count


def is_denied_workspace_path(repo_root: Path, path: Path) -> bool:
    resolved = path.resolve(strict=False)
    if not _is_within(resolved, repo_root):
        return True
    for denied in DENIED_ROOTS:
        denied_path = (repo_root / denied).resolve(strict=False)
        if _is_within(resolved, denied_path):
            return True
    return False


def _is_text_file(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:4096]
    except OSError:
        return False
    return b"\x00" not in chunk


def _activity_event(*, kind: str, summary: str, status: str, detail: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": kind,
        "summary": summary,
        "status": status,
        "detail": detail,
    }


def _file_activity_event(
    *,
    kind: str,
    path: str,
    summary: str,
    status: str,
    detail: dict[str, Any],
    error: str = "",
) -> dict[str, Any]:
    event = _activity_event(
        kind=kind,
        summary=summary,
        status=status,
        detail={
            "path": path,
            **detail,
        },
    )
    if error:
        event["error"] = error
    return event


def _command_activity_event(
    *,
    repo_root: Path,
    target: Path,
    command: list[str],
    exit_code: int,
    stdout: str,
    stderr: str,
    status: str,
) -> dict[str, Any]:
    display_path = _display_path(repo_root, target)
    return _activity_event(
        kind="command",
        summary=f"Ran {display_path}, exit {exit_code}.",
        status=status,
        detail={
            "path": display_path,
            "command": command,
            "cwd": _display_path(repo_root, target.parent),
            "exit_code": exit_code,
            "stdout_chars": len(stdout),
            "stderr_chars": len(stderr),
        },
    )


def _succeeded(result: str, *, activity_events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": True, "result": result}
    if activity_events:
        payload["activity_events"] = activity_events
    return payload


def _failed(error_type: str, message: str, *, activity_events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": False, "result": f"{error_type}: {message}"}
    if activity_events:
        payload["activity_events"] = activity_events
    return payload


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
