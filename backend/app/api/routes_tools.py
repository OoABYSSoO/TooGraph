from __future__ import annotations

from fastapi import APIRouter

from app.core.schemas.tools import ToolDefinition
from app.graph_tools.definitions import list_tool_catalog


router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/catalog", response_model=list[ToolDefinition])
def list_tool_catalog_endpoint(include_disabled: bool = True) -> list[ToolDefinition]:
    return list_tool_catalog(include_disabled=include_disabled)
