from __future__ import annotations

from copy import deepcopy
import logging
from typing import Any
from uuid import uuid4

from app.buddy import store
from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload
from app.core.storage.run_store import load_run, save_run
from app.templates import get_template


logger = logging.getLogger(__name__)

GLOBAL_RUNTIME_MODEL_OPTION_VALUE = "__toograph_global_model__"
DEFAULT_TRIGGER_REASON = "visible_buddy_run_completed"
TERMINAL_REVIEW_STATUSES = {"completed", "failed", "cancelled", "skipped"}
WRITEBACK_CHANNELS = (
    ("memory", "applied_memory_commands", "skipped_memory_commands"),
    ("user_context", "applied_user_context_commands", "skipped_user_context_commands"),
    ("structured_memory", "applied_structured_memory_commands", "skipped_structured_memory_commands"),
    ("buddy_identity", "applied_buddy_identity_commands", "skipped_buddy_identity_commands"),
    ("capability_usage", "applied_capability_usage_commands", "skipped_capability_usage_commands"),
)
REVIEW_OUTPUT_DEFAULTS: dict[str, Any] = {
    "autonomous_review": {},
    "improvement_candidates": [],
    "memory_update_plan": {"has_updates": False, "commands": []},
    "user_context_update_plan": {"has_updates": False, "commands": []},
    "structured_memory_update_plan": {"has_updates": False, "commands": []},
    "memory_review_result": "",
    "user_context_review_result": "",
    "memory_write_success": False,
    "applied_memory_commands": [],
    "skipped_memory_commands": [],
    "memory_write_result": "",
    "user_context_write_success": False,
    "applied_user_context_commands": [],
    "skipped_user_context_commands": [],
    "user_context_write_result": "",
    "structured_memory_write_success": False,
    "applied_structured_memory_commands": [],
    "skipped_structured_memory_commands": [],
    "written_structured_memories": [],
    "structured_memory_write_result": "",
    "buddy_identity_update_plan": {"has_updates": False, "requires_confirmation": False, "commands": []},
    "buddy_identity_review_result": "",
    "buddy_identity_write_success": False,
    "applied_buddy_identity_commands": [],
    "skipped_buddy_identity_commands": [],
    "buddy_identity_write_result": "",
}


def list_background_review_runs(*, source_run_id: str | None = None) -> list[dict[str, Any]]:
    return [_with_review_summaries(record) for record in store.list_background_review_runs(source_run_id=source_run_id)]


def enqueue_background_review_run(
    *,
    source_run_id: str,
    buddy_model_ref: str = "",
    trigger_reason: str = DEFAULT_TRIGGER_REASON,
) -> dict[str, Any]:
    normalized_source_run_id = str(source_run_id or "").strip()
    if not normalized_source_run_id:
        raise ValueError("source_run_id is required.")
    source_run = load_run(normalized_source_run_id)
    source_status = str(source_run.get("status") or "").strip()
    if source_status != "completed":
        raise ValueError(f"Background review requires a completed source run; got '{source_status or 'unknown'}'.")

    binding = store.load_memory_review_template_binding()
    template_id = str(binding.get("template_id") or "").strip()
    template = get_template(template_id)
    graph_payload = build_background_review_graph_payload(
        template,
        source_run=source_run,
        binding=binding,
        buddy_model_ref=buddy_model_ref or _source_buddy_model_ref(source_run),
        trigger_reason=trigger_reason,
    )
    _validate_graph_payload(graph_payload)

    runtime_graph_id = f"runtime_graph_{uuid4().hex[:10]}"
    run_state = create_initial_run_state(
        graph_id=runtime_graph_id,
        graph_name=str(graph_payload.get("name") or template.get("default_graph_name") or "Buddy Background Review"),
        max_revision_round=int(_metadata(graph_payload).get("max_revision_round", 1)),
    )
    review_record = store.create_background_review_run(
        source_run_id=normalized_source_run_id,
        review_run_id=str(run_state["run_id"]),
        template_id=template_id,
        trigger_reason=str(trigger_reason or DEFAULT_TRIGGER_REASON),
        metadata={
            "buddy_model_ref": str(buddy_model_ref or _source_buddy_model_ref(source_run) or ""),
            "source_status": source_status,
        },
    )
    graph_payload.setdefault("metadata", {})
    graph_payload["metadata"]["buddy_background_review_id"] = review_record["review_id"]
    graph_payload["metadata"].setdefault("runtime_context", {})
    graph_payload["metadata"]["runtime_context"]["buddy_background_review_id"] = review_record["review_id"]
    executed_graph = _build_runtime_graph_document(graph_payload, runtime_graph_id=runtime_graph_id)
    unsupported_reasons = get_langgraph_runtime_unsupported_reasons(executed_graph)
    if unsupported_reasons:
        store.mark_background_review_run_finished(
            review_record["review_id"],
            status="failed",
            error="; ".join(unsupported_reasons),
        )
        raise ValueError("Background review graph is not supported by the LangGraph runtime.")

    run_state["runtime_backend"] = "langgraph"
    run_state["template_id"] = template_id
    run_state["metadata"] = dict(executed_graph.metadata)
    run_state["metadata"]["resolved_runtime_backend"] = "langgraph"
    run_state["graph_snapshot"] = executed_graph.model_dump(by_alias=True, mode="json")
    run_state["node_status_map"] = {node_name: "idle" for node_name in executed_graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)
    return review_record


def run_background_review_worker(graph: NodeSystemGraphDocument, run_state: dict[str, Any], review_id: str) -> None:
    try:
        review_record = store.mark_background_review_run_started(review_id, review_run_id=str(run_state.get("run_id") or ""))
        execute_node_system_graph_langgraph(graph, run_state, persist_progress=True)
        final_status = str(run_state.get("status") or "completed").strip() or "completed"
        review_status = _review_status_from_run_status(final_status)
        if review_status == "completed":
            _project_improvement_candidates(review_record, run_state)
        store.mark_background_review_run_finished(review_id, status=review_status)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Buddy background review run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        store.mark_background_review_run_finished(review_id, status="failed", error=str(exc))
        publish_run_event(
            str(run_state.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
        )


def load_background_review_runtime(review_id: str) -> tuple[NodeSystemGraphDocument, dict[str, Any]]:
    record = store.get_background_review_run(review_id)
    run_state = load_run(str(record["review_run_id"]))
    graph_snapshot = run_state.get("graph_snapshot")
    if not isinstance(graph_snapshot, dict):
        raise ValueError(f"Background review run '{record['review_run_id']}' has no graph snapshot.")
    return NodeSystemGraphDocument.model_validate(graph_snapshot), run_state


def _with_review_summaries(record: dict[str, Any]) -> dict[str, Any]:
    review_run_id = str(record.get("review_run_id") or "").strip()
    if not review_run_id:
        return {
            **record,
            "writeback_summary": _empty_writeback_summary(),
            "improvement_summary": _empty_improvement_summary(),
        }
    try:
        review_run = load_run(review_run_id)
    except FileNotFoundError:
        writeback_summary = _empty_writeback_summary()
        improvement_summary = _empty_improvement_summary()
        warning = f"Review run '{review_run_id}' was not found."
        writeback_summary["warnings"].append(warning)
        improvement_summary["warnings"].append(warning)
        return {**record, "writeback_summary": writeback_summary, "improvement_summary": improvement_summary}
    return {
        **record,
        "writeback_summary": build_writeback_summary_from_run(review_run),
        "improvement_summary": _with_persisted_improvement_candidate_state(
            _projected_improvement_summary(record, review_run),
            record,
        ),
    }


def build_writeback_summary_from_run(review_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(review_run)
    summary = _empty_writeback_summary()
    revision_ids: set[str] = set()
    memory_ids: set[str] = set()

    for channel, applied_state, skipped_state in WRITEBACK_CHANNELS:
        for item in _list_of_records(values.get(applied_state)):
            applied = _summarize_applied_command(item, channel=channel)
            summary["applied_commands"].append(applied)
            summary["applied_count"] += 1
            revision = _summarize_revision(item)
            revision_id = str(revision.get("revision_id") or "").strip()
            if revision_id and revision_id not in revision_ids:
                revision_ids.add(revision_id)
                summary["revision_ids"].append(revision_id)
                summary["revisions"].append(revision)
            memory_id = _memory_id_from_applied_command(item)
            if memory_id and memory_id not in memory_ids:
                memory_ids.add(memory_id)
                summary["memory_ids"].append(memory_id)
        for item in _list_of_records(values.get(skipped_state)):
            summary["skipped_commands"].append(_summarize_skipped_command(item, channel=channel))
            summary["skipped_count"] += 1

    evidence = _autonomous_review_evidence(values.get("autonomous_review"))
    if evidence:
        summary["evidence_items"].append({"source_state": "autonomous_review.evidence", "text": evidence})
    return summary


def _empty_writeback_summary() -> dict[str, Any]:
    return {
        "applied_count": 0,
        "skipped_count": 0,
        "revision_ids": [],
        "revisions": [],
        "memory_ids": [],
        "applied_commands": [],
        "skipped_commands": [],
        "evidence_items": [],
        "warnings": [],
    }


def build_improvement_summary_from_run(review_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(review_run)
    summary = _empty_improvement_summary()
    for index, item in enumerate(_list_of_records(values.get("improvement_candidates"))):
        candidate = _summarize_improvement_candidate(item, index=index, review_run=review_run)
        summary["candidates"].append(candidate)
        summary["candidate_count"] += 1
        risk_level = candidate["risk_level"]
        if risk_level:
            summary["risk_counts"][risk_level] = summary["risk_counts"].get(risk_level, 0) + 1
    return summary


def _projected_improvement_summary(record: dict[str, Any], review_run: dict[str, Any]) -> dict[str, Any]:
    if _is_completed_review_run(record, review_run):
        _project_improvement_candidates(record, review_run)
    return build_improvement_summary_from_run(review_run)


def _project_improvement_candidates(record: dict[str, Any], review_run: dict[str, Any]) -> list[dict[str, Any]]:
    values = _run_state_values(review_run)
    candidates = _list_of_records(values.get("improvement_candidates"))
    return store.upsert_improvement_candidates_for_review(record, candidates)


def _is_completed_review_run(record: dict[str, Any], review_run: dict[str, Any]) -> bool:
    return (
        str(record.get("status") or "").strip() == "completed"
        or str(review_run.get("status") or "").strip() == "completed"
    )


def _with_persisted_improvement_candidate_state(
    summary: dict[str, Any],
    record: dict[str, Any],
) -> dict[str, Any]:
    review_id = str(record.get("review_id") or "").strip()
    if not review_id:
        return summary
    persisted = {
        str(candidate.get("candidate_id") or ""): candidate
        for candidate in store.list_improvement_candidates(review_id=review_id)
    }
    if not persisted:
        return summary
    for candidate in summary.get("candidates", []):
        if not isinstance(candidate, dict):
            continue
        persisted_candidate = persisted.get(str(candidate.get("candidate_id") or ""))
        if not persisted_candidate:
            continue
        candidate["status"] = str(persisted_candidate.get("status") or "proposed")
        candidate["validation_run_id"] = str(persisted_candidate.get("validation_run_id") or "")
        candidate["applied_revision_id"] = str(persisted_candidate.get("applied_revision_id") or "")
        candidate["has_apply_command"] = _has_candidate_apply_command(persisted_candidate)
    return summary


def _has_candidate_apply_command(candidate: dict[str, Any]) -> bool:
    validation_result = candidate.get("validation_result") if isinstance(candidate.get("validation_result"), dict) else {}
    approval_request = validation_result.get("approval_request") if isinstance(validation_result.get("approval_request"), dict) else {}
    apply_command = approval_request.get("apply_command") if isinstance(approval_request.get("apply_command"), dict) else {}
    if str(apply_command.get("action") or "").strip():
        return True
    payload = candidate.get("payload") if isinstance(candidate.get("payload"), dict) else {}
    payload_apply_command = payload.get("apply_command") if isinstance(payload.get("apply_command"), dict) else {}
    return bool(str(payload_apply_command.get("action") or "").strip())


def _empty_improvement_summary() -> dict[str, Any]:
    return {
        "candidate_count": 0,
        "risk_counts": {},
        "candidates": [],
        "warnings": [],
    }


def _summarize_improvement_candidate(item: dict[str, Any], *, index: int, review_run: dict[str, Any]) -> dict[str, Any]:
    candidate_id = _text(item.get("candidate_id")) or f"candidate_{index + 1}"
    source_run_id = _text(item.get("source_run_id")) or _text((review_run.get("metadata") or {}).get("buddy_parent_run_id"))
    target_ref = item.get("target_ref") if isinstance(item.get("target_ref"), dict) else {}
    return {
        "candidate_id": candidate_id,
        "kind": _text(item.get("kind")),
        "status": _text(item.get("status")).lower() or "proposed",
        "source_run_id": source_run_id,
        "target_ref": deepcopy(target_ref),
        "risk_level": _text(item.get("risk_level")),
        "expected_benefit": _text(item.get("expected_benefit")),
        "proposed_change_summary": _text(item.get("proposed_change_summary") or item.get("summary") or item.get("title")),
        "approval_required": bool(item.get("approval_required")),
        "evidence_refs": _evidence_refs(item.get("evidence_refs")),
    }


def _evidence_refs(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [deepcopy(item) for item in value if isinstance(item, dict)]


def _run_state_values(review_run: dict[str, Any]) -> dict[str, Any]:
    values = review_run.get("state_values")
    if isinstance(values, dict):
        return values
    snapshot = review_run.get("state_snapshot")
    if isinstance(snapshot, dict) and isinstance(snapshot.get("values"), dict):
        return snapshot["values"]
    return {}


def _list_of_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _summarize_applied_command(item: dict[str, Any], *, channel: str) -> dict[str, Any]:
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    revision = item.get("revision") if isinstance(item.get("revision"), dict) else {}
    return {
        "channel": channel,
        "command_id": _text(command.get("command_id")),
        "action": _text(command.get("action")),
        "status": _text(command.get("status")),
        "target_type": _text(command.get("target_type")),
        "target_id": _text(command.get("target_id")),
        "revision_id": _text(command.get("revision_id") or revision.get("revision_id")),
        "run_id": _text(command.get("run_id")),
        "change_reason": _text(command.get("change_reason")),
    }


def _summarize_skipped_command(item: dict[str, Any], *, channel: str) -> dict[str, Any]:
    return {
        "channel": channel,
        "index": item.get("index"),
        "action": _text(item.get("action")),
        "error_type": _text(item.get("error_type")),
        "error": _text(item.get("error")),
    }


def _summarize_revision(item: dict[str, Any]) -> dict[str, Any]:
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    revision = item.get("revision") if isinstance(item.get("revision"), dict) else {}
    revision_id = _text(revision.get("revision_id") or command.get("revision_id"))
    if not revision_id:
        return {}
    return {
        "revision_id": revision_id,
        "target_type": _text(revision.get("target_type") or command.get("target_type")),
        "target_id": _text(revision.get("target_id") or command.get("target_id")),
        "operation": _text(revision.get("operation")),
    }


def _memory_id_from_applied_command(item: dict[str, Any]) -> str:
    result = item.get("result") if isinstance(item.get("result"), dict) else {}
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    memory_id = _text(result.get("memory_id"))
    if memory_id:
        return memory_id
    if _text(command.get("target_type")) == "memory_entry":
        return _text(command.get("target_id"))
    return ""


def _autonomous_review_evidence(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    return _text(value.get("evidence"))


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def build_background_review_graph_payload(
    template: dict[str, Any],
    *,
    source_run: dict[str, Any],
    binding: dict[str, Any],
    buddy_model_ref: str = "",
    trigger_reason: str = DEFAULT_TRIGGER_REASON,
) -> dict[str, Any]:
    template_id = str(template.get("template_id") or binding.get("template_id") or "").strip()
    graph = {
        "graph_id": None,
        "name": str(template.get("default_graph_name") or template.get("label") or "Buddy Background Review"),
        "state_schema": deepcopy(template.get("state_schema") or {}),
        "nodes": deepcopy(template.get("nodes") or {}),
        "edges": deepcopy(template.get("edges") or []),
        "conditional_edges": deepcopy(template.get("conditional_edges") or []),
        "metadata": {
            **deepcopy(template.get("metadata") if isinstance(template.get("metadata"), dict) else {}),
            "buddy_template_id": template_id,
            "buddy_review_run": True,
            "buddy_parent_run_id": str(source_run.get("run_id") or ""),
            "buddy_review_trigger_reason": str(trigger_reason or DEFAULT_TRIGGER_REASON),
            "internal": True,
        },
    }
    _apply_buddy_model_override(graph, buddy_model_ref)
    _apply_review_template_binding(graph, binding, _build_review_runtime_source_values(source_run))
    _apply_background_review_source_selector(graph, str(source_run.get("run_id") or ""))
    for state_name, value in REVIEW_OUTPUT_DEFAULTS.items():
        _set_state_value_by_name(graph, state_name, value)
    return graph


def _validate_graph_payload(graph_payload: dict[str, Any]) -> None:
    payload = NodeSystemGraphPayload.model_validate(graph_payload)
    validation = validate_graph(payload)
    if not validation.valid:
        issue_text = "; ".join(issue.message for issue in validation.issues)
        raise ValueError(f"Background review graph is invalid: {issue_text}")


def _build_runtime_graph_document(graph_payload: dict[str, Any], *, runtime_graph_id: str) -> NodeSystemGraphDocument:
    payload = NodeSystemGraphPayload.model_validate(graph_payload)
    return NodeSystemGraphDocument.model_validate(
        {
            **payload.model_dump(exclude={"graph_id"}, by_alias=True, mode="json"),
            "graph_id": runtime_graph_id,
        }
    )


def _apply_review_template_binding(graph: dict[str, Any], binding: dict[str, Any], source_values: dict[str, Any]) -> None:
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), dict) else {}
    state_schema = graph.get("state_schema") if isinstance(graph.get("state_schema"), dict) else {}
    input_bindings = binding.get("input_bindings") if isinstance(binding.get("input_bindings"), dict) else {}
    for node_id, source in input_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        node = nodes.get(normalized_node_id)
        if not isinstance(node, dict) or node.get("kind") != "input":
            raise ValueError(f"Buddy memory review binding references a missing input node: {normalized_node_id}")
        writes = node.get("writes")
        if not isinstance(writes, list) or len(writes) != 1 or not isinstance(writes[0], dict):
            raise ValueError(f"Buddy memory review input node must write exactly one state: {normalized_node_id}")
        state_key = str(writes[0].get("state") or "").strip()
        if not state_key or state_key not in state_schema:
            raise ValueError(f"Buddy memory review input node writes a missing state: {normalized_node_id}")
        value = deepcopy(source_values.get(str(source or "").strip(), ""))
        node["config"] = {
            **(node.get("config") if isinstance(node.get("config"), dict) else {}),
            "value": value,
        }
        state_schema[state_key] = {
            **state_schema[state_key],
            "value": deepcopy(value),
        }


def _apply_background_review_source_selector(graph: dict[str, Any], source_run_id: str) -> None:
    normalized_source_run_id = str(source_run_id or "").strip()
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), dict) else {}
    selector_node = nodes.get("select_review_source")
    if isinstance(selector_node, dict):
        config = selector_node.get("config") if isinstance(selector_node.get("config"), dict) else {}
        static_inputs = config.get("staticInputs") if isinstance(config.get("staticInputs"), dict) else {}
        selector_node["config"] = {
            **config,
            "staticInputs": {
                **static_inputs,
                "source_run_id": normalized_source_run_id,
            },
        }
    mode_input_node = nodes.get("input_review_source_selection_mode")
    if isinstance(mode_input_node, dict):
        config = mode_input_node.get("config") if isinstance(mode_input_node.get("config"), dict) else {}
        mode_input_node["config"] = {
            **config,
            "value": "explicit",
        }
    _set_state_value_by_name(graph, "review_source_selection_mode", "explicit")
    _set_state_value_by_name(graph, "source_run_id", normalized_source_run_id)


def _build_review_runtime_source_values(source_run: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_run_id": str(source_run.get("run_id") or ""),
        "current_session_id": _source_runtime_context_value(source_run, "buddy_session_id"),
        "user_message": _source_state_value_by_name(source_run, "user_message"),
        "conversation_history": _source_state_value_by_name(source_run, "conversation_history"),
        "buddy_home_context": {
            "kind": "local_folder",
            "root": "buddy_home",
            "selected": ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
        },
        "request_understanding": _source_state_value_by_name(source_run, "request_understanding"),
        "capability_result": _source_state_value_by_name(source_run, "capability_result"),
        "capability_review": _source_state_value_by_name(source_run, "capability_review"),
        "public_response": _source_state_value_by_name(source_run, "public_response"),
    }


def _source_state_value_by_name(source_run: dict[str, Any], state_name: str) -> Any:
    state_key = _source_state_key_by_name(source_run, state_name)
    state_values = _state_values(source_run)
    if state_key and state_key in state_values:
        return deepcopy(state_values[state_key])
    artifact_state_values = _artifact_state_values(source_run)
    if state_key and state_key in artifact_state_values:
        return deepcopy(artifact_state_values[state_key])
    if state_name in state_values:
        return deepcopy(state_values[state_name])
    if state_name in artifact_state_values:
        return deepcopy(artifact_state_values[state_name])
    return ""


def _source_state_key_by_name(source_run: dict[str, Any], state_name: str) -> str:
    graph_snapshot = source_run.get("graph_snapshot") if isinstance(source_run.get("graph_snapshot"), dict) else {}
    state_schema = graph_snapshot.get("state_schema") if isinstance(graph_snapshot.get("state_schema"), dict) else {}
    for state_key, state in state_schema.items():
        if isinstance(state, dict) and str(state.get("name") or "").strip() == state_name:
            return str(state_key)
    return state_name if state_name in state_schema else ""


def _state_values(source_run: dict[str, Any]) -> dict[str, Any]:
    snapshot = source_run.get("state_snapshot") if isinstance(source_run.get("state_snapshot"), dict) else {}
    values = snapshot.get("values") if isinstance(snapshot.get("values"), dict) else {}
    return values


def _artifact_state_values(source_run: dict[str, Any]) -> dict[str, Any]:
    artifacts = source_run.get("artifacts") if isinstance(source_run.get("artifacts"), dict) else {}
    values = artifacts.get("state_values") if isinstance(artifacts.get("state_values"), dict) else {}
    return values


def _source_runtime_context_value(source_run: dict[str, Any], key: str) -> str:
    metadata = source_run.get("metadata") if isinstance(source_run.get("metadata"), dict) else {}
    runtime_context = metadata.get("runtime_context") if isinstance(metadata.get("runtime_context"), dict) else {}
    return str(runtime_context.get(key) or "").strip()


def _source_buddy_model_ref(source_run: dict[str, Any]) -> str:
    metadata = source_run.get("metadata") if isinstance(source_run.get("metadata"), dict) else {}
    return str(metadata.get("buddy_model_ref") or "").strip()


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
            config = node.get("config") if isinstance(node.get("config"), dict) else {}
            node["config"] = {**config, **patch}
            continue
        if node.get("kind") == "subgraph":
            config = node.get("config") if isinstance(node.get("config"), dict) else {}
            embedded_graph = config.get("graph") if isinstance(config.get("graph"), dict) else {}
            _apply_buddy_model_override_to_nodes(embedded_graph.get("nodes"), patch)


def _set_state_value_by_name(graph: dict[str, Any], state_name: str, value: Any) -> None:
    state_key = _find_state_key_by_name(graph, state_name)
    if not state_key:
        return
    state_schema = graph.get("state_schema") if isinstance(graph.get("state_schema"), dict) else {}
    state_schema[state_key] = {
        **state_schema[state_key],
        "value": deepcopy(value),
    }


def _find_state_key_by_name(graph: dict[str, Any], state_name: str) -> str:
    state_schema = graph.get("state_schema") if isinstance(graph.get("state_schema"), dict) else {}
    for state_key, state in state_schema.items():
        if isinstance(state, dict) and str(state.get("name") or "").strip() == state_name:
            return str(state_key)
    return state_name if state_name in state_schema else ""


def _metadata(graph_payload: dict[str, Any]) -> dict[str, Any]:
    metadata = graph_payload.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _review_status_from_run_status(status: str) -> str:
    normalized = str(status or "").strip().lower()
    if normalized in store.BACKGROUND_REVIEW_STATUSES:
        return normalized
    if normalized in TERMINAL_REVIEW_STATUSES:
        return normalized
    return "running"
