from __future__ import annotations

import re
from typing import Any


def evaluate_condition_rule(left_value: Any, operator: str, right_value: Any) -> bool:
    left_value, right_value = normalize_condition_operands(left_value, right_value)
    if operator == "exists":
        return left_value not in (None, "", [], {})
    if operator == "==":
        return left_value == right_value
    if operator == "!=":
        return left_value != right_value
    if operator == ">":
        return left_value > right_value
    if operator == "<":
        return left_value < right_value
    if operator == ">=":
        return left_value >= right_value
    if operator == "<=":
        return left_value <= right_value
    if operator == "contains":
        return coerce_condition_text(right_value) in coerce_condition_text(left_value)
    if operator == "not_contains":
        return coerce_condition_text(right_value) not in coerce_condition_text(left_value)
    raise ValueError(f"Unsupported condition operator '{operator}'.")


def normalize_condition_operands(left_value: Any, right_value: Any) -> tuple[Any, Any]:
    left_number = parse_condition_number(left_value)
    right_number = parse_condition_number(right_value)
    if left_number is not None and right_number is not None:
        return left_number, right_number
    return left_value, right_value


def parse_condition_number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if not isinstance(value, str):
        return None

    trimmed = value.strip()
    if not trimmed:
        return None
    if re.fullmatch(r"[+-]?\d+", trimmed):
        return int(trimmed)
    if re.fullmatch(r"[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?", trimmed):
        return float(trimmed)
    return None


def coerce_condition_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def resolve_branch_key(branches: list[str], branch_mapping: dict[str, str], condition_result: Any) -> str | None:
    lookup_keys = [
        str(condition_result).lower(),
        str(condition_result),
    ]
    for lookup_key in lookup_keys:
        if lookup_key in branch_mapping:
            return branch_mapping[lookup_key]

    if isinstance(condition_result, bool):
        bool_key = "true" if condition_result else "false"
        if bool_key in branches:
            return bool_key
        if len(branches) >= 2:
            return branches[0] if condition_result else branches[1]

    normalized_matches = {branch.lower(): branch for branch in branches}
    for lookup_key in lookup_keys:
        if lookup_key.lower() in normalized_matches:
            return normalized_matches[lookup_key.lower()]
    return None
