from __future__ import annotations

import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time
from typing import Any


RUN_TIMEOUT_SECONDS = 30
MAX_OUTPUT_CHARS = 20000
MAX_FILE_CHARS = 300000
ALLOWED_COMMANDS = {"python", "python3", "node", "npm", "bash", "sh", "pwsh", "powershell", "cmd"}


def graphiteui_script_tester(**skill_inputs: Any) -> dict[str, Any]:
    files = _normalize_files(skill_inputs.get("files"))
    if isinstance(files, str):
        return _result(False, files)
    command = _normalize_command(skill_inputs.get("command"))
    if isinstance(command, str):
        return _result(False, command)
    if not files:
        return _result(False, "No test files were provided.")

    with tempfile.TemporaryDirectory(prefix="graphiteui_script_test_") as temp_dir:
        temp_path = Path(temp_dir)
        file_error = _write_files(temp_path, files)
        if file_error:
            return _result(False, file_error)

        display_command = _display_command(command)
        run_command = _resolve_runtime_command(command)
        started_at = time.monotonic()
        try:
            completed = subprocess.run(
                run_command,
                text=True,
                capture_output=True,
                cwd=temp_path,
                env=_build_test_environment(temp_path),
                timeout=RUN_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = _truncate(exc.stdout)
            stderr = _truncate(exc.stderr)
            return _result(
                False,
                _format_result(
                    command=display_command,
                    exit_code=124,
                    duration_seconds=time.monotonic() - started_at,
                    stdout=stdout,
                    stderr=stderr,
                    detail=f"Timed out after {RUN_TIMEOUT_SECONDS} seconds.",
                ),
            )
        except OSError as exc:
            return _result(
                False,
                _format_result(
                    command=display_command,
                    exit_code=None,
                    duration_seconds=time.monotonic() - started_at,
                    stdout="",
                    stderr=str(exc),
                    detail="The command could not be started.",
                ),
            )

        success = completed.returncode == 0
        stdout = _truncate(completed.stdout)
        stderr = _truncate(completed.stderr)
        detail = "All generated tests passed." if success else _first_non_empty_line(stderr, stdout) or "The test command failed."
        return _result(
            success,
            _format_result(
                command=display_command,
                exit_code=completed.returncode,
                duration_seconds=time.monotonic() - started_at,
                stdout=stdout,
                stderr=stderr,
                detail=detail,
            ),
        )


def _normalize_files(value: Any) -> list[dict[str, str]] | str:
    parsed = _parse_json_if_string(value)
    if isinstance(parsed, dict):
        parsed = [{"path": path, "content": content} for path, content in parsed.items()]
    if not isinstance(parsed, list):
        return "files must be an array of {path, content} objects."

    files: list[dict[str, str]] = []
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            return f"files[{index}] must be an object."
        path = _as_text(item.get("path")).strip()
        content = _strip_code_fence(_as_text(item.get("content")))
        if not path:
            return f"files[{index}].path is required."
        if not _is_safe_relative_path(path):
            return f"files[{index}].path must stay inside the temporary test directory."
        if len(content) > MAX_FILE_CHARS:
            return f"files[{index}].content is too large."
        files.append({"path": path, "content": content})
    return files


def _normalize_command(value: Any) -> list[str] | str:
    parsed = _parse_json_if_string(value)
    if isinstance(parsed, str):
        parsed = shlex.split(parsed)
    if not isinstance(parsed, list):
        return "command must be an argument array."

    command = [_as_text(part).strip() for part in parsed]
    command = [part for part in command if part]
    if not command:
        return "command must not be empty."
    executable = Path(command[0]).name
    if executable not in ALLOWED_COMMANDS:
        return f"Command `{executable}` is not allowed. Allowed commands: {', '.join(sorted(ALLOWED_COMMANDS))}."
    return [executable, *command[1:]]


def _write_files(temp_path: Path, files: list[dict[str, str]]) -> str | None:
    for file_spec in files:
        target = (temp_path / file_spec["path"]).resolve()
        if not _is_relative_to(target, temp_path.resolve()):
            return f"File path `{file_spec['path']}` escaped the temporary test directory."
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(file_spec["content"], encoding="utf-8")
    return None


def _resolve_runtime_command(command: list[str]) -> list[str]:
    executable = command[0]
    if executable in {"python", "python3"}:
        return [sys.executable, *command[1:]]
    return command


def _build_test_environment(temp_path: Path) -> dict[str, str]:
    existing_pythonpath = os.environ.get("PYTHONPATH", "")
    pythonpath = str(temp_path) if not existing_pythonpath else f"{temp_path}{os.pathsep}{existing_pythonpath}"
    return {
        **os.environ,
        "PYTHONPATH": pythonpath,
        "PYTHONDONTWRITEBYTECODE": "1",
    }


def _format_result(
    *,
    command: str,
    exit_code: int | None,
    duration_seconds: float,
    stdout: str,
    stderr: str,
    detail: str,
) -> str:
    lines = [
        f"- Command: `{command}`",
        f"- Exit code: `{exit_code if exit_code is not None else 'not-started'}`",
        f"- Duration: `{duration_seconds:.2f}s`",
        f"- Detail: {detail}",
        "",
        "### stdout",
        _fenced(stdout or "(empty)"),
        "",
        "### stderr",
        _fenced(stderr or "(empty)"),
    ]
    return "\n".join(lines)


def _display_command(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def _result(success: bool, result: str) -> dict[str, Any]:
    return {"success": success, "result": result}


def _is_safe_relative_path(value: str) -> bool:
    path = Path(value)
    if path.is_absolute():
        return False
    return all(part not in {"", ".", ".."} for part in path.parts)


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _parse_json_if_string(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return value
    if stripped[0] not in "[{\"":
        return value
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return value


def _first_non_empty_line(*texts: str) -> str:
    for text in texts:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped:
                return stripped
    return ""


def _strip_code_fence(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("```") and stripped.endswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 2:
            return "\n".join(lines[1:-1]).strip()
    return value


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


def _fenced(value: str) -> str:
    return f"```text\n{value}\n```"


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_script_tester(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
