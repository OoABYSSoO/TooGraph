from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.schemas.tools import ToolCatalogStatus
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


def test_tool_catalog_route_enables_and_disables_tools() -> None:
    active_definition = ToolDefinition(
        toolKey="json_passthrough",
        name="JSON Passthrough",
        description="Return JSON input.",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        runtimeReady=True,
        runtimeRegistered=True,
        status=ToolCatalogStatus.ACTIVE,
    )
    disabled_definition = active_definition.model_copy(update={"status": ToolCatalogStatus.DISABLED})

    with (
        patch(
            "app.api.routes_tools.get_tool_catalog_registry",
            side_effect=[
                {"json_passthrough": active_definition},
                {"json_passthrough": disabled_definition},
                {"json_passthrough": disabled_definition},
                {"json_passthrough": active_definition},
            ],
            create=True,
        ) as catalog_registry,
        patch("app.api.routes_tools.disable_tool", create=True) as disable_tool,
        patch("app.api.routes_tools.enable_tool", create=True) as enable_tool,
        TestClient(app) as client,
    ):
        disable_response = client.post("/api/tools/json_passthrough/disable")
        enable_response = client.post("/api/tools/json_passthrough/enable")

    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"
    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "active"
    disable_tool.assert_called_once_with("json_passthrough")
    enable_tool.assert_called_once_with("json_passthrough")
    assert catalog_registry.call_count == 4


def test_tool_catalog_route_deletes_user_tools_only() -> None:
    user_definition = ToolDefinition(
        toolKey="json_passthrough",
        name="JSON Passthrough",
        description="Return JSON input.",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        sourceScope="user",
        canManage=True,
    )

    with (
        patch(
            "app.api.routes_tools.get_tool_catalog_registry",
            return_value={"json_passthrough": user_definition},
            create=True,
        ),
        patch("app.api.routes_tools.delete_tool", create=True) as delete_tool,
        TestClient(app) as client,
    ):
        response = client.delete("/api/tools/json_passthrough")

    assert response.status_code == 200
    assert response.json() == {"toolKey": "json_passthrough", "status": "deleted"}
    delete_tool.assert_called_once_with("json_passthrough")


def test_tool_catalog_route_exposes_package_files() -> None:
    definition = ToolDefinition(
        toolKey="json_passthrough",
        name="JSON Passthrough",
        description="Return JSON input.",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        sourcePath="/tool/user/json_passthrough/tool.json",
    )

    file_tree = {
        "toolKey": "json_passthrough",
        "root": {
            "name": "json_passthrough",
            "path": "",
            "type": "directory",
            "children": [],
        },
    }
    file_content = {
        "toolKey": "json_passthrough",
        "path": "tool.json",
        "name": "tool.json",
        "size": 2,
        "language": "json",
        "previewable": True,
        "executable": False,
        "encoding": "utf-8",
        "content": "{}",
    }

    with (
        patch(
            "app.api.routes_tools.get_tool_catalog_registry",
            return_value={"json_passthrough": definition},
            create=True,
        ),
        patch("app.api.routes_tools.build_tool_file_tree", return_value=file_tree, create=True) as build_tree,
        patch("app.api.routes_tools.read_tool_file_content", return_value=file_content, create=True) as read_content,
        TestClient(app) as client,
    ):
        tree_response = client.get("/api/tools/json_passthrough/files")
        content_response = client.get("/api/tools/json_passthrough/files/content?path=tool.json")

    assert tree_response.status_code == 200
    assert tree_response.json()["toolKey"] == "json_passthrough"
    assert content_response.status_code == 200
    assert content_response.json()["content"] == "{}"
    build_tree.assert_called_once_with(definition)
    read_content.assert_called_once_with(definition, "tool.json")


def test_tool_catalog_route_imports_uploaded_tools() -> None:
    definition = ToolDefinition(
        toolKey="json_passthrough",
        name="JSON Passthrough",
        description="Return JSON input.",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        sourceScope="user",
        canManage=True,
    )

    with (
        patch("app.api.routes_tools.import_tool_from_directory", return_value="json_passthrough", create=True),
        patch(
            "app.api.routes_tools.get_tool_catalog_registry",
            return_value={"json_passthrough": definition},
            create=True,
        ),
        TestClient(app) as client,
    ):
        response = client.post(
            "/api/tools/imports/upload",
            files={"files": ("tool.json", b'{"toolKey":"json_passthrough"}', "application/json")},
            data={"relativePaths": "json_passthrough/tool.json"},
        )

    assert response.status_code == 200
    assert response.json()["toolKey"] == "json_passthrough"
