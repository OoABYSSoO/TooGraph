from __future__ import annotations

from typing import Any


STATE_SCHEMA: list[dict[str, Any]] = [
    {
        "key": "name",
        "type": "string",
        "role": "input",
        "title": "Name",
        "description": "Name sent to the local language model.",
    },
    {
        "key": "greeting",
        "type": "string",
        "role": "final",
        "title": "Greeting",
        "description": "Greeting returned by the local language model.",
    },
    {
        "key": "final_result",
        "type": "string",
        "role": "final",
        "title": "Final Result",
        "description": "Final run result shown in the UI.",
    },
    {
        "key": "llm_response",
        "type": "object",
        "role": "artifact",
        "title": "LLM Response Metadata",
        "description": "Connection information used for the local LLM request.",
    },
]


def get_hello_world_state_schema() -> list[dict[str, Any]]:
    return [dict(field) for field in STATE_SCHEMA]


def get_hello_world_state_keys() -> list[str]:
    return [field["key"] for field in STATE_SCHEMA]
