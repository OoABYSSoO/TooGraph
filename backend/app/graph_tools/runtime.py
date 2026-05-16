from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.actions.runtime import (
    ScriptActionRunner,
    build_script_action_runner,
    validate_script_runtime_spec,
)


ScriptToolRunner = ScriptActionRunner


def build_script_tool_runner(
    *,
    tool_key: str,
    tool_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
    timeout_seconds: float | int | None = None,
) -> ScriptToolRunner:
    return build_script_action_runner(
        action_key=tool_key,
        action_dir=tool_dir,
        runtime_type=runtime_type,
        entrypoint=entrypoint,
        command=command,
        timeout_seconds=timeout_seconds,
    )


def validate_tool_runtime_spec(
    *,
    tool_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
) -> list[str]:
    return validate_script_runtime_spec(
        action_dir=tool_dir,
        runtime_type=runtime_type,
        entrypoint=entrypoint,
        command=command or [],
    )


def invoke_tool(tool_func: Any, tool_inputs: dict[str, Any], *, context: dict[str, Any] | None = None) -> dict[str, Any]:
    if hasattr(tool_func, "invoke"):
        result = tool_func.invoke(tool_inputs, context=context)
    else:
        try:
            result = tool_func(tool_inputs, context=context)
        except TypeError:
            result = tool_func(tool_inputs)
    if not isinstance(result, dict):
        return {
            "status": "failed",
            "error_type": "invalid_tool_output",
            "error": "Tool runtime returned a non-object result.",
        }
    return result
