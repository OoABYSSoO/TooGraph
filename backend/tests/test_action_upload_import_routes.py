from __future__ import annotations

from contextlib import ExitStack, contextmanager
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.core.compiler.validator import validate_graph
from app.core.schemas.node_system import NodeSystemGraphPayload
from app.main import app


def _native_action_manifest(
    action_key: str = "video_understanding",
    *,
    runtime_entrypoint: str | None = None,
) -> str:
    manifest = {
        "schemaVersion": "toograph.action/v1",
        "actionKey": action_key,
        "name": "Video Understanding" if action_key == "video_understanding" else action_key.replace("_", " ").title(),
        "description": "Use frame sampling rules to understand a video with image-only model capability.",
        "llmInstruction": "Prepare the structured Action LLM output from bound graph state and run the action.",
        "version": "0.1.0",
        "permissions": ["model_vision", "file_read"],
        "llmOutputSchema": [
            {
                "key": "video",
                "name": "Video",
                "valueType": "video",
                "description": "Source video file.",
            }
        ],
        "stateOutputSchema": [
            {
                "key": "summary",
                "name": "Summary",
                "valueType": "text",
                "description": "Structured video summary.",
            }
        ],
    }
    if runtime_entrypoint is not None:
        manifest["runtime"] = {"type": "python", "entrypoint": runtime_entrypoint}
    return json.dumps(
        manifest,
        ensure_ascii=False,
        indent=2,
    )


def _action_markdown(action_key: str = "uploaded_zip_action") -> str:
    return f"""---
name: Uploaded Action
description: Imported from an uploaded archive.
toograph:
  action_key: {action_key}
  llm_output_schema:
    - key: text
      name: Text
      valueType: text
      description: Source text.
  state_output_schema:
    - key: result
      name: Result
      valueType: text
      description: Imported result.
---
Imported action body.
"""


def _patch_action_storage(actions_dir: Path, state_dir: Path):
    official_actions_dir = actions_dir / "official"
    user_actions_dir = actions_dir / "user"
    settings_path = actions_dir / "settings.json"
    return (
        patch("app.core.storage.action_store.ACTIONS_ROOT", actions_dir, create=True),
        patch("app.core.storage.action_store.OFFICIAL_ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.core.storage.action_store.ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.core.storage.action_store.USER_ACTIONS_DIR", user_actions_dir),
        patch("app.core.storage.action_store.ACTION_STATE_DATA_DIR", state_dir),
        patch("app.core.storage.action_store.ACTION_SETTINGS_PATH", settings_path, create=True),
        patch("app.core.storage.action_store.ACTION_STATE_PATH", settings_path),
        patch("app.actions.definitions.OFFICIAL_ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.actions.definitions.ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.actions.definitions.USER_ACTIONS_DIR", user_actions_dir),
        patch("app.actions.registry.OFFICIAL_ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.actions.registry.ACTIONS_DIR", official_actions_dir, create=True),
        patch("app.actions.registry.USER_ACTIONS_DIR", user_actions_dir),
    )


@contextmanager
def _test_client_with_action_storage(actions_dir: Path, state_dir: Path):
    with ExitStack() as stack:
        for patcher in _patch_action_storage(actions_dir, state_dir):
            stack.enter_context(patcher)
        yield stack.enter_context(TestClient(app))


@contextmanager
def _test_client_with_action_state(state_dir: Path):
    with ExitStack() as stack:
        stack.enter_context(patch("app.core.storage.action_store.ACTION_STATE_DATA_DIR", state_dir))
        stack.enter_context(patch("app.core.storage.action_store.ACTION_SETTINGS_PATH", state_dir / "settings.json", create=True))
        stack.enter_context(patch("app.core.storage.action_store.ACTION_STATE_PATH", state_dir / "settings.json"))
        stack.enter_context(patch("app.core.storage.action_store.USER_ACTIONS_DIR", state_dir / "user"))
        stack.enter_context(patch("app.actions.definitions.USER_ACTIONS_DIR", state_dir / "user"))
        stack.enter_context(patch("app.actions.registry.USER_ACTIONS_DIR", state_dir / "user"))
        yield stack.enter_context(TestClient(app))


def _action_zip_bytes() -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("uploaded_zip_action/ACTION.md", _action_markdown())
        archive.writestr("uploaded_zip_action/helper.py", "print('helper')\n")
    return payload.getvalue()


def _native_action_zip_bytes(action_key: str = "video_understanding") -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr(f"{action_key}/action.json", _native_action_manifest(action_key))
        title = "Video Understanding" if action_key == "video_understanding" else action_key
        archive.writestr(f"{action_key}/ACTION.md", f"# {title}\n")
        archive.writestr(f"{action_key}/workflow.json", '{"steps":[]}\n')
        archive.writestr(f"{action_key}/scripts/probe.py", "print('probe')\n")
    return payload.getvalue()


def _write_native_action(
    actions_dir: Path,
    action_key: str,
    *,
    runtime: bool = True,
) -> None:
    action_dir = actions_dir / "official" / action_key
    action_dir.mkdir(parents=True, exist_ok=True)
    (action_dir / "action.json").write_text(
        _native_action_manifest(
            action_key,
            runtime_entrypoint="run.py" if runtime else None,
        ),
        encoding="utf-8",
    )
    (action_dir / "ACTION.md").write_text(f"# {action_key}\n", encoding="utf-8")
    if runtime:
        (action_dir / "run.py").write_text("import json\nprint(json.dumps({'summary': 'ok'}))\n", encoding="utf-8")


class ActionUploadImportRouteTests(unittest.TestCase):
    def test_default_catalog_loads_official_action_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir) / "data" / "actions"
            with _test_client_with_action_state(state_dir) as client:
                response = client.get("/api/actions/catalog?include_disabled=true")

                self.assertEqual(response.status_code, 200)
                catalog_items = {item["actionKey"]: item for item in response.json()}
                self.assertEqual(
                    sorted(catalog_items),
                    sorted(
                        [
                            "buddy_home_writer",
                            "toograph_script_tester",
                            "toograph_graph_template_reader",
                            "toograph_graph_template_validator",
                            "toograph_graph_template_writer",
                            "toograph_action_builder",
                            "toograph_capability_selector",
                            "toograph_page_operator",
                            "local_workspace_executor",
                            "buddy_session_recall",
                            "toograph_action_package_reader",
                            "web_search",
                        ]
                    ),
                )
                source_path = {
                    key: item["sourcePath"].replace("\\", "/")
                    for key, item in catalog_items.items()
                }
                self.assertEqual(catalog_items["web_search"]["sourceScope"], "official")
                self.assertFalse(catalog_items["web_search"]["canManage"])
                self.assertNotIn("targets", catalog_items["web_search"])
                self.assertNotIn("sourceFormat", catalog_items["web_search"])
                self.assertTrue(catalog_items["web_search"]["capabilityPolicy"]["default"]["selectable"])
                self.assertFalse(catalog_items["web_search"]["capabilityPolicy"]["default"]["requiresApproval"])
                self.assertEqual(catalog_items["web_search"]["capabilityPolicy"]["origins"], {})
                self.assertTrue(catalog_items["web_search"]["runtimeReady"])
                self.assertTrue(catalog_items["web_search"]["runtimeRegistered"])
                self.assertTrue(source_path["web_search"].endswith("/action/official/web_search/action.json"))
                self.assertEqual(catalog_items["toograph_action_builder"]["sourceScope"], "official")
                self.assertFalse(catalog_items["toograph_action_builder"]["canManage"])
                self.assertTrue(catalog_items["toograph_action_builder"]["runtimeReady"])
                self.assertTrue(catalog_items["toograph_action_builder"]["runtimeRegistered"])
                self.assertTrue(
                    source_path["toograph_action_builder"].endswith(
                        "/action/official/toograph_action_builder/action.json"
                    )
                )
                self.assertEqual(catalog_items["toograph_script_tester"]["sourceScope"], "official")
                self.assertFalse(catalog_items["toograph_script_tester"]["canManage"])
                self.assertTrue(catalog_items["toograph_script_tester"]["runtimeReady"])
                self.assertTrue(catalog_items["toograph_script_tester"]["runtimeRegistered"])
                self.assertTrue(
                    source_path["toograph_script_tester"].endswith(
                        "/action/official/toograph_script_tester/action.json"
                    )
                )
                for action_key in [
                    "toograph_graph_template_reader",
                    "toograph_graph_template_validator",
                    "toograph_graph_template_writer",
                ]:
                    with self.subTest(action_key=action_key):
                        self.assertEqual(catalog_items[action_key]["sourceScope"], "official")
                        self.assertFalse(catalog_items[action_key]["canManage"])
                        self.assertTrue(catalog_items[action_key]["runtimeReady"])
                        self.assertTrue(catalog_items[action_key]["runtimeRegistered"])
                        self.assertTrue(
                            source_path[action_key].endswith(f"/action/official/{action_key}/action.json")
                        )
                self.assertEqual(catalog_items["local_workspace_executor"]["sourceScope"], "official")
                self.assertFalse(catalog_items["local_workspace_executor"]["canManage"])
                self.assertTrue(catalog_items["local_workspace_executor"]["runtimeReady"])
                self.assertTrue(catalog_items["local_workspace_executor"]["runtimeRegistered"])
                self.assertTrue(
                    source_path["local_workspace_executor"].endswith(
                        "/action/official/local_workspace_executor/action.json"
                    )
                )
                self.assertEqual(catalog_items["buddy_session_recall"]["sourceScope"], "official")
                self.assertFalse(catalog_items["buddy_session_recall"]["canManage"])
                self.assertTrue(catalog_items["buddy_session_recall"]["runtimeReady"])
                self.assertTrue(catalog_items["buddy_session_recall"]["runtimeRegistered"])
                self.assertTrue(
                    source_path["buddy_session_recall"].endswith(
                        "/action/official/buddy_session_recall/action.json"
                    )
                )
                self.assertEqual(catalog_items["toograph_action_package_reader"]["sourceScope"], "official")
                self.assertFalse(catalog_items["toograph_action_package_reader"]["canManage"])
                self.assertTrue(catalog_items["toograph_action_package_reader"]["runtimeReady"])
                self.assertTrue(catalog_items["toograph_action_package_reader"]["runtimeRegistered"])
                self.assertTrue(
                    source_path["toograph_action_package_reader"].endswith(
                        "/action/official/toograph_action_package_reader/action.json"
                    )
                )
                self.assertNotIn("compatibility", catalog_items["web_search"])

                settings_path = state_dir / "settings.json"
                self.assertTrue(settings_path.exists())
                settings_payload = json.loads(settings_path.read_text(encoding="utf-8"))
                self.assertEqual(settings_payload["schemaVersion"], "toograph.action-settings/v1")
                self.assertIn("web_search", settings_payload["entries"])
                self.assertEqual(settings_payload["entries"]["web_search"], {"enabled": True})
                self.assertEqual(settings_payload["entries"]["buddy_session_recall"], {"enabled": True})
                self.assertEqual(settings_payload["entries"]["toograph_action_package_reader"], {"enabled": True})

    def test_official_action_visibility_can_be_disabled_in_local_settings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir) / "data" / "actions"
            with _test_client_with_action_state(state_dir) as client:
                disable_response = client.post("/api/actions/web_search/disable")
                catalog_response = client.get("/api/actions/catalog?include_disabled=true")

                self.assertEqual(disable_response.status_code, 200)
                self.assertEqual(disable_response.json()["status"], "disabled")
                self.assertEqual(disable_response.json()["sourceScope"], "official")
                self.assertFalse(disable_response.json()["canManage"])
                self.assertEqual(catalog_response.status_code, 200)
                catalog_items = {item["actionKey"]: item for item in catalog_response.json()}
                self.assertEqual(catalog_items["web_search"]["status"], "disabled")
                settings_payload = json.loads((state_dir / "settings.json").read_text(encoding="utf-8"))
                self.assertEqual(settings_payload["entries"]["web_search"], {"enabled": False})

    def test_native_action_json_upload_imports_user_action_package(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                response = client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_action_zip_bytes(), "application/zip"))],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["actionKey"], "video_understanding")
                self.assertNotIn("sourceFormat", payload)
                self.assertEqual(payload["sourceScope"], "user")
                self.assertNotIn("targets", payload)
                self.assertFalse(payload["capabilityPolicy"]["default"]["requiresApproval"])
                self.assertEqual(payload["capabilityPolicy"]["origins"], {})
                self.assertEqual(payload["permissions"], ["model_vision", "file_read"])
                self.assertNotIn("kind", payload)
                self.assertNotIn("mode", payload)
                self.assertNotIn("scope", payload)
                self.assertNotIn("supportedValueTypes", payload)
                self.assertNotIn("sideEffects", payload)
                self.assertNotIn("compatibility", payload)
                self.assertNotIn("health", payload)
                self.assertNotIn("configured", payload)
                self.assertNotIn("healthy", payload)
                self.assertFalse(payload["runtimeReady"])
                self.assertFalse(payload["runtimeRegistered"])
                self.assertEqual(payload["llmNodeEligibility"], "needs_manifest")
                self.assertIn("Action manifest is missing a script runtime entrypoint.", payload["llmNodeBlockers"])

                imported_path = actions_dir / "user" / "video_understanding" / "action.json"
                self.assertTrue(imported_path.exists())
                self.assertTrue((actions_dir / "user" / "video_understanding" / "workflow.json").exists())
                self.assertNotIn("capabilityPolicy", json.loads(imported_path.read_text(encoding="utf-8")))

                settings_payload = json.loads((actions_dir / "settings.json").read_text(encoding="utf-8"))
                self.assertEqual(settings_payload["schemaVersion"], "toograph.action-settings/v1")
                self.assertEqual(settings_payload["entries"]["video_understanding"], {"enabled": True})

                catalog_response = client.get("/api/actions/catalog?include_disabled=true")
                self.assertEqual(catalog_response.status_code, 200)
                catalog_items = {item["actionKey"]: item for item in catalog_response.json()}
                self.assertIn("video_understanding", catalog_items)
                self.assertNotIn("targets", catalog_items["video_understanding"])
                self.assertTrue(catalog_items["video_understanding"]["capabilityPolicy"]["default"]["selectable"])

    def test_action_file_tree_lists_package_files_for_inspection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_action_zip_bytes(), "application/zip"))],
                )

                response = client.get("/api/actions/video_understanding/files")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["actionKey"], "video_understanding")
        self.assertEqual(payload["root"]["type"], "directory")
        root_children = {item["path"]: item for item in payload["root"]["children"]}
        self.assertIn("action.json", root_children)
        self.assertIn("ACTION.md", root_children)
        self.assertIn("workflow.json", root_children)
        self.assertIn("scripts", root_children)
        self.assertEqual(root_children["scripts"]["type"], "directory")
        self.assertEqual(root_children["scripts"]["children"][0]["path"], "scripts/probe.py")
        self.assertTrue(root_children["scripts"]["children"][0]["previewable"])

    def test_legacy_action_policy_updates_are_rejected_without_touching_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                import_response = client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_action_zip_bytes(), "application/zip"))],
                )
                self.assertEqual(import_response.status_code, 200)

                response = client.patch(
                    "/api/actions/video_understanding/settings",
                    json={
                        "capabilityPolicy": {
                            "default": {"selectable": True, "requiresApproval": False},
                            "origins": {
                                "buddy": {"selectable": False, "requiresApproval": True},
                            },
                        }
                    },
                )

                self.assertEqual(response.status_code, 410)
                self.assertIn("enable or disable", response.json()["detail"])

                manifest_payload = json.loads((actions_dir / "user" / "video_understanding" / "action.json").read_text(encoding="utf-8"))
                self.assertNotIn("capabilityPolicy", manifest_payload)
                settings_payload = json.loads((actions_dir / "settings.json").read_text(encoding="utf-8"))
                self.assertEqual(settings_payload["entries"]["video_understanding"], {"enabled": True})

    def test_action_file_content_reads_text_and_blocks_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_action_zip_bytes(), "application/zip"))],
                )

                content_response = client.get("/api/actions/video_understanding/files/content?path=ACTION.md")
                traversal_response = client.get("/api/actions/video_understanding/files/content?path=../registry_states.json")

        self.assertEqual(content_response.status_code, 200)
        self.assertEqual(content_response.json()["content"], "# Video Understanding\n")
        self.assertEqual(content_response.json()["language"], "markdown")
        self.assertEqual(traversal_response.status_code, 400)

    def test_zip_archive_upload_imports_action_into_managed_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                response = client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("uploaded_zip_action.zip", _action_zip_bytes(), "application/zip"))],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["actionKey"], "uploaded_zip_action")
                self.assertEqual(payload["status"], "active")
                self.assertTrue(payload["canManage"])
                self.assertNotIn("canImport", payload)
                self.assertEqual(payload["sourceScope"], "user")

                imported_path = actions_dir / "user" / "uploaded_zip_action" / "ACTION.md"
                self.assertTrue(imported_path.exists())
                self.assertTrue((actions_dir / "user" / "uploaded_zip_action" / "helper.py").exists())

                catalog_response = client.get("/api/actions/catalog?include_disabled=true")
                self.assertEqual(catalog_response.status_code, 200)
                self.assertIn("uploaded_zip_action", [item["actionKey"] for item in catalog_response.json()])

    def test_folder_upload_imports_action_using_browser_relative_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                response = client.post(
                    "/api/actions/imports/upload",
                    data={
                        "relativePaths": [
                            "uploaded_folder_action/ACTION.md",
                            "uploaded_folder_action/helper.py",
                        ],
                    },
                    files=[
                        ("files", ("ACTION.md", _action_markdown("uploaded_folder_action"), "text/markdown")),
                        ("files", ("helper.py", "print('helper')\n", "text/x-python")),
                    ],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["actionKey"], "uploaded_folder_action")
                self.assertEqual(payload["sourceScope"], "user")
                self.assertTrue((actions_dir / "user" / "uploaded_folder_action" / "ACTION.md").exists())
                self.assertTrue((actions_dir / "user" / "uploaded_folder_action" / "helper.py").exists())

    def test_upload_import_rejects_action_key_that_collides_with_official_action(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            _write_native_action(actions_dir, "web_search")
            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                response = client.post(
                    "/api/actions/imports/upload",
                    files=[("files", ("web_search.zip", _native_action_zip_bytes("web_search"), "application/zip"))],
                )

                self.assertEqual(response.status_code, 400)
                self.assertIn("official Action", response.json()["detail"])

    def test_catalog_ignores_legacy_platform_wrapper_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            legacy_platform_action_dir = actions_dir / "official" / "openclaw" / "tavily-search"
            legacy_platform_action_dir.mkdir(parents=True)
            (legacy_platform_action_dir / "ACTION.md").write_text(_action_markdown("tavily-search"), encoding="utf-8")
            direct_action_dir = actions_dir / "official" / "direct-action"
            direct_action_dir.mkdir(parents=True)
            (direct_action_dir / "ACTION.md").write_text(_action_markdown("direct-action"), encoding="utf-8")

            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                catalog_response = client.get("/api/actions/catalog?include_disabled=true")

                self.assertEqual(catalog_response.status_code, 200)
                action_keys = [item["actionKey"] for item in catalog_response.json()]
                self.assertIn("direct-action", action_keys)
                self.assertNotIn("tavily-search", action_keys)

    def test_definitions_endpoint_only_returns_agent_attachable_runtime_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            _write_native_action(actions_dir, "web_search")
            _write_native_action(actions_dir, "extract_json_fields", runtime=False)

            with _test_client_with_action_storage(actions_dir, state_dir) as client:
                response = client.get("/api/actions/definitions")

                self.assertEqual(response.status_code, 200)
                self.assertEqual([item["actionKey"] for item in response.json()], ["web_search"])

    def test_graph_validation_reports_unready_agent_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            actions_dir = temp_path / "action"
            state_dir = temp_path / "data" / "actions"
            _write_native_action(actions_dir, "rewrite_text", runtime=False)

            graph = NodeSystemGraphPayload.model_validate(
                {
                    "name": "Action validation",
                    "state_schema": {},
                    "nodes": {
                        "agent_rewrite": {
                            "kind": "agent",
                            "name": "Agent",
                            "description": "",
                            "ui": {"position": {"x": 0, "y": 0}, "collapsed": False},
                            "reads": [],
                            "writes": [],
                            "config": {
                                "actionKey": "rewrite_text",
                                "taskInstruction": "",
                            },
                        },
                        "agent_video": {
                            "kind": "agent",
                            "name": "Agent",
                            "description": "",
                            "ui": {"position": {"x": 220, "y": 0}, "collapsed": False},
                            "reads": [],
                            "writes": [],
                            "config": {"actionKey": "video_understanding", "taskInstruction": ""},
                        },
                    },
                    "edges": [],
                    "conditional_edges": [],
                    "metadata": {},
                }
            )

            with ExitStack() as stack:
                for patcher in _patch_action_storage(actions_dir, state_dir):
                    stack.enter_context(patcher)
                validation = validate_graph(graph)

            self.assertFalse(validation.valid)
            issue_codes = [issue.code for issue in validation.issues]
            self.assertIn("agent_action_not_agent_node_ready", issue_codes)
            self.assertIn("agent_action_not_runtime_registered", issue_codes)


if __name__ == "__main__":
    unittest.main()
