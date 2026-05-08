from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from typing import Any


RUN_TIMEOUT_SECONDS = 30
MAX_OUTPUT_CHARS = 20000


def graphiteui_script_tester(**skill_inputs: Any) -> dict[str, Any]:
    script_source = _strip_code_fence(_as_text(skill_inputs.get("script_source")))
    test_source = _strip_code_fence(_as_text(skill_inputs.get("test_source")))
    script_filename = _sanitize_python_filename(skill_inputs.get("script_filename"), "target.py")
    test_filename = _sanitize_python_filename(skill_inputs.get("test_filename"), "test_target.py")

    if not script_source.strip():
        return _failure_result(
            summary="No script source was provided.",
            test_source=test_source,
            exit_code=2,
            errors=[{"type": "input_error", "message": "script_source is required."}],
        )
    if not test_source.strip():
        return _failure_result(
            summary="No test source was provided.",
            test_source=test_source,
            exit_code=2,
            errors=[{"type": "input_error", "message": "test_source is required."}],
        )

    with tempfile.TemporaryDirectory(prefix="graphiteui_script_test_") as temp_dir:
        temp_path = Path(temp_dir)
        script_path = temp_path / script_filename
        test_path = temp_path / test_filename
        script_path.write_text(script_source, encoding="utf-8")
        test_path.write_text(test_source, encoding="utf-8")

        command = [sys.executable, "-m", "pytest", "-q", test_filename]
        started_at = time.monotonic()
        env = _build_test_environment(temp_path)
        try:
            completed = subprocess.run(
                command,
                text=True,
                capture_output=True,
                cwd=temp_path,
                env=env,
                timeout=RUN_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = _truncate(exc.stdout or "")
            stderr = _truncate(exc.stderr or "")
            return {
                "status": "failed",
                "summary": _build_summary(
                    command=command,
                    status="failed",
                    exit_code=124,
                    duration_seconds=time.monotonic() - started_at,
                    detail=f"Timed out after {RUN_TIMEOUT_SECONDS} seconds.",
                ),
                "test_source": test_source,
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": 124,
                "errors": [
                    {
                        "type": "timeout",
                        "message": f"pytest timed out after {RUN_TIMEOUT_SECONDS} seconds.",
                    }
                ],
            }

        stdout = _truncate(completed.stdout)
        stderr = _truncate(completed.stderr)
        status = "succeeded" if completed.returncode == 0 else "failed"
        errors = [] if status == "succeeded" else [_build_process_error(completed.returncode, stdout, stderr)]
        return {
            "status": status,
            "summary": _build_summary(
                command=command,
                status=status,
                exit_code=completed.returncode,
                duration_seconds=time.monotonic() - started_at,
                detail=_first_non_empty_error_line(stdout, stderr) if errors else "All generated tests passed.",
            ),
            "test_source": test_source,
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": completed.returncode,
            "errors": errors,
        }


def _failure_result(
    *,
    summary: str,
    test_source: str,
    exit_code: int,
    errors: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "status": "failed",
        "summary": summary,
        "test_source": test_source,
        "stdout": "",
        "stderr": "",
        "exit_code": exit_code,
        "errors": errors,
    }


def _sanitize_python_filename(value: Any, fallback: str) -> str:
    name = Path(_as_text(value).strip() or fallback).name
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", name).strip("._")
    if not name:
        name = fallback
    if not name.endswith(".py"):
        name = f"{name}.py"
    return name


def _build_test_environment(temp_path: Path) -> dict[str, str]:
    existing_pythonpath = os.environ.get("PYTHONPATH", "")
    pythonpath = str(temp_path) if not existing_pythonpath else f"{temp_path}{os.pathsep}{existing_pythonpath}"
    return {
        **os.environ,
        "PYTHONPATH": pythonpath,
        "PYTHONDONTWRITEBYTECODE": "1",
    }


def _build_summary(
    *,
    command: list[str],
    status: str,
    exit_code: int,
    duration_seconds: float,
    detail: str,
) -> str:
    return "\n".join(
        [
            f"- Status: `{status}`",
            f"- Command: `{' '.join(command)}`",
            f"- Exit code: `{exit_code}`",
            f"- Duration: `{duration_seconds:.2f}s`",
            f"- Detail: {detail}",
        ]
    )


def _build_process_error(exit_code: int, stdout: str, stderr: str) -> dict[str, Any]:
    return {
        "type": "pytest_failed",
        "message": _first_non_empty_error_line(stdout, stderr) or f"pytest exited with code {exit_code}.",
        "exit_code": exit_code,
    }


def _first_non_empty_error_line(stdout: str, stderr: str) -> str:
    for text in (stderr, stdout):
        for line in text.splitlines():
            stripped = line.strip()
            if stripped:
                return stripped
    return ""


def _strip_code_fence(value: str) -> str:
    stripped = value.strip()
    match = re.fullmatch(r"```[A-Za-z0-9_-]*\s*\n(?P<body>[\s\S]*?)\n?```", stripped)
    if not match:
        return stripped
    return match.group("body").strip()


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
