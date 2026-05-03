from __future__ import annotations

import copy
from typing import Any

from app.core.runtime.state import utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemStateType, StateWriteMode


def input_state_keys(graph: NodeSystemGraphDocument) -> set[str]:
    keys: set[str] = set()
    for node in graph.nodes.values():
        if getattr(node, "kind", None) != "input":
            continue
        for binding in getattr(node, "writes", []):
            keys.add(binding.state)
    return keys


def default_empty_state_value(state_type: NodeSystemStateType) -> Any:
    if state_type == NodeSystemStateType.NUMBER:
        return 0
    if state_type == NodeSystemStateType.BOOLEAN:
        return False
    if state_type in {NodeSystemStateType.OBJECT, NodeSystemStateType.JSON}:
        return {}
    if state_type in {NodeSystemStateType.ARRAY, NodeSystemStateType.FILE_LIST}:
        return []
    return ""


def build_graph_state_values(
    graph: NodeSystemGraphDocument,
    supplied_values: dict[str, Any] | None = None,
    *,
    preserve_supplied_values: bool = False,
    allow_input_state_overrides: bool = False,
) -> dict[str, Any]:
    input_keys = input_state_keys(graph)
    initialized_values = {}
    for state_name, definition in graph.state_schema.items():
        if state_name in input_keys:
            initialized_values[state_name] = copy.deepcopy(definition.value)
        else:
            initialized_values[state_name] = default_empty_state_value(definition.type)

    if preserve_supplied_values:
        initialized_values.update(copy.deepcopy(dict(supplied_values or {})))
    elif allow_input_state_overrides:
        for state_name, value in dict(supplied_values or {}).items():
            if state_name in input_keys:
                initialized_values[state_name] = copy.deepcopy(value)

    return initialized_values


def initialize_graph_state(
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    *,
    preserve_existing_values: bool = False,
) -> None:
    initialized_values = build_graph_state_values(
        graph,
        state.get("state_values", {}),
        preserve_supplied_values=preserve_existing_values,
    )
    state["state_values"] = initialized_values
    if preserve_existing_values:
        state["state_last_writers"] = dict(state.get("state_last_writers", {}))
        state["state_events"] = list(state.get("state_events", []))
    else:
        state["state_last_writers"] = {}
        state["state_events"] = []
    state["state_snapshot"] = {
        "values": dict(initialized_values),
        "last_writers": dict(state["state_last_writers"]),
    }


def collect_node_inputs(node: Any, state: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resolved_inputs: dict[str, Any] = {}
    read_records: list[dict[str, Any]] = []
    for binding in node.reads:
        value = copy.deepcopy(state.get("state_values", {}).get(binding.state))
        resolved_inputs[binding.state] = value
        read_records.append(
            {
                "state_key": binding.state,
                "input_key": binding.state,
                "value": value,
            }
        )
    return resolved_inputs, read_records


def append_state_value(previous_value: Any, next_value: Any) -> Any:
    if next_value is None:
        return copy.deepcopy(previous_value)

    previous = copy.deepcopy(previous_value)
    value = copy.deepcopy(next_value)

    if isinstance(previous, list):
        if isinstance(value, list):
            return _reindex_source_reference_list(previous + value)
        return _reindex_source_reference_list(previous + [value])

    if previous is None or previous == "" or previous == {}:
        return _reindex_source_reference_list(value) if isinstance(value, list) else [value]

    if isinstance(previous, str) and isinstance(value, str):
        return "\n\n".join(part for part in [previous.strip(), value.strip()] if part)

    if isinstance(previous, dict) and isinstance(value, dict):
        merged = dict(previous)
        merged.update(value)
        return merged

    if isinstance(value, list):
        return _reindex_source_reference_list([previous] + value)
    return _reindex_source_reference_list([previous, value])


def _reindex_source_reference_list(value: list[Any]) -> list[Any]:
    if not value or not all(_looks_like_source_reference(item) for item in value):
        return value
    return [{**item, "index": index} for index, item in enumerate(value, start=1)]


def _looks_like_source_reference(item: Any) -> bool:
    if not isinstance(item, dict) or "index" not in item:
        return False
    try:
        int(item["index"])
    except (TypeError, ValueError):
        return False
    has_locator = bool(item.get("url")) or bool(item.get("local_path"))
    has_reference_metadata = any(key in item for key in ("title", "snippet", "status", "error", "local_path"))
    return has_locator and has_reference_metadata


def _next_state_event_sequence(state_events: list[dict[str, Any]]) -> int:
    max_sequence = 0
    for event in state_events:
        try:
            max_sequence = max(max_sequence, int(event.get("sequence", 0)))
        except (TypeError, ValueError):
            continue
    return max_sequence + 1


def apply_state_writes(
    node_name: str,
    write_bindings: list[Any],
    output_values: dict[str, Any],
    state: dict[str, Any],
) -> list[dict[str, Any]]:
    write_records: list[dict[str, Any]] = []
    state_values = state.setdefault("state_values", {})
    state_last_writers = state.setdefault("state_last_writers", {})
    state_events = state.setdefault("state_events", [])

    for binding in write_bindings:
        previous_value = copy.deepcopy(state_values.get(binding.state))
        raw_value = output_values.get(binding.state)
        if binding.mode == StateWriteMode.APPEND or getattr(binding.mode, "value", None) == StateWriteMode.APPEND.value:
            value = append_state_value(previous_value, raw_value)
        else:
            value = copy.deepcopy(raw_value)
        changed = previous_value != value
        state_values[binding.state] = value
        event_sequence = _next_state_event_sequence(state_events)
        created_at = utc_now_iso()
        writer_record = {
            "node_id": node_name,
            "output_key": binding.state,
            "mode": binding.mode.value,
            "updated_at": created_at,
        }
        state_last_writers[binding.state] = writer_record
        state_events.append(
            {
                "node_id": node_name,
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "previous_value": previous_value,
                "value": value,
                "sequence": event_sequence,
                "created_at": created_at,
            }
        )
        write_records.append(
            {
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "previous_value": previous_value,
                "value": value,
                "sequence": event_sequence,
                "created_at": created_at,
                "changed": changed,
            }
        )
    return write_records
