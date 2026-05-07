from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import publish_run_event
from app.core.langgraph.codegen import generate_langgraph_python_source, import_graph_payload_from_python_source
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.schemas.node_system import (
    GraphSaveResponse,
    GraphValidationResponse,
    NodeSystemGraphDocument,
    NodeSystemGraphPayload,
)
from app.core.storage.graph_store import delete_graph, disable_graph, enable_graph, list_graphs, load_graph, save_graph
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


def _build_runtime_graph_document(graph_payload: NodeSystemGraphPayload) -> NodeSystemGraphDocument:
    runtime_graph_id = graph_payload.graph_id or f"runtime_graph_{uuid4().hex[:10]}"
    return NodeSystemGraphDocument.model_validate(
        {
            **graph_payload.model_dump(exclude={"graph_id"}, by_alias=True, mode="json"),
            "graph_id": runtime_graph_id,
        }
    )


@router.get("")
def list_graphs_endpoint(include_disabled: bool = False) -> list[NodeSystemGraphDocument]:
    return list_graphs(include_disabled=include_disabled)


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


@router.post("/{graph_id}/disable", response_model=NodeSystemGraphDocument)
def disable_graph_endpoint(graph_id: str) -> NodeSystemGraphDocument:
    try:
        return disable_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{graph_id}/enable", response_model=NodeSystemGraphDocument)
def enable_graph_endpoint(graph_id: str) -> NodeSystemGraphDocument:
    try:
        return enable_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{graph_id}")
def delete_graph_endpoint(graph_id: str) -> dict[str, str]:
    try:
        delete_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"graph_id": graph_id, "status": "deleted"}


@router.post("/validate", response_model=GraphValidationResponse)
def validate_graph_endpoint(payload: dict[str, Any]) -> GraphValidationResponse:
    try:
        graph_payload = _parse_graph_request(payload)
    except ValidationError as exc:
        return GraphValidationResponse(valid=False, issues=_schema_errors_to_paths(exc))
    return validate_graph(graph_payload)


@router.post("/export/langgraph-python", response_class=PlainTextResponse)
def export_langgraph_python_endpoint(payload: dict[str, Any]) -> str:
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

    reasons = get_langgraph_runtime_unsupported_reasons(graph_payload)
    if reasons:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Graph '{graph_payload.graph_id or graph_payload.name}' is not supported by the LangGraph runtime exporter.",
                "reasons": reasons,
            },
        )
    return generate_langgraph_python_source(graph_payload)


@router.post("/import/python", response_model=NodeSystemGraphPayload)
def import_langgraph_python_endpoint(payload: dict[str, Any]) -> NodeSystemGraphPayload:
    source = payload.get("source")
    if not isinstance(source, str) or not source.strip():
        raise HTTPException(status_code=422, detail={"message": "Python source is required."})

    try:
        graph_payload = import_graph_payload_from_python_source(source)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)}) from exc

    validation = validate_graph(graph_payload)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())
    return graph_payload


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

    executed_graph = _build_runtime_graph_document(graph_payload)
    langgraph_unsupported_reasons = get_langgraph_runtime_unsupported_reasons(executed_graph)
    if langgraph_unsupported_reasons:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Graph '{executed_graph.graph_id or executed_graph.name}' is not supported by the LangGraph runtime.",
                "reasons": langgraph_unsupported_reasons,
            },
        )
    run_state = create_initial_run_state(
        graph_id=executed_graph.graph_id,
        graph_name=executed_graph.name,
        max_revision_round=int(executed_graph.metadata.get("max_revision_round", 1)),
    )
    run_state["runtime_backend"] = "langgraph"
    run_state["metadata"] = dict(executed_graph.metadata)
    run_state["metadata"]["resolved_runtime_backend"] = "langgraph"
    run_state["graph_snapshot"] = executed_graph.model_dump(by_alias=True)
    run_state["node_status_map"] = {node_name: "idle" for node_name in executed_graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)

    background_tasks.add_task(_run_graph_worker, executed_graph, run_state)
    return {"run_id": run_state["run_id"], "status": run_state["status"]}


def _run_graph_worker(
    graph: NodeSystemGraphDocument,
    run_state: dict[str, Any],
) -> None:
    try:
        execute_node_system_graph_langgraph(graph, run_state, persist_progress=True)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Graph run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        publish_run_event(
            str(run_state.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
        )
