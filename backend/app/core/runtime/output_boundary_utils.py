from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def detect_format(value: Any) -> str:
    """Auto-detect the best format (json/plain/markdown) based on content."""
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2)

    # Try JSON first
    if isinstance(value, (dict, list)) or (isinstance(text, str) and text.startswith(("{"))):
        try:
            if isinstance(text, str):
                json.loads(text)
            else:
                json.loads(json.dumps(value))
            return "json"
        except (json.JSONDecodeError, TypeError):
            pass

    # Detect markdown (has markdown indicators)
    md_patterns = [
        r"^#{1,6}\s",       # headers
        r"^\*\s",           # unordered lists
        r"^\d+\.\s",        # ordered lists
        r"```",              # code blocks
        r"\*\*.*?\*\*",      # bold
        r"\*.*?\*",          # italic
        r"\[.*?\]\(.*?\)",  # links
        r"!\[.*?\]\(.*?\)", # images
        r"^\|.*\|$",        # tables
    ]
    if any(re.search(p, text, re.MULTILINE) for p in md_patterns):
        return "markdown"

    return "plain"


def resolve_format(persist_format: str, value: Any) -> str:
    """Resolve persist format: 'auto' detects from content, otherwise uses the specified format."""
    if persist_format == "auto":
        return detect_format(value)
    return persist_format if persist_format in {"txt", "md", "json"} else "txt"


def resolve_display_mode(display_mode: str, value: Any) -> str:
    """Resolve display mode: 'auto' detects from content, otherwise uses the specified mode."""
    if display_mode == "auto":
        return detect_format(value)
    return display_mode


def save_output_value(
    *,
    run_id: str,
    state_key: str,
    value: Any,
    persist_format: str,
    file_name_template: str,
) -> dict[str, Any]:
    extension = resolve_format(persist_format, value)
    output_root = Path(__file__).resolve().parents[4] / "backend" / "data" / "outputs" / run_id
    output_root.mkdir(parents=True, exist_ok=True)

    safe_file_name = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in file_name_template).strip("_") or state_key
    file_path = output_root / f"{safe_file_name}.{extension}"
    file_path.write_text(serialize_output_value(value, extension), encoding="utf-8")

    return {
        "state_key": state_key,
        "path": str(file_path.relative_to(output_root.parents[2])),
        "format": extension,
        "file_name": file_path.name,
    }


def serialize_output_value(value: Any, extension: str) -> str:
    if extension == "json":
        return json.dumps(value, ensure_ascii=False, indent=2)
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, indent=2)
