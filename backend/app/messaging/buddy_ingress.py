from __future__ import annotations

from copy import deepcopy
import json
import logging
from typing import Any
from uuid import uuid4

from app.buddy import store as buddy_store
from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import listen_run_events
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload
from app.core.storage.run_store import save_run
from app.messaging import store
from app.messaging.buddy_visible_stream import (
    BuddyVisibleMessageCallback,
    build_buddy_visible_message_listener,
    resolve_buddy_visible_reply_parts,
)
from app.messaging.event_model import MessagingInboundEvent
from app.messaging.session_resolver import resolve_buddy_session_for_event
from app.messaging.slash_commands import handle_slash_command, parse_slash_command
from app.templates import get_template


logger = logging.getLogger(__name__)

GLOBAL_RUNTIME_MODEL_OPTION_VALUE = "__toograph_global_model__"
BUDDY_REPLY_STATE_KEYS = ("public_response", "state_4", "state_27", "state_25", "state_26", "state_16", "state_18")


def _event_metadata(event: MessagingInboundEvent, platform_session_id: str) -> dict[str, Any]:
    return {
        "source_kind": "message_platform",
        "platform_id": event.platform_id,
        "binding_id": event.binding_id,
        "platform_session_id": platform_session_id,
        "external_message_id": event.external_message_id,
        "external_update_id": event.external_update_id,
        "external_chat_id": event.chat_id,
        "external_thread_id": event.thread_id,
        "external_sender_id": event.sender_id,
        "external_sender_name": event.sender_name,
        "external_chat_type": event.chat_type,
        "attachments": [attachment.model_dump(mode="json") for attachment in event.attachments],
    }


def run_buddy_graph_for_external_message(
    *,
    session_id: str,
    message_id: str,
    text: str,
    buddy_model_ref: str,
    visible_message_callback: BuddyVisibleMessageCallback | None = None,
) -> dict[str, Any]:
    graph_payload = _build_external_buddy_graph_payload(
        session_id=session_id,
        message_id=message_id,
        text=text,
        buddy_model_ref=buddy_model_ref,
    )
    executed_graph = _build_runtime_graph_document(graph_payload)
    unsupported_reasons = get_langgraph_runtime_unsupported_reasons(executed_graph)
    if unsupported_reasons:
        raise ValueError("Buddy run template is not supported by the LangGraph runtime: " + "; ".join(unsupported_reasons))

    run_state = create_initial_run_state(
        graph_id=executed_graph.graph_id,
        graph_name=executed_graph.name,
        max_revision_round=int(executed_graph.metadata.get("max_revision_round", 1)),
    )
    run_state["runtime_backend"] = "langgraph"
    run_state["template_id"] = str(executed_graph.metadata.get("buddy_template_id") or "")
    run_state["metadata"] = dict(executed_graph.metadata)
    run_state["metadata"]["resolved_runtime_backend"] = "langgraph"
    run_state["graph_snapshot"] = executed_graph.model_dump(by_alias=True, mode="json")
    run_state["node_status_map"] = {node_name: "idle" for node_name in executed_graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)

    live_output_listener = build_buddy_visible_message_listener(run_state, visible_message_callback)
    try:
        with listen_run_events(str(run_state.get("run_id") or ""), live_output_listener):
            execute_node_system_graph_langgraph(executed_graph, run_state, persist_progress=True)
    except Exception as exc:
        logger.exception("External Buddy run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        raise

    save_run(run_state)
    visible_reply_parts = resolve_buddy_visible_reply_parts(run_state)
    final_text = "\n\n".join(visible_reply_parts).strip() or _resolve_buddy_reply_text(run_state)
    if not final_text:
        final_text = "这次 Buddy 运行没有产生可展示回复，请在 TooGraph 的运行详情中查看。"
    if not visible_reply_parts:
        visible_reply_parts = [final_text]
    return {
        "run_id": str(run_state.get("run_id") or ""),
        "status": str(run_state.get("status") or ""),
        "final_text": final_text,
        "visible_reply_text": final_text,
        "visible_reply_parts": visible_reply_parts,
    }


def _build_external_buddy_graph_payload(
    *,
    session_id: str,
    message_id: str,
    text: str,
    buddy_model_ref: str,
) -> dict[str, Any]:
    binding = buddy_store.load_run_template_binding()
    template_id = str(binding.get("template_id") or "buddy_autonomous_loop").strip()
    template = get_template(template_id)
    effective_binding = {
        **deepcopy(binding),
        "template_id": template_id,
        "input_bindings": deepcopy(binding.get("input_bindings") if isinstance(binding.get("input_bindings"), dict) else {}),
    }
    graph = {
        "graph_id": None,
        "name": str(template.get("default_graph_name") or template.get("label") or "Buddy"),
        "state_schema": deepcopy(template.get("state_schema") or {}),
        "nodes": deepcopy(template.get("nodes") or {}),
        "edges": deepcopy(template.get("edges") or []),
        "conditional_edges": deepcopy(template.get("conditional_edges") or []),
        "metadata": {
            **deepcopy(template.get("metadata") if isinstance(template.get("metadata"), dict) else {}),
            "origin": "buddy",
            "buddy_template_id": template_id,
            "buddy_template_binding": deepcopy(effective_binding),
            "buddy_mode": "ask_first",
            "buddy_can_execute_actions": False,
            "buddy_requires_approval": True,
            "capability_permission_policy": {
                "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
                "approval_required_permission_tiers": ["risky"],
            },
            "runtime_context": {
                "invocation_source": "message_platform",
                "buddy_session_id": str(session_id or ""),
                "buddy_current_message_id": str(message_id or ""),
            },
            "action_runtime_context": {},
        },
    }
    _apply_buddy_model_override(graph, buddy_model_ref)
    _apply_buddy_run_template_binding(
        graph,
        effective_binding,
        {
            "current_message": str(text or ""),
            "current_session_id": str(session_id or ""),
            "conversation_history": "",
            "session_summary": str(buddy_store.load_session_summary().get("content") or ""),
            "buddy_home_context": {},
        },
    )
    _validate_graph_payload(graph)
    return graph


def _validate_graph_payload(graph_payload: dict[str, Any]) -> None:
    payload = NodeSystemGraphPayload.model_validate(graph_payload)
    validation = validate_graph(payload)
    if validation.valid:
        return
    issue_text = "; ".join(issue.message for issue in validation.issues)
    raise ValueError(f"Buddy run template is invalid for message platform ingress: {issue_text}")


def _build_runtime_graph_document(graph_payload: dict[str, Any]) -> NodeSystemGraphDocument:
    payload = NodeSystemGraphPayload.model_validate(graph_payload)
    return NodeSystemGraphDocument.model_validate(
        {
            **payload.model_dump(exclude={"graph_id"}, by_alias=True, mode="json"),
            "graph_id": f"runtime_graph_{uuid4().hex[:10]}",
        }
    )


def _apply_buddy_run_template_binding(
    graph: dict[str, Any],
    binding: dict[str, Any],
    source_values: dict[str, Any],
) -> None:
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), dict) else {}
    state_schema = graph.get("state_schema") if isinstance(graph.get("state_schema"), dict) else {}
    input_bindings = binding.get("input_bindings") if isinstance(binding.get("input_bindings"), dict) else {}
    for node_id, source in input_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        node = nodes.get(normalized_node_id)
        if not isinstance(node, dict) or node.get("kind") != "input":
            raise ValueError(f"Buddy run binding references a missing input node: {normalized_node_id}")
        writes = node.get("writes")
        if not isinstance(writes, list) or len(writes) != 1 or not isinstance(writes[0], dict):
            raise ValueError(f"Buddy run input node must write exactly one state: {normalized_node_id}")
        state_key = str(writes[0].get("state") or "").strip()
        if not state_key or state_key not in state_schema:
            raise ValueError(f"Buddy run input node writes a missing state: {normalized_node_id}")
        value = deepcopy(source_values.get(str(source or "").strip(), ""))
        node["config"] = {
            **(node.get("config") if isinstance(node.get("config"), dict) else {}),
            "value": value,
        }
        state_schema[state_key] = {
            **state_schema[state_key],
            "value": deepcopy(value),
        }


def _apply_buddy_model_override(graph: dict[str, Any], value: str) -> None:
    model = str(value or "").strip()
    if not model or model == GLOBAL_RUNTIME_MODEL_OPTION_VALUE:
        graph.get("metadata", {}).pop("buddy_model_ref", None)
        _apply_buddy_model_override_to_nodes(graph.get("nodes"), {"modelSource": "global", "model": ""})
        return
    graph.setdefault("metadata", {})["buddy_model_ref"] = model
    _apply_buddy_model_override_to_nodes(graph.get("nodes"), {"modelSource": "override", "model": model})


def _apply_buddy_model_override_to_nodes(nodes: Any, patch: dict[str, str]) -> None:
    if not isinstance(nodes, dict):
        return
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        if node.get("kind") == "agent":
            node["config"] = {
                **(node.get("config") if isinstance(node.get("config"), dict) else {}),
                **patch,
            }
            continue
        if node.get("kind") == "subgraph":
            config = node.get("config") if isinstance(node.get("config"), dict) else {}
            embedded_graph = config.get("graph") if isinstance(config.get("graph"), dict) else {}
            _apply_buddy_model_override_to_nodes(embedded_graph.get("nodes"), patch)


def _resolve_buddy_reply_text(run_state: dict[str, Any]) -> str:
    graph_snapshot = run_state.get("graph_snapshot") if isinstance(run_state.get("graph_snapshot"), dict) else {}
    reply_state_keys = _resolve_reply_state_keys(graph_snapshot)
    values = _run_state_values(run_state)
    artifacts = run_state.get("artifacts") if isinstance(run_state.get("artifacts"), dict) else {}
    artifact_values = artifacts.get("state_values") if isinstance(artifacts.get("state_values"), dict) else {}
    output_previews = run_state.get("output_previews") if isinstance(run_state.get("output_previews"), list) else []
    artifact_previews = artifacts.get("output_previews") if isinstance(artifacts.get("output_previews"), list) else []
    candidates: list[Any] = [
        *(values.get(state_key) for state_key in reply_state_keys),
        *(artifact_values.get(state_key) for state_key in reply_state_keys),
        _resolve_output_preview_value(output_previews, reply_state_keys),
        _resolve_output_preview_value(artifact_previews, reply_state_keys),
        run_state.get("final_result"),
    ]
    for candidate in candidates:
        text = _stringify_reply_candidate(candidate)
        if text:
            return text
    return ""


def _resolve_reply_state_keys(graph_snapshot: dict[str, Any]) -> list[str]:
    state_schema = graph_snapshot.get("state_schema") if isinstance(graph_snapshot.get("state_schema"), dict) else {}
    keys = [state_key for state_key in BUDDY_REPLY_STATE_KEYS if state_key in state_schema or state_key == "public_response"]
    for state_key, definition in state_schema.items():
        if not isinstance(definition, dict):
            continue
        name = str(definition.get("name") or "").strip()
        if name in {"模型整理回复", "public_response"} and state_key not in keys:
            keys.append(state_key)
    return keys


def _run_state_values(run_state: dict[str, Any]) -> dict[str, Any]:
    snapshot = run_state.get("state_snapshot") if isinstance(run_state.get("state_snapshot"), dict) else {}
    values = snapshot.get("values")
    return values if isinstance(values, dict) else {}


def _resolve_output_preview_value(output_previews: list[Any], reply_state_keys: list[str]) -> Any:
    for preview in output_previews:
        if not isinstance(preview, dict):
            continue
        state_key = str(preview.get("state_key") or preview.get("stateKey") or "").strip()
        if state_key and state_key not in reply_state_keys:
            continue
        if "value" in preview:
            return preview.get("value")
        if "content" in preview:
            return preview.get("content")
        if "text" in preview:
            return preview.get("text")
    return None


def _stringify_reply_candidate(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False).strip()
    return str(value).strip()


def handle_inbound_event(
    event: MessagingInboundEvent,
    *,
    visible_message_callback: BuddyVisibleMessageCallback | None = None,
) -> dict[str, Any]:
    platform_session = resolve_buddy_session_for_event(event)
    session_id = platform_session["buddy_session_id"]
    command_name, _command_args = parse_slash_command(event.text)
    if command_name:
        command_result = handle_slash_command(event, platform_session)
        if command_result.handled:
            command_message = buddy_store.append_chat_message(
                session_id,
                {
                    "role": "assistant",
                    "content": command_result.reply_text,
                    "include_in_context": False,
                    "metadata": {
                        "source_kind": "message_platform_command",
                        "platform_id": event.platform_id,
                        "binding_id": event.binding_id,
                        "platform_session_id": platform_session["platform_session_id"],
                        "command": command_name,
                    },
                },
                changed_by="message_platform",
                change_reason="外部消息平台处理斜杠命令。",
            )
            return {
                "platform_session": platform_session,
                "command": command_name,
                "reply_text": command_result.reply_text,
                "command_message": command_message,
            }

    user_message = buddy_store.append_chat_message(
        session_id,
        {
            "role": "user",
            "content": event.text,
            "include_in_context": True,
            "metadata": _event_metadata(event, platform_session["platform_session_id"]),
        },
        changed_by="message_platform",
        change_reason="外部消息平台追加用户消息。",
    )
    run_result = run_buddy_graph_for_external_message(
        session_id=session_id,
        message_id=user_message["message_id"],
        text=event.text,
        buddy_model_ref=str(platform_session.get("buddy_model_ref") or ""),
        visible_message_callback=visible_message_callback,
    )
    assistant_content = str(run_result.get("visible_reply_text") or run_result.get("final_text") or "").strip()
    assistant_message = buddy_store.append_chat_message(
        session_id,
        {
            "role": "assistant",
            "content": assistant_content,
            "include_in_context": True,
            "run_id": run_result["run_id"],
            "metadata": {
                "source_kind": "message_platform_reply",
                "platform_id": event.platform_id,
                "binding_id": event.binding_id,
                "platform_session_id": platform_session["platform_session_id"],
            },
        },
        changed_by="message_platform",
        change_reason="外部消息平台追加 Buddy 回复。",
    )
    store.append_audit_event(
        binding_id=event.binding_id,
        platform_id=event.platform_id,
        platform_session_id=platform_session["platform_session_id"],
        event_type="buddy.run.completed",
        severity="info",
        message="Buddy run completed for external message.",
        payload={"run_id": run_result["run_id"], "assistant_message_id": assistant_message["message_id"]},
    )
    return {
        "platform_session": platform_session,
        "user_message": user_message,
        "assistant_message": assistant_message,
        **run_result,
    }
