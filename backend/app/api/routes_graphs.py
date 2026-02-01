from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, resolve_graph_runtime_backend
from app.core.runtime.node_system_executor import execute_node_system_graph
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.schemas.node_system import (
    GraphSaveResponse,
    GraphValidationResponse,
    NodeSystemGraphDocument,
    NodeSystemGraphPayload,
)
from app.core.storage.graph_store import list_graphs, load_graph, save_graph
from app.core.storage.run_store import save_run

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graphs", tags=["graphs"])


def _schema_errors_to_paths(exc: ValidationError) -> list[dict[str, str]]:
    return [
        {
            "code": "schema_validation_error",
            "message": error["msg"],
            "path": ".".join(str(item) for item in error["loc"]),
        }
        for error in exc.errors()
    ]

def _parse_graph_request(payload: dict[str, Any]) -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(payload)


@router.get("")
def list_graphs_endpoint() -> list[NodeSystemGraphDocument]:
    return list_graphs()


@router.post("/save", response_model=GraphSaveResponse)
def save_graph_endpoint(payload: dict[str, Any]) -> GraphSaveResponse:
    try:
        graph_payload = _parse_graph_request(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=GraphValidationResponse(valid=False, issues=_schema_errors_to_paths(exc)).model_dump(),
        ) from exc

    validation = validate_graph(graph_payload)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    saved_graph = save_graph(graph_payload)
    return GraphSaveResponse(graph_id=saved_graph.graph_id, validation=validation)


@router.get("/{graph_id}")
def get_graph_endpoint(graph_id: str) -> NodeSystemGraphDocument:
    try:
        return load_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validate", response_model=GraphValidationResponse)
def validate_graph_endpoint(payload: dict[str, Any]) -> GraphValidationResponse:
    try:
        graph_payload = _parse_graph_request(payload)
    except ValidationError as exc:
        return GraphValidationResponse(valid=False, issues=_schema_errors_to_paths(exc))
    return validate_graph(graph_payload)


@router.post("/run")
def run_graph_endpoint(payload: dict[str, Any], background_tasks: BackgroundTasks) -> dict[str, str]:
    try:
        graph_payload = _parse_graph_request(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=GraphValidationResponse(valid=False, issues=_schema_errors_to_paths(exc)).model_dump(),
        ) from exc

    validation = validate_graph(graph_payload)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    executed_graph = save_graph(graph_payload)
    runtime_backend, langgraph_fallback_reasons = resolve_graph_runtime_backend(executed_graph)
    run_state = create_initial_run_state(
        graph_id=executed_graph.graph_id,
        graph_name=executed_graph.name,
        max_revision_round=int(executed_graph.metadata.get("max_revision_round", 1)),
    )
    run_state["runtime_backend"] = runtime_backend
    run_state["metadata"] = dict(executed_graph.metadata)
    run_state["metadata"]["resolved_runtime_backend"] = runtime_backend
    if langgraph_fallback_reasons:
        run_state["metadata"]["langgraph_fallback_reasons"] = list(langgraph_fallback_reasons)
    run_state["node_status_map"] = {node_name: "idle" for node_name in executed_graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)

    background_tasks.add_task(_run_graph_worker, executed_graph, run_state, runtime_backend, langgraph_fallback_reasons)
    return {"run_id": run_state["run_id"], "status": run_state["status"]}


def _run_graph_worker(
    graph: NodeSystemGraphDocument,
    run_state: dict[str, Any],
    runtime_backend: str,
    langgraph_fallback_reasons: list[str],
) -> None:
    try:
        if runtime_backend == "langgraph":
            try:
                execute_node_system_graph_langgraph(graph, run_state, persist_progress=True)
                return
            except NotImplementedError as exc:
                logger.warning(
                    "Graph %s resolved to LangGraph runtime but current adapter could not execute it: %s. Falling back to legacy executor.",
                    graph.graph_id,
                    exc,
                )
                run_state["runtime_backend"] = "legacy"
                run_state.setdefault("metadata", {})["resolved_runtime_backend"] = "legacy"
                fallback_reasons = [*langgraph_fallback_reasons, str(exc)]
                run_state["metadata"]["langgraph_fallback_reasons"] = list(dict.fromkeys(fallback_reasons))

        execute_node_system_graph(graph, run_state, persist_progress=True)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Graph run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
