from __future__ import annotations

import json
import re
from typing import Any

from app.core.schemas.node_system import NodeSystemStateDefinition


def build_output_key_aliases(
    output_keys: list[str],
    state_schema: dict[str, NodeSystemStateDefinition],
) -> dict[str, list[str]]:
    name_counts: dict[str, int] = {}
    aliases: dict[str, list[str]] = {}
    candidate_names: list[str] = []
    for key in output_keys:
        definition = state_schema.get(key)
        if definition is None:
            continue
        name = definition.name.strip()
        if name and name != key:
            candidate_names.append(name)
    for name in candidate_names:
        name_counts[name] = name_counts.get(name, 0) + 1
    for key in output_keys:
        definition = state_schema.get(key)
        if definition is None:
            continue
        name = definition.name.strip()
        if name and name != key and name_counts.get(name, 0) == 1:
            aliases[key] = [name]
    return aliases


def parse_llm_json_response(
    content: str,
    output_keys: list[str],
    *,
    output_key_aliases: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    aliases = output_key_aliases or {}
    if not content:
        return {key: "" for key in output_keys}
    cleaned = re.sub(r"^\s*```(?:json)?\s*\n?", "", content)
    cleaned = re.sub(r"\n?\s*```\s*$", "", cleaned).strip()

    candidate_payloads = [cleaned]
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")
    if json_start != -1 and json_end > json_start:
        candidate_payloads.append(cleaned[json_start : json_end + 1].strip())

    for candidate in candidate_payloads:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return {key: read_parsed_output_value(parsed, key, aliases) for key in output_keys}
        except json.JSONDecodeError:
            continue

    key_value_matches: dict[str, str] = {}
    for line in cleaned.splitlines():
        match = re.match(r'^\s*["\']?([A-Za-z0-9_\-]+)["\']?\s*[:：]\s*(.+?)\s*$', line)
        if not match:
            continue
        key, value = match.groups()
        if key in output_keys:
            key_value_matches[key] = value.strip().strip('"').strip("'")

    if key_value_matches:
        return {
            key: key_value_matches.get(key, "")
            for key in output_keys
        }

    if len(output_keys) == 1:
        key = output_keys[0]
        single_match = re.match(rf'^\s*{re.escape(key)}\s*[:：]\s*(.+?)\s*$', cleaned, flags=re.IGNORECASE | re.DOTALL)
        if single_match:
            return {key: single_match.group(1).strip()}

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {key: read_parsed_output_value(parsed, key, aliases) for key in output_keys}
    except json.JSONDecodeError:
        pass
    return {key: cleaned for key in output_keys}


def read_parsed_output_value(parsed: dict[str, Any], output_key: str, aliases: dict[str, list[str]]) -> Any:
    if output_key in parsed:
        return parsed.get(output_key)
    for alias in aliases.get(output_key, []):
        if alias in parsed:
            return parsed.get(alias)
    return None
