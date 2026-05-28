from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
import json
from typing import Any


BuddyVisibleMessageCallback = Callable[[dict[str, Any]], None]


def build_buddy_visible_message_listener(
    run_state: dict[str, Any],
    callback: BuddyVisibleMessageCallback | None,
) -> Callable[[str, dict[str, Any]], None]:
    if callback is None:
        return lambda _event_type, _payload: None
    graph_snapshot = _run_graph_snapshot(run_state)
    bindings = _build_public_output_bindings(graph_snapshot)
    if not bindings:
        return lambda _event_type, _payload: None

    run_id = str(run_state.get("run_id") or "").strip()
    output_state = _create_public_output_runtime_state()
    emitted_output_message_ids: set[str] = set()
    stream_state = {"placeholder_active": False, "placeholder_count": 0}

    def emit_placeholder(node_id: str, timestamp_ms: int) -> None:
        if stream_state["placeholder_active"]:
            return
        stream_state["placeholder_count"] += 1
        callback(
            {
                "kind": "placeholder",
                "message_id": _build_visible_placeholder_id(run_id, stream_state["placeholder_count"], node_id),
                "node_id": node_id,
                "created_at_ms": timestamp_ms,
            }
        )
        stream_state["placeholder_active"] = True

    def emit_visible_outputs() -> None:
        for message_id in list(output_state["order"]):
            if message_id in emitted_output_message_ids:
                continue
            message = output_state["messages_by_output_id"].get(message_id)
            if not _is_public_output_message_visible(message):
                continue
            text = _stringify_public_output_content(message.get("content"))
            if not text:
                continue
            callback(
                {
                    "kind": "output",
                    "message_id": _build_visible_output_id(run_id, message_id),
                    "output_message_id": message_id,
                    "text": text,
                    "created_at_ms": _safe_int(message.get("updated_at_ms")),
                }
            )
            emitted_output_message_ids.add(message_id)
            stream_state["placeholder_active"] = False

    def listener(event_type: str, payload: dict[str, Any]) -> None:
        timestamp_ms = _event_timestamp_ms(payload)
        node_id = str(payload.get("node_id") or "").strip()
        if event_type == "node.started":
            _start_public_output_timers(output_state, bindings, node_id, timestamp_ms)
            if _node_starts_visible_buddy_message(graph_snapshot, bindings, node_id, payload):
                emit_placeholder(node_id, timestamp_ms)
        elif event_type == "state.updated":
            _complete_public_state_output(
                output_state,
                bindings,
                node_id,
                str(payload.get("state_key") or payload.get("stateKey") or "").strip(),
                payload.get("value"),
                timestamp_ms,
            )
        elif event_type == "node.completed":
            _activate_completed_public_output_branches(
                output_state,
                bindings,
                node_id,
                str(payload.get("selected_branch") or payload.get("selectedBranch") or "").strip(),
                timestamp_ms,
            )
        else:
            return
        emit_visible_outputs()

    return listener


def resolve_buddy_visible_reply_parts(run_state: dict[str, Any]) -> list[str]:
    graph_snapshot = _run_graph_snapshot(run_state)
    bindings = _build_public_output_bindings(graph_snapshot)
    if not bindings:
        return []

    output_state = _create_public_output_runtime_state()
    for event in _list_public_output_replay_events(run_state):
        event_type = str(event.get("event_type") or "")
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        timestamp_ms = _safe_int(event.get("timestamp_ms"))
        node_id = str(payload.get("node_id") or "").strip()
        if event_type == "node.started":
            _start_public_output_timers(output_state, bindings, node_id, timestamp_ms)
        elif event_type == "state.updated":
            _complete_public_state_output(
                output_state,
                bindings,
                node_id,
                str(payload.get("state_key") or payload.get("stateKey") or "").strip(),
                payload.get("value"),
                timestamp_ms,
            )
        elif event_type == "node.completed":
            _activate_completed_public_output_branches(
                output_state,
                bindings,
                node_id,
                str(payload.get("selected_branch") or payload.get("selectedBranch") or "").strip(),
                timestamp_ms,
            )

    for preview in _list_run_output_previews(run_state):
        if not isinstance(preview, dict):
            continue
        binding = _find_public_output_binding_for_preview(
            bindings,
            str(preview.get("node_id") or preview.get("nodeId") or "").strip(),
            str(preview.get("source_key") or preview.get("sourceKey") or preview.get("state_key") or "").strip(),
        )
        if not binding or _list_message_ids_for_public_output_source(output_state, binding["output_node_id"]):
            continue
        value = preview.get("value") if "value" in preview else preview.get("content")
        _upsert_public_output_messages_for_binding(output_state, binding, value, "completed", _completed_run_timestamp_ms(run_state))

    parts: list[str] = []
    for message_id in output_state["order"]:
        message = output_state["messages_by_output_id"].get(message_id)
        if not _is_public_output_message_visible(message):
            continue
        text = _stringify_public_output_content(message.get("content"))
        if text:
            parts.append(text)
    return parts


def _run_graph_snapshot(run_state: dict[str, Any]) -> dict[str, Any]:
    return run_state.get("graph_snapshot") if isinstance(run_state.get("graph_snapshot"), dict) else {}


def _build_visible_placeholder_id(run_id: str, count: int, node_id: str) -> str:
    prefix = run_id or "run"
    return f"{prefix}:trace:{count}:{node_id or 'node'}"


def _build_visible_output_id(run_id: str, output_message_id: str) -> str:
    prefix = run_id or "run"
    return f"{prefix}:output:{output_message_id}"


def _event_timestamp_ms(payload: dict[str, Any]) -> int:
    return (
        _parse_event_timestamp_ms(payload.get("created_at"))
        or _parse_event_timestamp_ms(payload.get("started_at"))
        or 0
    )


def _build_public_output_bindings(graph_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = graph_snapshot.get("nodes") if isinstance(graph_snapshot.get("nodes"), dict) else {}
    state_schema = graph_snapshot.get("state_schema") if isinstance(graph_snapshot.get("state_schema"), dict) else {}
    bindings: list[dict[str, Any]] = []
    for node_id, node in nodes.items():
        if not isinstance(node, dict) or node.get("kind") != "output":
            continue
        reads = node.get("reads") if isinstance(node.get("reads"), list) else []
        if len(reads) != 1 or not isinstance(reads[0], dict):
            continue
        state_key = str(reads[0].get("state") or "").strip()
        if not state_key:
            continue
        definition = state_schema.get(state_key) if isinstance(state_schema.get(state_key), dict) else {}
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        bindings.append(
            {
                "output_node_id": str(node_id),
                "output_node_name": str(node.get("name") or node_id).strip() or str(node_id),
                "state_key": state_key,
                "state_name": str(definition.get("name") or state_key).strip() or state_key,
                "state_type": str(definition.get("type") or "text").strip() or "text",
                "display_mode": str(config.get("displayMode") or config.get("display_mode") or "auto").strip() or "auto",
                "upstream_edges": _resolve_public_output_upstream_edges(graph_snapshot, str(node_id)),
            }
        )
    return bindings


def _resolve_public_output_upstream_edges(graph_snapshot: dict[str, Any], output_node_id: str) -> list[dict[str, str]]:
    upstream: list[dict[str, str]] = []
    edges = graph_snapshot.get("edges") if isinstance(graph_snapshot.get("edges"), list) else []
    for edge in edges:
        if not isinstance(edge, dict) or edge.get("target") != output_node_id:
            continue
        source = str(edge.get("source") or "").strip()
        if source:
            upstream.append({"kind": "regular", "source": source})
    conditional_edges = graph_snapshot.get("conditional_edges") if isinstance(graph_snapshot.get("conditional_edges"), list) else []
    for route in conditional_edges:
        if not isinstance(route, dict):
            continue
        source = str(route.get("source") or "").strip()
        branches = route.get("branches") if isinstance(route.get("branches"), dict) else {}
        for branch, target in branches.items():
            if target == output_node_id and source:
                upstream.append({"kind": "conditional", "source": source, "branch": str(branch or "").strip()})
    return upstream


def _create_public_output_runtime_state() -> dict[str, Any]:
    return {
        "order": [],
        "messages_by_output_id": {},
        "started_at_by_output_id": {},
        "latest_values_by_state_key": {},
        "activated_output_node_ids": {},
    }


def _node_starts_visible_buddy_message(
    graph_snapshot: dict[str, Any],
    bindings: list[dict[str, Any]],
    node_id: str,
    payload: dict[str, Any],
) -> bool:
    if not node_id:
        return False
    node_type = str(payload.get("node_type") or "").strip()
    if node_type in {"input", "output"}:
        return False
    nodes = graph_snapshot.get("nodes") if isinstance(graph_snapshot.get("nodes"), dict) else {}
    node = nodes.get(node_id) if isinstance(nodes.get(node_id), dict) else {}
    if node.get("kind") in {"input", "output"}:
        return False
    if node_type == "condition" or node.get("kind") == "condition":
        if _condition_is_on_direct_writer_duplicate_output_route(graph_snapshot, bindings, node_id):
            return False
    return _node_can_reach_public_output(graph_snapshot, node_id, {binding["output_node_id"] for binding in bindings})


def _condition_is_on_direct_writer_duplicate_output_route(
    graph_snapshot: dict[str, Any],
    bindings: list[dict[str, Any]],
    condition_node_id: str,
) -> bool:
    node = _graph_node(graph_snapshot, condition_node_id)
    if not _is_transparent_condition_node(node):
        return False
    for binding in bindings:
        output_node_id = str(binding.get("output_node_id") or "").strip()
        state_key = str(binding.get("state_key") or "").strip()
        if not output_node_id or not state_key:
            continue
        for edge in binding.get("upstream_edges") or []:
            if not isinstance(edge, dict) or edge.get("kind") != "regular":
                continue
            source_node_id = str(edge.get("source") or "").strip()
            if not _node_writes_state(graph_snapshot, source_node_id, state_key):
                continue
            if _condition_only_route_includes_node_to_output(
                graph_snapshot,
                source_node_id,
                condition_node_id,
                output_node_id,
            ):
                return True
    return False


def _condition_only_route_includes_node_to_output(
    graph_snapshot: dict[str, Any],
    source_node_id: str,
    condition_node_id: str,
    output_node_id: str,
) -> bool:
    adjacency = _build_graph_adjacency(graph_snapshot)
    queue = [(node_id, False) for node_id in adjacency.get(source_node_id, [])]
    seen: set[tuple[str, bool]] = set()
    while queue:
        current_node_id, includes_condition = queue.pop(0)
        current_node_id = str(current_node_id or "").strip()
        if not current_node_id or (current_node_id, includes_condition) in seen:
            continue
        seen.add((current_node_id, includes_condition))
        if current_node_id == output_node_id:
            if includes_condition:
                return True
            continue
        current_node = _graph_node(graph_snapshot, current_node_id)
        if not _is_transparent_condition_node(current_node):
            continue
        next_includes_condition = includes_condition or current_node_id == condition_node_id
        for next_node_id in adjacency.get(current_node_id, []):
            queue.append((next_node_id, next_includes_condition))
    return False


def _graph_node(graph_snapshot: dict[str, Any], node_id: str) -> dict[str, Any]:
    nodes = graph_snapshot.get("nodes") if isinstance(graph_snapshot.get("nodes"), dict) else {}
    node = nodes.get(node_id) if isinstance(nodes.get(node_id), dict) else {}
    return node if isinstance(node, dict) else {}


def _is_transparent_condition_node(node: dict[str, Any]) -> bool:
    writes = node.get("writes") if isinstance(node.get("writes"), list) else []
    return node.get("kind") == "condition" and not writes


def _node_writes_state(graph_snapshot: dict[str, Any], node_id: str, state_key: str) -> bool:
    if not node_id or not state_key:
        return False
    node = _graph_node(graph_snapshot, node_id)
    writes = node.get("writes") if isinstance(node.get("writes"), list) else []
    return any(isinstance(write, dict) and write.get("state") == state_key for write in writes)


def _node_can_reach_public_output(graph_snapshot: dict[str, Any], node_id: str, output_node_ids: set[str]) -> bool:
    if node_id in output_node_ids:
        return True
    adjacency = _build_graph_adjacency(graph_snapshot)
    queue = list(adjacency.get(node_id, []))
    seen: set[str] = set()
    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        if current in output_node_ids:
            return True
        queue.extend(adjacency.get(current, []))
    return False


def _build_graph_adjacency(graph_snapshot: dict[str, Any]) -> dict[str, list[str]]:
    adjacency: dict[str, list[str]] = {}
    edges = graph_snapshot.get("edges") if isinstance(graph_snapshot.get("edges"), list) else []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source and target:
            adjacency.setdefault(source, []).append(target)
    conditional_edges = graph_snapshot.get("conditional_edges") if isinstance(graph_snapshot.get("conditional_edges"), list) else []
    for route in conditional_edges:
        if not isinstance(route, dict):
            continue
        source = str(route.get("source") or "").strip()
        branches = route.get("branches") if isinstance(route.get("branches"), dict) else {}
        for target in branches.values():
            normalized_target = str(target or "").strip()
            if source and normalized_target:
                adjacency.setdefault(source, []).append(normalized_target)
    return adjacency


def _list_public_output_replay_events(run_state: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    node_executions = run_state.get("node_executions") if isinstance(run_state.get("node_executions"), list) else []
    for index, execution in enumerate(node_executions):
        if not isinstance(execution, dict):
            continue
        started_ms = _parse_event_timestamp_ms(execution.get("started_at"))
        if started_ms is not None:
            events.append(
                {
                    "event_type": "node.started",
                    "timestamp_ms": started_ms,
                    "order": index * 3,
                    "payload": {"node_id": execution.get("node_id"), "started_at": execution.get("started_at")},
                }
            )
        finished_ms = _parse_event_timestamp_ms(execution.get("finished_at"))
        if finished_ms is not None:
            artifacts = execution.get("artifacts") if isinstance(execution.get("artifacts"), dict) else {}
            status = str(execution.get("status") or "").strip()
            events.append(
                {
                    "event_type": "node.failed" if status in {"failed", "error"} else "node.completed",
                    "timestamp_ms": finished_ms,
                    "order": index * 3 + 2,
                    "payload": {
                        "node_id": execution.get("node_id"),
                        "selected_branch": artifacts.get("selected_branch") or "",
                        "created_at": execution.get("finished_at"),
                    },
                }
            )
    for event in _list_run_state_events(run_state):
        if not isinstance(event, dict):
            continue
        created_ms = _parse_event_timestamp_ms(event.get("created_at"))
        if created_ms is None:
            continue
        events.append(
            {
                "event_type": "state.updated",
                "timestamp_ms": created_ms,
                "order": 10_000 + _safe_int(event.get("sequence")),
                "payload": event,
            }
        )
    events.sort(key=lambda item: (_safe_int(item.get("timestamp_ms")), _safe_int(item.get("order"))))
    return events


def _list_run_state_events(run_state: dict[str, Any]) -> list[Any]:
    artifacts = run_state.get("artifacts") if isinstance(run_state.get("artifacts"), dict) else {}
    artifact_events = artifacts.get("state_events") if isinstance(artifacts.get("state_events"), list) else []
    if artifact_events:
        return artifact_events
    return run_state.get("state_events") if isinstance(run_state.get("state_events"), list) else []


def _list_run_output_previews(run_state: dict[str, Any]) -> list[Any]:
    artifacts = run_state.get("artifacts") if isinstance(run_state.get("artifacts"), dict) else {}
    previews: list[Any] = []
    if isinstance(run_state.get("output_previews"), list):
        previews.extend(run_state["output_previews"])
    if isinstance(artifacts.get("output_previews"), list):
        previews.extend(artifacts["output_previews"])
    return previews


def _start_public_output_timers(
    output_state: dict[str, Any],
    bindings: list[dict[str, Any]],
    node_id: str,
    timestamp_ms: int,
) -> None:
    if not node_id:
        return
    for binding in bindings:
        if node_id not in _public_output_upstream_node_ids(binding):
            continue
        source_id = binding["output_node_id"]
        if any(
            output_state["messages_by_output_id"].get(message_id, {}).get("status") == "streaming"
            for message_id in _list_message_ids_for_public_output_source(output_state, source_id)
        ):
            continue
        output_state["started_at_by_output_id"][source_id] = timestamp_ms


def _complete_public_state_output(
    output_state: dict[str, Any],
    bindings: list[dict[str, Any]],
    node_id: str,
    state_key: str,
    value: Any,
    timestamp_ms: int,
) -> None:
    if not state_key:
        return
    output_state["latest_values_by_state_key"][state_key] = value
    for binding in bindings:
        if binding["state_key"] != state_key:
            continue
        if not output_state["activated_output_node_ids"].get(binding["output_node_id"]) and not _is_direct_regular_output_update(binding, node_id):
            continue
        _upsert_public_output_messages_for_binding(output_state, binding, value, "completed", timestamp_ms)


def _activate_completed_public_output_branches(
    output_state: dict[str, Any],
    bindings: list[dict[str, Any]],
    node_id: str,
    selected_branch: str,
    timestamp_ms: int,
) -> None:
    if not node_id:
        return
    for binding in bindings:
        activation_edges = _list_public_output_activation_edges(binding, node_id, selected_branch)
        if not activation_edges:
            continue
        output_state["activated_output_node_ids"][binding["output_node_id"]] = True
        if not any(edge.get("kind") == "conditional" for edge in activation_edges):
            continue
        if binding["state_key"] not in output_state["latest_values_by_state_key"]:
            continue
        value = output_state["latest_values_by_state_key"][binding["state_key"]]
        if _has_completed_public_output_value(output_state, binding["output_node_id"], binding["state_key"], value):
            continue
        _upsert_public_output_messages_for_binding(output_state, binding, value, "completed", timestamp_ms)


def _upsert_public_output_messages_for_binding(
    output_state: dict[str, Any],
    binding: dict[str, Any],
    content: Any,
    status: str,
    timestamp_ms: int,
) -> None:
    package_outputs = _list_result_package_public_output_messages(binding, content)
    if package_outputs:
        for output in package_outputs:
            _upsert_public_output_message(output_state, output["binding"], output["content"], status, timestamp_ms)
        return
    _upsert_public_output_message(output_state, binding, content, status, timestamp_ms)


def _upsert_public_output_message(
    output_state: dict[str, Any],
    binding: dict[str, Any],
    content: Any,
    status: str,
    timestamp_ms: int,
) -> None:
    source_output_node_id = binding.get("source_output_node_id") or binding["output_node_id"]
    message_id = _resolve_public_output_message_id(output_state, binding, source_output_node_id, status)
    existing = output_state["messages_by_output_id"].get(message_id)
    message = {
        "output_node_id": message_id,
        "source_output_node_id": source_output_node_id,
        "output_node_name": binding["output_node_name"],
        "state_key": binding["state_key"],
        "state_name": binding["state_name"],
        "state_type": binding["state_type"],
        "display_mode": binding["display_mode"],
        "content": content,
        "updated_at_ms": timestamp_ms,
        "status": status,
    }
    output_state["messages_by_output_id"][message_id] = message
    if existing is None:
        output_state["order"].append(message_id)


def _resolve_public_output_message_id(
    output_state: dict[str, Any],
    binding: dict[str, Any],
    source_output_node_id: str,
    status: str,
) -> str:
    latest_streaming_message_id = _find_latest_message_id_for_public_output_source(
        output_state,
        source_output_node_id,
        binding["state_key"],
        "streaming",
    )
    if latest_streaming_message_id:
        return latest_streaming_message_id
    output_node_id = binding["output_node_id"]
    existing = output_state["messages_by_output_id"].get(output_node_id)
    if existing is None:
        return output_node_id
    if existing.get("status") == "streaming" or status == "streaming":
        return output_node_id if existing.get("status") == "streaming" else _next_public_output_message_id(output_state, output_node_id, source_output_node_id)
    return _next_public_output_message_id(output_state, output_node_id, source_output_node_id)


def _find_latest_message_id_for_public_output_source(
    output_state: dict[str, Any],
    source_output_node_id: str,
    state_key: str,
    status: str,
) -> str:
    for message_id in reversed(output_state["order"]):
        message = output_state["messages_by_output_id"].get(message_id)
        if not isinstance(message, dict):
            continue
        if (
            message.get("status") == status
            and _public_output_source_node_id(message) == source_output_node_id
            and message.get("state_key") == state_key
        ):
            return message_id
    return ""


def _next_public_output_message_id(output_state: dict[str, Any], base_output_node_id: str, source_output_node_id: str) -> str:
    count = 0
    for message_id in output_state["order"]:
        message = output_state["messages_by_output_id"].get(message_id)
        if _public_output_source_node_id(message) == source_output_node_id:
            count += 1
    candidate = f"{base_output_node_id}:{max(2, count + 1)}"
    while candidate in output_state["messages_by_output_id"]:
        count += 1
        candidate = f"{base_output_node_id}:{count + 1}"
    return candidate


def _list_result_package_public_output_messages(
    binding: dict[str, Any],
    content: Any,
) -> list[dict[str, Any]]:
    if not _is_result_package_value(content):
        return []
    outputs = content.get("outputs")
    if not isinstance(outputs, dict):
        return []
    messages: list[dict[str, Any]] = []
    for output_key, raw_output in outputs.items():
        output_key_text = str(output_key or "").strip()
        if not output_key_text:
            continue
        output_record = raw_output if isinstance(raw_output, dict) else {}
        output_value = output_record.get("value") if "value" in output_record else raw_output
        state_type = str(output_record.get("type") or _infer_public_output_state_type(output_value) or binding["state_type"]).strip()
        messages.append(
            {
                "binding": {
                    **binding,
                    "output_node_id": f"{binding['output_node_id']}:{output_key_text}",
                    "source_output_node_id": binding["output_node_id"],
                    "state_key": f"{binding['state_key']}.{output_key_text}",
                    "state_name": str(output_record.get("name") or output_key_text).strip() or output_key_text,
                    "state_type": state_type,
                    "display_mode": _resolve_result_package_display_mode(binding["display_mode"], state_type, output_value),
                },
                "content": output_value,
            }
        )
    return messages


def _find_public_output_binding_for_preview(
    bindings: list[dict[str, Any]],
    node_id: str,
    source_key: str,
) -> dict[str, Any] | None:
    for binding in bindings:
        if node_id and binding["output_node_id"] == node_id:
            return binding
        if source_key and binding["state_key"] == source_key:
            return binding
    return None


def _list_message_ids_for_public_output_source(output_state: dict[str, Any], output_node_id: str) -> list[str]:
    return [
        message_id
        for message_id in output_state["order"]
        if _public_output_source_node_id(output_state["messages_by_output_id"].get(message_id)) == output_node_id
    ]


def _public_output_source_node_id(message: Any) -> str:
    if not isinstance(message, dict):
        return ""
    return str(message.get("source_output_node_id") or message.get("output_node_id") or "").strip()


def _public_output_upstream_node_ids(binding: dict[str, Any]) -> list[str]:
    return [str(edge.get("source") or "").strip() for edge in binding.get("upstream_edges", []) if isinstance(edge, dict)]


def _is_direct_regular_output_update(binding: dict[str, Any], node_id: str) -> bool:
    if not node_id:
        return False
    return any(edge.get("kind") == "regular" and edge.get("source") == node_id for edge in binding.get("upstream_edges", []))


def _list_public_output_activation_edges(binding: dict[str, Any], node_id: str, selected_branch: str) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for edge in binding.get("upstream_edges", []):
        if not isinstance(edge, dict) or edge.get("source") != node_id:
            continue
        if edge.get("kind") == "regular":
            result.append(edge)
        elif edge.get("kind") == "conditional" and selected_branch and edge.get("branch") == selected_branch:
            result.append(edge)
    return result


def _has_completed_public_output_value(
    output_state: dict[str, Any],
    source_output_node_id: str,
    state_key: str,
    value: Any,
) -> bool:
    for message_id in _list_message_ids_for_public_output_source(output_state, source_output_node_id):
        message = output_state["messages_by_output_id"].get(message_id)
        if (
            isinstance(message, dict)
            and message.get("status") == "completed"
            and message.get("state_key") == state_key
            and _is_same_output_value(message.get("content"), value)
        ):
            return True
    return False


def _is_same_output_value(left: Any, right: Any) -> bool:
    if left is right or left == right:
        return True
    try:
        return json.dumps(left, ensure_ascii=False, sort_keys=True) == json.dumps(right, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return False


def _is_public_output_message_visible(message: Any) -> bool:
    if not isinstance(message, dict):
        return False
    value = message.get("content")
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def _stringify_public_output_content(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2).strip()
    return str(value).strip()


def _resolve_result_package_display_mode(configured_display_mode: str, state_type: str, output_value: Any) -> str:
    normalized_type = state_type.strip().lower()
    if normalized_type in {"markdown", "html"}:
        return normalized_type
    if normalized_type in {"json", "capability", "result_package"}:
        return "json"
    if normalized_type in {"file", "image", "audio", "video"}:
        return "documents"
    if normalized_type in {"text", "number", "boolean"}:
        return "plain"
    if configured_display_mode and configured_display_mode != "auto":
        return configured_display_mode
    if isinstance(output_value, (dict, list)):
        return "json"
    return "auto"


def _infer_public_output_state_type(value: Any) -> str:
    if isinstance(value, str):
        return "text"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, (dict, list)):
        return "json"
    return ""


def _is_result_package_value(value: Any) -> bool:
    return isinstance(value, dict) and value.get("kind") == "result_package" and isinstance(value.get("outputs"), dict)


def _completed_run_timestamp_ms(run_state: dict[str, Any]) -> int:
    return (
        _parse_event_timestamp_ms(run_state.get("completed_at"))
        or _parse_event_timestamp_ms(run_state.get("updated_at"))
        or _parse_event_timestamp_ms(run_state.get("created_at"))
        or 0
    )


def _parse_event_timestamp_ms(value: Any) -> int | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        normalized = value.strip().replace("Z", "+00:00")
        return int(datetime.fromisoformat(normalized).timestamp() * 1000)
    except ValueError:
        return None


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
