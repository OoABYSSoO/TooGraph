from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.tools.local_llm import append_usage_introduction, generate_hello_greeting, output_usage_introduction


ToolFunc = Callable[[dict[str, Any], dict[str, Any] | None], dict[str, Any]]


def get_tool_registry() -> dict[str, ToolFunc]:
    return {
        "generate_hello_greeting": generate_hello_greeting,
        "append_usage_introduction": append_usage_introduction,
        "output_usage_introduction": output_usage_introduction,
    }
