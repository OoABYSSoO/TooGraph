from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.schemas.tools import ToolDefinition, ToolIoField
from app.main import app


def test_tool_catalog_route_returns_tool_definitions() -> None:
    definition = ToolDefinition(
        toolKey="json_passthrough",
        name="JSON Passthrough",
        description="Return JSON input.",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        runtimeReady=True,
        runtimeRegistered=True,
    )

    with (
        patch("app.api.routes_tools.list_tool_catalog", return_value=[definition]) as list_catalog,
        TestClient(app) as client,
    ):
        response = client.get("/api/tools/catalog?include_disabled=true")

    assert response.status_code == 200
    assert response.json()[0]["toolKey"] == "json_passthrough"
    list_catalog.assert_called_once_with(include_disabled=True)
