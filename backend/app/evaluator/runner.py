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


def _eval_runtime_graph_id(source_id: str, case_id: str) -> str:
    return f"eval_{_safe_identifier(source_id)}_{_safe_identifier(case_id)}_{uuid4().hex[:8]}"


def _safe_identifier(value: str) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    normalized = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)
    return normalized[:48] or "target"
