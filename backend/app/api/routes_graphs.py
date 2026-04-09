from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.runtime.executor import execute_graph
from app.core.schemas.graph_family import (
    AnyGraphDocument,
    parse_graph_payload,
    normalize_graph_document,
    schema_errors_to_paths,
)
from app.core.schemas.graph import GraphSaveResponse, GraphValidationResponse
from app.core.storage.graph_store import list_graphs, load_graph, save_graph


router = APIRouter(prefix="/api/graphs", tags=["graphs"])


@router.get("", response_model=list[AnyGraphDocument])
def list_graphs_endpoint() -> list[AnyGraphDocument]:
    return list_graphs()


@router.post("/save", response_model=GraphSaveResponse)
def save_graph_endpoint(payload: dict[str, Any]) -> GraphSaveResponse:
    try:
        graph_payload = parse_graph_payload(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=GraphValidationResponse(valid=False, issues=schema_errors_to_paths(exc)).model_dump(),
        ) from exc

    graph = normalize_graph_document(graph_payload)
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    saved_graph = save_graph(graph_payload)
    return GraphSaveResponse(graph_id=saved_graph.graph_id, validation=validation)


@router.get("/{graph_id}", response_model=AnyGraphDocument)
def get_graph_endpoint(graph_id: str) -> AnyGraphDocument:
    try:
        return load_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validate", response_model=GraphValidationResponse)
def validate_graph_endpoint(payload: dict[str, Any]) -> GraphValidationResponse:
    try:
        graph_payload = parse_graph_payload(payload)
        graph = normalize_graph_document(graph_payload)
    except ValidationError as exc:
        return GraphValidationResponse(valid=False, issues=schema_errors_to_paths(exc))
    return validate_graph(graph)


@router.post("/run")
def run_graph_endpoint(payload: dict[str, Any]) -> dict[str, str]:
    try:
        graph_payload = parse_graph_payload(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=GraphValidationResponse(valid=False, issues=schema_errors_to_paths(exc)).model_dump(),
        ) from exc

    graph = normalize_graph_document(graph_payload)
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    executed_graph = save_graph(graph_payload)
    run_result = execute_graph(executed_graph)
    return {"run_id": run_result["run_id"], "status": run_result["status"]}
