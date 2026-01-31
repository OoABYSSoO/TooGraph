from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.templates import get_template, list_templates


router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_templates_endpoint() -> list[dict[str, Any]]:
    return list_templates()


@router.get("/{template_id}")
def get_template_endpoint(template_id: str) -> dict[str, Any]:
    try:
        return get_template(template_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' does not exist.") from exc
