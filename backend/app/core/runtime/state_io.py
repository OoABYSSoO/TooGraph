from __future__ import annotations

import copy
from typing import Any

from app.core.runtime.state import utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument


def initialize_graph_state(graph: NodeSystemGraphDocument, state: dict[str, Any]) -> None:
    initialized_values = {
        state_name: copy.deepcopy(definition.value)
        for state_name, definition in graph.state_schema.items()
    }
    initialized_values.update(dict(state.get("state_values", {})))
    state["state_values"] = initialized_values
    state["state_last_writers"] = dict(state.get("state_last_writers", {}))
    state["state_events"] = list(state.get("state_events", []))
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
        value = copy.deepcopy(output_values.get(binding.state))
        previous_value = copy.deepcopy(state_values.get(binding.state))
        changed = previous_value != value
        state_values[binding.state] = value
        writer_record = {
            "node_id": node_name,
            "output_key": binding.state,
            "mode": binding.mode.value,
            "updated_at": utc_now_iso(),
        }
        state_last_writers[binding.state] = writer_record
        state_events.append(
            {
                "node_id": node_name,
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
                "created_at": utc_now_iso(),
            }
        )
        write_records.append(
            {
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
                "changed": changed,
            }
        )
    return write_records
