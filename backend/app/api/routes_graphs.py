from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.runtime.executor import execute_graph
from app.core.schemas.graph import (
    GraphDocument,
    GraphPayload,
    GraphSaveResponse,
    GraphValidationResponse,
)
from app.core.storage.graph_store import list_graphs, load_graph, save_graph


router = APIRouter(prefix="/api/graphs", tags=["graphs"])


@router.get("", response_model=list[GraphDocument])
def list_graphs_endpoint() -> list[GraphDocument]:
    return list_graphs()


@router.post("/save", response_model=GraphSaveResponse)
def save_graph_endpoint(payload: GraphPayload) -> GraphSaveResponse:
    graph = GraphDocument(
        **payload.model_dump(exclude={"graph_id"}),
        graph_id=payload.graph_id or "temp",
    )
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    saved_graph = save_graph(payload)
    return GraphSaveResponse(graph_id=saved_graph.graph_id, validation=validation)


@router.get("/{graph_id}", response_model=GraphDocument)
def get_graph_endpoint(graph_id: str) -> GraphDocument:
    try:
        return load_graph(graph_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validate", response_model=GraphValidationResponse)
def validate_graph_endpoint(payload: dict[str, Any]) -> GraphValidationResponse:
    try:
        graph_payload = GraphPayload.model_validate(payload)
        graph = GraphDocument(
            **graph_payload.model_dump(exclude={"graph_id"}),
            graph_id=graph_payload.graph_id or "temp",
        )
    except ValidationError as exc:
        return GraphValidationResponse(
            valid=False,
            issues=[
                {
                    "code": "schema_validation_error",
                    "message": error["msg"],
                    "path": ".".join(str(item) for item in error["loc"]),
                }
                for error in exc.errors()
            ],
        )
    return validate_graph(graph)


@router.post("/run")
def run_graph_endpoint(payload: GraphPayload) -> dict[str, str]:
    graph = GraphDocument(
        **payload.model_dump(exclude={"graph_id"}),
        graph_id=payload.graph_id or "temp",
    )
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    executed_graph = save_graph(payload)
    run_result = execute_graph(executed_graph)
    return {"run_id": run_result["run_id"], "status": run_result["status"]}
