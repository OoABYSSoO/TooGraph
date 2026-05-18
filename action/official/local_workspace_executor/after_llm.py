from __future__ import annotations

import difflib
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
from typing import Any


MAX_READ_CHARS = 200_000
MAX_OUTPUT_CHARS = 200_000
MAX_PATCH_CHARS = 40_000
DEFAULT_TIMEOUT_SECONDS = 30
MAX_LIST_ENTRIES = 200
MAX_SEARCH_MATCHES = 100
READ_ROOTS: list[str] | None = None
WRITE_ROOTS = ["backend/data", "action/user", "graph_template/user", "node_preset/user"]
EXECUTE_ROOTS = ["backend/data/tmp", "action/user"]
DENIED_ROOTS = [".git", ".env", "backend/data/settings"]
EXECUTE_EXTENSIONS = {".py", ".js", ".mjs", ".sh", ".bat", ".ps1"}


def local_workspace_executor(**action_inputs: Any) -> dict[str, Any]:
    operation = _as_text(action_inputs.get("operation")).strip().lower()
    repo_root = _repo_root()
    if operation == "read":
        return _read_file(repo_root, action_inputs)
    if operation == "list":
        return _list_files(repo_root, action_inputs)
    if operation == "search":
        return _search_files(repo_root, action_inputs)
    if operation == "edit":
        return _edit_file(repo_root, action_inputs)
    if operation == "write":
        return _write_file(repo_root, action_inputs)
    if operation == "execute":
        return _execute_script(repo_root, action_inputs)
    return _failed("invalid_operation", "operation must be one of read, list, search, edit, write, execute.")


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
    if target.exists() and not target.is_file():
        return _failed("not_file", "Path exists but is not a file.")
    snapshot = _verify_existing_file_snapshot(target, payload)
    if isinstance(snapshot, dict) and "type" in snapshot:
        return _failed(snapshot["type"], snapshot["message"])
    content = _as_text(payload.get("content"))
    previous_text = target.read_text(encoding="utf-8", errors="replace") if target.is_file() else ""
    patch = _unified_text_patch(_display_path(repo_root, target), previous_text, content)
    added, removed = _patch_line_counts(patch)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    display_path = _display_path(repo_root, target)
    next_snapshot = _file_snapshot(target)
    return _succeeded(
        f"Wrote `{display_path}` ({len(content)} characters).",
        activity_events=[
            _activity_event(
                kind="file_write",
                summary=f"Writing {display_path} +{added} -{removed}",
                status="succeeded",
                detail={
                    "path": display_path,
                    "characters": len(content),
                    "added": added,
                    "removed": removed,
                    "old_sha256": snapshot.get("sha256") if snapshot else None,
                    "old_mtime_ns": snapshot.get("mtime_ns") if snapshot else None,
                    "new_sha256": next_snapshot["sha256"],
                    "new_mtime_ns": next_snapshot["mtime_ns"],
                    "patch": _truncate_patch(patch),
                },
            )
        ],
    )


def _edit_file(repo_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    target_result = _resolve_allowed_path(repo_root, payload.get("path"), WRITE_ROOTS)
    if isinstance(target_result, dict):
        return _failed(target_result["type"], target_result["message"])
    target = target_result
    if not target.is_file():
        return _failed("not_found", "Path is not a file.")
    if not _is_text_file(target):
        return _failed("unsupported_binary", "Existing file is not a UTF-8 text file.")

    old_string = _as_text(payload.get("old_string"))
    if old_string == "":
        return _failed("missing_old_string", "old_string is required for edit.")
    if "new_string" not in payload or payload.get("new_string") is None:
        return _failed("missing_new_string", "new_string is required for edit.")
    new_string = _as_text(payload.get("new_string"))
    replace_all = _as_bool(payload.get("replace_all"))

    snapshot = _verify_existing_file_snapshot(target, payload)
    if isinstance(snapshot, dict) and "type" in snapshot:
        return _failed(snapshot["type"], snapshot["message"])

    previous_text = target.read_text(encoding="utf-8", errors="replace")
    match_count = previous_text.count(old_string)
    if match_count == 0:
        return _failed("old_string_not_found", "old_string was not found in the target file.")
    if match_count > 1 and not replace_all:
        return _failed("non_unique_match", "old_string matched multiple locations; set replace_all=true or provide a unique old_string.")

    next_text = previous_text.replace(old_string, new_string) if replace_all else previous_text.replace(old_string, new_string, 1)
    patch = _unified_text_patch(_display_path(repo_root, target), previous_text, next_text)
    added, removed = _patch_line_counts(patch)
    target.write_text(next_text, encoding="utf-8")
    display_path = _display_path(repo_root, target)
    next_snapshot = _file_snapshot(target)
    return _succeeded(
        f"Edited `{display_path}` ({match_count} match{'es' if match_count != 1 else ''}, +{added} -{removed}).",
        activity_events=[
            _activity_event(
                kind="file_edit",
                summary=f"Editing {display_path} +{added} -{removed}",
                status="succeeded",
                detail={
                    "path": display_path,
                    "match_count": match_count,
                    "replace_all": replace_all,
                    "old_sha256": snapshot["sha256"],
                    "old_mtime_ns": snapshot["mtime_ns"],
                    "new_sha256": next_snapshot["sha256"],
                    "new_mtime_ns": next_snapshot["mtime_ns"],
                    "added": added,
                    "removed": removed,
                    "patch": _truncate_patch(patch),
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
    args_result = _normalize_execute_args(payload.get("args"))
    if isinstance(args_result, dict):
        return _failed(args_result["type"], args_result["message"])
    command = [*command_result, *args_result]

    try:
        completed = subprocess.run(
            command,
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
            command=command,
            args=args_result,
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
        command=command,
        args=args_result,
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


def _normalize_execute_args(value: Any) -> list[str] | dict[str, str]:
    if value in (None, "", []):
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return {"type": "invalid_args", "message": "args JSON array could not be parsed."}
            return _normalize_execute_args(parsed)
        try:
            return shlex.split(text)
        except ValueError as exc:
            return {"type": "invalid_args", "message": str(exc)}
    if not isinstance(value, list):
        return {"type": "invalid_args", "message": "args must be a JSON array or shell-style string."}
    args: list[str] = []
    for item in value:
        if isinstance(item, (dict, list)):
            return {"type": "invalid_args", "message": "args entries must be scalar values."}
        text = _as_text(item)
        if "\x00" in text:
            return {"type": "invalid_args", "message": "args entries must not contain NUL bytes."}
        args.append(text)
    if len(args) > 32:
        return {"type": "invalid_args", "message": "args may contain at most 32 entries."}
    return args


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
    args: list[str],
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
            "args": args,
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


def _verify_existing_file_snapshot(target: Path, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not target.exists():
        return None
    if not target.is_file():
        return {"type": "not_file", "message": "Path exists but is not a file."}
    if not _is_text_file(target):
        return {"type": "unsupported_binary", "message": "Existing file is not a UTF-8 text file."}

    expected_sha256 = _as_text(payload.get("expected_sha256")).strip().lower()
    expected_mtime_ns = _as_text(payload.get("expected_mtime_ns")).strip()
    if not expected_sha256 or not expected_mtime_ns:
        return {
            "type": "missing_snapshot",
            "message": "expected_sha256 and expected_mtime_ns are required before modifying an existing file.",
        }

    snapshot = _file_snapshot(target)
    if expected_sha256 != snapshot["sha256"] or expected_mtime_ns != str(snapshot["mtime_ns"]):
        return {
            "type": "stale_file",
            "message": "File changed after the provided snapshot; read the file again before editing or overwriting it.",
        }
    return snapshot


def _file_snapshot(path: Path) -> dict[str, Any]:
    return {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "mtime_ns": path.stat().st_mtime_ns,
    }


def _unified_text_patch(display_path: str, old_text: str, new_text: str) -> str:
    return "\n".join(
        difflib.unified_diff(
            old_text.splitlines(),
            new_text.splitlines(),
            fromfile=f"a/{display_path}",
            tofile=f"b/{display_path}",
            lineterm="",
        )
    )


def _patch_line_counts(patch: str) -> tuple[int, int]:
    added = 0
    removed = 0
    for line in patch.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            removed += 1
    return added, removed


def _truncate_patch(patch: str) -> str:
    if len(patch) <= MAX_PATCH_CHARS:
        return patch
    return patch[:MAX_PATCH_CHARS] + "\n[patch truncated]"


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return _as_text(value).strip().lower() in {"1", "true", "yes", "y", "replace_all"}


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
