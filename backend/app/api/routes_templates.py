from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.schemas.node_system import GraphValidationResponse, NodeSystemGraphPayload
from app.templates import get_template, list_templates, save_template


router = APIRouter(prefix="/api/templates", tags=["templates"])


def _schema_errors_to_paths(exc: ValidationError) -> list[dict[str, str]]:
    return [
        {
            "code": "schema_validation_error",
            "message": error["msg"],
            "path": ".".join(str(item) for item in error["loc"]),
        }
        for error in exc.errors()
    ]


@router.get("")
def list_templates_endpoint() -> list[dict[str, Any]]:
    return list_templates()


@router.post("/save")
def save_template_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        graph_payload = NodeSystemGraphPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=GraphValidationResponse(valid=False, issues=_schema_errors_to_paths(exc)).model_dump(),
        ) from exc

    validation = validate_graph(graph_payload)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())

    template = save_template(graph_payload)
    return {"template_id": template["template_id"], "saved": True, "template": template}


@router.get("/{template_id}")
def get_template_endpoint(template_id: str) -> dict[str, Any]:
    try:
        return get_template(template_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' does not exist.") from exc
