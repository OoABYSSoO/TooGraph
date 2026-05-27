from __future__ import annotations

import copy
import logging
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, HTTPException

from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.runtime.state_io import input_state_keys
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.graph_store import load_graph
from app.core.storage.json_file_utils import utc_now_iso
from app.core.storage.run_store import save_run
from app.templates.loader import load_template_record


logger = logging.getLogger(__name__)

TEMPLATE_METADATA_KEYS = {
    "template_id",
    "label",
    "description",
    "default_graph_name",
    "source",
    "status",
    "capabilityDiscoverable",
    "hasBreakpointMetadata",
    "capabilityDiscoverableBlockedReason",
}


def start_eval_case_graph_run(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
    *,
    background_tasks: BackgroundTasks,
    requested_by: str = "",
) -> dict[str, Any]:
    _install_case_fixtures(eval_run, case_result, case)
    graph = build_eval_case_graph_document(eval_run, case_result, case, requested_by=requested_by)
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())
    unsupported_reasons = get_langgraph_runtime_unsupported_reasons(graph)
    if unsupported_reasons:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Eval case graph '{graph.graph_id}' is not supported by the LangGraph runtime.",
                "reasons": unsupported_reasons,
            },
        )

    run_state = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    run_state["runtime_backend"] = "langgraph"
    run_state["metadata"] = {
        **dict(graph.metadata),
        "resolved_runtime_backend": "langgraph",
    }
    run_state["graph_snapshot"] = graph.model_dump(by_alias=True, mode="json")
    run_state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)

    background_tasks.add_task(_run_eval_case_graph_worker, graph, run_state)
    return run_state


def build_eval_case_graph_document(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
    *,
    requested_by: str = "",
) -> NodeSystemGraphDocument:
    suite_id = str(case_result.get("suite_id") or eval_run.get("suite_id") or "")
    target_template_id = str(eval_run.get("target_template_id") or case_result.get("target_template_id") or "")
    target_graph_id = str(eval_run.get("target_graph_id") or case_result.get("target_graph_id") or "")
    if not target_template_id and not target_graph_id:
        suite = case_result.get("suite") if isinstance(case_result.get("suite"), dict) else {}
        target_template_id = str(suite.get("target_template_id") or "")
        target_graph_id = str(suite.get("target_graph_id") or "")

    source = "template" if target_template_id else "graph"
    source_id = target_template_id or target_graph_id
    if not source_id:
        raise HTTPException(status_code=422, detail="Eval suite must define target_template_id or target_graph_id.")

    graph = _load_target_graph(source=source, source_id=source_id)
    input_values = case.get("input_values") if isinstance(case.get("input_values"), dict) else {}
    graph_data = graph.model_dump(by_alias=True, mode="json")
    input_keys = input_state_keys(graph)
    state_schema = dict(graph_data.get("state_schema") or {})
    applied_input_keys: list[str] = []
    for state_key, value in input_values.items():
        if state_key not in input_keys or state_key not in state_schema:
            continue
        state_schema[state_key] = {
            **dict(state_schema[state_key]),
            "value": copy.deepcopy(value),
        }
        applied_input_keys.append(state_key)

    graph_data["state_schema"] = state_schema
    case_id = str(case.get("case_id") or case_result.get("case_id") or "")
    graph_data["graph_id"] = _eval_runtime_graph_id(source_id, case_id)
    graph_data["name"] = f"{graph.name} / Eval {case_id or 'case'}"
    graph_data["metadata"] = {
        **dict(graph.metadata),
        "eval": {
            "eval_run_id": str(eval_run.get("eval_run_id") or ""),
            "result_id": str(case_result.get("result_id") or ""),
            "suite_id": suite_id,
            "case_id": case_id,
            "target_template_id": target_template_id,
            "target_graph_id": target_graph_id,
            "target_kind": source,
            "target_id": source_id,
            "requested_by": str(requested_by or ""),
            "applied_input_keys": applied_input_keys,
        },
    }
    return NodeSystemGraphDocument.model_validate(graph_data)


def _load_target_graph(*, source: str, source_id: str) -> NodeSystemGraphDocument:
    if source == "graph":
        return load_graph(source_id)
    template = load_template_record(source_id)
    payload = {
        key: copy.deepcopy(value)
        for key, value in template.items()
        if key not in TEMPLATE_METADATA_KEYS
    }
    return NodeSystemGraphDocument.model_validate(
        {
            **payload,
            "graph_id": f"template_{source_id}",
            "name": str(template.get("default_graph_name") or template.get("label") or source_id),
        }
    )


def _run_eval_case_graph_worker(graph: NodeSystemGraphDocument, run_state: dict[str, Any]) -> None:
    try:
        execute_node_system_graph_langgraph(graph, run_state, persist_progress=True)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Eval graph run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        publish_run_event(
            str(run_state.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
        )


def _install_case_fixtures(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    _install_case_fixture_runs(eval_run, case_result, case)
    _install_case_fixture_buddy_sessions(eval_run, case_result, case)
    _install_case_fixture_memories(eval_run, case_result, case)
    _install_case_fixture_capability_usage(eval_run, case_result, case)
    _install_case_fixture_scheduler_records(case)


def _install_case_fixture_runs(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    fixtures = _case_fixture_runs(case)
    if not fixtures:
        return
    now = utc_now_iso()
    for fixture in fixtures:
        save_run(_normalize_fixture_run(fixture, eval_run, case_result, case, now=now))


def _case_fixture_runs(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    fixtures: list[dict[str, Any]] = []
    single_fixture = metadata.get("fixture_run")
    if isinstance(single_fixture, dict):
        fixtures.append(single_fixture)
    for fixture in metadata.get("fixture_runs") or []:
        if isinstance(fixture, dict):
            fixtures.append(fixture)
    return fixtures


def _install_case_fixture_buddy_sessions(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    fixtures = _case_fixture_buddy_sessions(case)
    if not fixtures:
        return
    from app.buddy import store as buddy_store

    for fixture in fixtures:
        session_id = str(fixture.get("session_id") or "").strip()
        session_payload = {
            key: value
            for key, value in {
                "session_id": session_id,
                "title": fixture.get("title"),
                "parent_session_id": fixture.get("parent_session_id"),
                "source": fixture.get("source"),
                "ended_at": fixture.get("ended_at"),
                "end_reason": fixture.get("end_reason"),
            }.items()
            if value not in (None, "")
        }
        if session_id:
            try:
                buddy_store.update_chat_session(
                    session_id,
                    {key: value for key, value in session_payload.items() if key != "session_id"},
                    changed_by="eval_fixture",
                    change_reason="Install eval buddy session fixture.",
                )
                session = buddy_store.get_chat_session(session_id)
            except KeyError:
                session = buddy_store.create_chat_session(
                    session_payload,
                    changed_by="eval_fixture",
                    change_reason="Install eval buddy session fixture.",
                )
        else:
            session = buddy_store.create_chat_session(
                session_payload,
                changed_by="eval_fixture",
                change_reason="Install eval buddy session fixture.",
            )
        existing_message_ids = {
            str(message.get("message_id") or "")
            for message in buddy_store.list_chat_messages(str(session["session_id"]))
        }
        for message in _fixture_buddy_session_messages(fixture):
            message_payload = {
                **message,
                "metadata": {
                    **dict(message.get("metadata") if isinstance(message.get("metadata"), dict) else {}),
                    "eval_fixture": {
                        "eval_run_id": str(eval_run.get("eval_run_id") or ""),
                        "result_id": str(case_result.get("result_id") or ""),
                        "case_id": str(case.get("case_id") or case_result.get("case_id") or ""),
                    },
                },
            }
            message_id = str(message_payload.get("message_id") or "").strip()
            if message_id and message_id in existing_message_ids:
                continue
            saved = buddy_store.append_chat_message(
                str(session["session_id"]),
                message_payload,
                changed_by="eval_fixture",
                change_reason="Install eval buddy message fixture.",
            )
            existing_message_ids.add(str(saved.get("message_id") or ""))


def _case_fixture_buddy_sessions(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    fixtures: list[dict[str, Any]] = []
    single_fixture = metadata.get("fixture_buddy_session")
    if isinstance(single_fixture, dict):
        fixtures.append(single_fixture)
    for fixture in metadata.get("fixture_buddy_sessions") or []:
        if isinstance(fixture, dict):
            fixtures.append(fixture)
    return fixtures


def _fixture_buddy_session_messages(fixture: dict[str, Any]) -> list[dict[str, Any]]:
    return [message for message in fixture.get("messages") or [] if isinstance(message, dict)]


def _install_case_fixture_memories(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    fixtures = _case_fixture_memory_entries(case)
    if not fixtures:
        return
    for fixture in fixtures:
        _upsert_fixture_memory(fixture, eval_run, case_result, case)


def _case_fixture_memory_entries(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    return [fixture for fixture in metadata.get("fixture_memory_entries") or [] if isinstance(fixture, dict)]


def _install_case_fixture_capability_usage(
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    entries = _case_fixture_capability_usage_entries(case)
    if not entries:
        return
    case_id = str(case.get("case_id") or case_result.get("case_id") or "")
    suite_id = str(eval_run.get("suite_id") or case_result.get("suite_id") or "")
    result_id = str(case_result.get("result_id") or "")
    normalized_entries: list[dict[str, Any]] = []
    from app.buddy.store import load_capability_usage_stats, update_capability_usage_stats

    installed_event_ids = _installed_capability_usage_event_ids(load_capability_usage_stats())
    for index, entry in enumerate(entries):
        normalized = copy.deepcopy(entry)
        normalized.setdefault("summary", f"Eval fixture capability usage for {case_id}.")
        normalized.setdefault("event_id", f"eval_fixture:{suite_id}:{case_id}:{result_id}:{index}")
        if str(normalized.get("event_id") or "") in installed_event_ids:
            continue
        normalized_entries.append(normalized)

    if not normalized_entries:
        return
    update_capability_usage_stats(
        {"entries": normalized_entries},
        changed_by="eval_fixture",
        change_reason=f"Install eval capability usage fixture for {case_id}.",
    )


def _case_fixture_capability_usage_entries(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    fixtures: list[dict[str, Any]] = []
    single_fixture = metadata.get("fixture_capability_usage_entry")
    if isinstance(single_fixture, dict):
        fixtures.append(single_fixture)
    for fixture in metadata.get("fixture_capability_usage_entries") or []:
        if isinstance(fixture, dict):
            fixtures.append(fixture)
    return fixtures


def _install_case_fixture_scheduler_records(case: dict[str, Any]) -> None:
    jobs = _case_fixture_scheduled_graph_jobs(case)
    runs = _case_fixture_scheduled_graph_job_runs(case)
    if not jobs and not runs:
        return

    from app.scheduler import store as scheduler_store

    for job in jobs:
        job_id = str(job.get("job_id") or "").strip()
        if not job_id:
            raise HTTPException(status_code=422, detail="Eval fixture scheduled graph job is missing job_id.")
        try:
            scheduler_store.load_scheduled_graph_job(job_id)
        except KeyError:
            scheduler_store.create_scheduled_graph_job(copy.deepcopy(job), now=str(job.get("now") or ""))

    for run in runs:
        job_id = str(run.get("job_id") or "").strip()
        if not job_id:
            raise HTTPException(status_code=422, detail="Eval fixture scheduled graph job run is missing job_id.")
        scheduler_store.record_scheduled_graph_job_run(
            job_id,
            job_run_id=str(run.get("job_run_id") or "") or None,
            run_id=str(run.get("run_id") or ""),
            trigger_reason=str(run.get("trigger_reason") or "manual"),
            status=str(run.get("status") or "completed"),
            error=str(run.get("error") or ""),
            started_at=str(run.get("started_at") or ""),
            completed_at=str(run.get("completed_at") or ""),
            metadata=copy.deepcopy(run.get("metadata") if isinstance(run.get("metadata"), dict) else {}),
            now=str(run.get("now") or ""),
        )


def _case_fixture_scheduled_graph_jobs(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    fixtures: list[dict[str, Any]] = []
    single_fixture = metadata.get("fixture_scheduled_graph_job")
    if isinstance(single_fixture, dict):
        fixtures.append(single_fixture)
    for fixture in metadata.get("fixture_scheduled_graph_jobs") or []:
        if isinstance(fixture, dict):
            fixtures.append(fixture)
    return fixtures


def _case_fixture_scheduled_graph_job_runs(case: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = case.get("metadata") if isinstance(case.get("metadata"), dict) else {}
    fixtures: list[dict[str, Any]] = []
    single_fixture = metadata.get("fixture_scheduled_graph_job_run")
    if isinstance(single_fixture, dict):
        fixtures.append(single_fixture)
    for fixture in metadata.get("fixture_scheduled_graph_job_runs") or []:
        if isinstance(fixture, dict):
            fixtures.append(fixture)
    return fixtures


def _installed_capability_usage_event_ids(stats: dict[str, Any]) -> set[str]:
    capabilities = stats.get("capabilities") if isinstance(stats.get("capabilities"), dict) else {}
    event_ids: set[str] = set()
    for record in capabilities.values():
        if not isinstance(record, dict):
            continue
        for recent_run in record.get("recent_runs") or []:
            if not isinstance(recent_run, dict):
                continue
            event_id = str(recent_run.get("event_id") or "").strip()
            if event_id:
                event_ids.add(event_id)
    return event_ids


def _upsert_fixture_memory(
    fixture: dict[str, Any],
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
) -> None:
    memory_id = str(fixture.get("memory_id") or "").strip()
    if not memory_id:
        raise HTTPException(status_code=422, detail="Eval fixture memory entry is missing memory_id.")
    metadata = copy.deepcopy(fixture.get("metadata")) if isinstance(fixture.get("metadata"), dict) else {}
    metadata["eval_fixture"] = {
        "eval_run_id": str(eval_run.get("eval_run_id") or ""),
        "suite_id": str(eval_run.get("suite_id") or case_result.get("suite_id") or ""),
        "case_id": str(case.get("case_id") or case_result.get("case_id") or ""),
        "result_id": str(case_result.get("result_id") or ""),
    }
    payload = {
        "scope_kind": str(fixture.get("scope_kind") or "buddy"),
        "scope_id": str(fixture.get("scope_id") or "default"),
        "layer": str(fixture.get("layer") or "long_term"),
        "memory_type": str(fixture.get("memory_type") or "fact"),
        "status": str(fixture.get("status") or "active"),
        "title": str(fixture.get("title") or memory_id),
        "content": str(fixture.get("content") or ""),
        "confidence": _float(fixture.get("confidence"), default=0.8),
        "salience": _float(fixture.get("salience"), default=0.5),
        "sources": copy.deepcopy(fixture.get("sources") or []),
        "metadata": metadata,
    }
    from app.core.storage.memory_store import create_memory_entry, load_memory_entry, update_memory_entry

    try:
        load_memory_entry(memory_id)
    except FileNotFoundError:
        create_memory_entry(
            memory_id=memory_id,
            changed_by="eval_fixture",
            change_reason="Install eval memory fixture.",
            **payload,
        )
        return
    update_memory_entry(
        memory_id,
        payload,
        changed_by="eval_fixture",
        change_reason="Refresh eval memory fixture.",
    )


def _normalize_fixture_run(
    fixture: dict[str, Any],
    eval_run: dict[str, Any],
    case_result: dict[str, Any],
    case: dict[str, Any],
    *,
    now: str,
) -> dict[str, Any]:
    run_id = str(fixture.get("run_id") or "").strip()
    if not run_id:
        raise HTTPException(status_code=422, detail="Eval fixture run is missing run_id.")

    status = str(fixture.get("status") or "completed").strip() or "completed"
    metadata = copy.deepcopy(fixture.get("metadata")) if isinstance(fixture.get("metadata"), dict) else {}
    metadata["eval_fixture"] = {
        "eval_run_id": str(eval_run.get("eval_run_id") or ""),
        "suite_id": str(eval_run.get("suite_id") or case_result.get("suite_id") or ""),
        "case_id": str(case.get("case_id") or case_result.get("case_id") or ""),
        "result_id": str(case_result.get("result_id") or ""),
    }

    state_snapshot = copy.deepcopy(fixture.get("state_snapshot")) if isinstance(fixture.get("state_snapshot"), dict) else {}
    snapshot_values = state_snapshot.get("values") if isinstance(state_snapshot.get("values"), dict) else {}
    fixture_state_values = fixture.get("state_values") if isinstance(fixture.get("state_values"), dict) else {}
    state_values = {**copy.deepcopy(fixture_state_values), **copy.deepcopy(snapshot_values)}
    state_snapshot["values"] = copy.deepcopy(state_values)

    artifacts = copy.deepcopy(fixture.get("artifacts")) if isinstance(fixture.get("artifacts"), dict) else {}
    artifacts.setdefault("state_values", copy.deepcopy(state_values))

    graph_snapshot = copy.deepcopy(fixture.get("graph_snapshot")) if isinstance(fixture.get("graph_snapshot"), dict) else {}
    graph_snapshot.setdefault("state_schema", _fixture_state_schema(state_values))

    started_at = str(fixture.get("started_at") or now)
    completed_at = fixture.get("completed_at")
    if completed_at is None and status in {"completed", "failed", "cancelled", "error"}:
        completed_at = now

    return {
        "run_id": run_id,
        "root_run_id": str(fixture.get("root_run_id") or run_id),
        "parent_run_id": str(fixture.get("parent_run_id") or ""),
        "parent_node_id": str(fixture.get("parent_node_id") or ""),
        "invocation_kind": str(fixture.get("invocation_kind") or "eval_fixture"),
        "invocation_key": str(fixture.get("invocation_key") or ""),
        "run_depth": int(fixture.get("run_depth") or 0),
        "run_path": copy.deepcopy(fixture.get("run_path") or [run_id]),
        "graph_id": str(fixture.get("graph_id") or "eval_fixture_graph"),
        "graph_name": str(fixture.get("graph_name") or "Eval fixture run"),
        "template_id": str(fixture.get("template_id") or ""),
        "template_version": str(fixture.get("template_version") or ""),
        "status": status,
        "runtime_backend": str(fixture.get("runtime_backend") or "eval_fixture"),
        "current_node_id": fixture.get("current_node_id"),
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_ms": fixture.get("duration_ms") if isinstance(fixture.get("duration_ms"), int) else 0,
        "final_result": str(fixture.get("final_result") or ""),
        "metadata": metadata,
        "lifecycle": {
            **(copy.deepcopy(fixture.get("lifecycle")) if isinstance(fixture.get("lifecycle"), dict) else {}),
            "started_at": started_at,
            "completed_at": completed_at or "",
            "updated_at": now,
        },
        "checkpoint_metadata": copy.deepcopy(fixture.get("checkpoint_metadata") or {}),
        "graph_snapshot": graph_snapshot,
        "state_snapshot": state_snapshot,
        "node_status_map": copy.deepcopy(fixture.get("node_status_map") or {}),
        "subgraph_status_map": copy.deepcopy(fixture.get("subgraph_status_map") or {}),
        "output_previews": copy.deepcopy(fixture.get("output_previews") or []),
        "artifacts": artifacts,
        "state_values": copy.deepcopy(state_values),
        "warnings": copy.deepcopy(fixture.get("warnings") or []),
        "errors": copy.deepcopy(fixture.get("errors") or []),
        "node_executions": copy.deepcopy(fixture.get("node_executions") or []),
        "activity_events": copy.deepcopy(fixture.get("activity_events") or []),
    }


def _fixture_state_schema(state_values: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(key): {
            "name": str(key),
            "description": "Eval fixture state.",
            "type": _fixture_state_type(value),
            "value": copy.deepcopy(value),
        }
        for key, value in state_values.items()
    }


def _fixture_state_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, dict | list):
        return "json"
    return "text"


def _float(value: Any, *, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _eval_runtime_graph_id(source_id: str, case_id: str) -> str:
    return f"eval_{_safe_identifier(source_id)}_{_safe_identifier(case_id)}_{uuid4().hex[:8]}"


def _safe_identifier(value: str) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    normalized = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)
    return normalized[:48] or "target"
