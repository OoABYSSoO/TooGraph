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


def _native_skill_manifest(
    skill_key: str = "video_understanding",
    *,
    run_policies: dict[str, object] | None = None,
    configured: bool = True,
    healthy: bool = True,
    runtime_entrypoint: str | None = None,
) -> str:
    manifest = {
        "schemaVersion": "graphite.skill/v1",
        "skillKey": skill_key,
        "name": "Video Understanding" if skill_key == "video_understanding" else skill_key.replace("_", " ").title(),
        "description": "Use frame sampling rules to understand a video with image-only model capability.",
        "agentInstruction": "Prepare the skill input from bound graph state and run the skill.",
        "version": "0.1.0",
        "runPolicies": run_policies
        or {
            "default": {
                "discoverable": True,
                "autoSelectable": False,
                "requiresApproval": False,
            },
            "origins": {
                "companion": {
                    "discoverable": True,
                    "autoSelectable": True,
                    "requiresApproval": True,
                }
            },
        },
        "kind": "workflow",
        "mode": "workflow",
        "scope": "graph",
        "permissions": ["model_vision", "file_read"],
        "inputSchema": [
            {
                "key": "video",
                "name": "Video",
                "valueType": "video",
                "required": True,
                "description": "Source video file.",
            }
        ],
        "outputSchema": [
            {
                "key": "summary",
                "name": "Summary",
                "valueType": "text",
                "required": True,
                "description": "Structured video summary.",
            }
        ],
        "supportedValueTypes": ["video", "image", "text"],
        "sideEffects": ["model_call", "file_read"],
        "configured": configured,
        "healthy": healthy,
    }
    if runtime_entrypoint is not None:
        manifest["runtime"] = {"type": "python", "entrypoint": runtime_entrypoint}
        manifest["health"] = {"type": "none"}
    return json.dumps(
        manifest,
        ensure_ascii=False,
        indent=2,
    )


def _skill_markdown(skill_key: str = "uploaded_zip_skill") -> str:
    return f"""---
name: Uploaded Skill
description: Imported from an uploaded archive.
graphite:
  skill_key: {skill_key}
  supported_value_types:
    - text
  side_effects: []
  input_schema:
    - key: text
      name: Text
      valueType: text
      required: true
      description: Source text.
  output_schema:
    - key: result
      name: Result
      valueType: text
      description: Imported result.
---
Imported skill body.
"""


def _patch_skill_storage(skills_dir: Path, state_dir: Path):
    user_skills_dir = state_dir / "user"
    return (
        patch("app.core.storage.skill_store.SKILLS_DIR", skills_dir),
        patch("app.core.storage.skill_store.USER_SKILLS_DIR", user_skills_dir),
        patch("app.core.storage.skill_store.SKILL_STATE_DATA_DIR", state_dir),
        patch("app.core.storage.skill_store.SKILL_STATE_PATH", state_dir / "registry_states.json"),
        patch("app.skills.definitions.SKILLS_DIR", skills_dir),
        patch("app.skills.definitions.USER_SKILLS_DIR", user_skills_dir),
        patch("app.skills.registry.SKILLS_DIR", skills_dir),
        patch("app.skills.registry.USER_SKILLS_DIR", user_skills_dir),
    )


@contextmanager
def _test_client_with_skill_storage(skills_dir: Path, state_dir: Path):
    with ExitStack() as stack:
        for patcher in _patch_skill_storage(skills_dir, state_dir):
            stack.enter_context(patcher)
        yield stack.enter_context(TestClient(app))


@contextmanager
def _test_client_with_skill_state(state_dir: Path):
    with ExitStack() as stack:
        stack.enter_context(patch("app.core.storage.skill_store.SKILL_STATE_DATA_DIR", state_dir))
        stack.enter_context(patch("app.core.storage.skill_store.SKILL_STATE_PATH", state_dir / "registry_states.json"))
        stack.enter_context(patch("app.core.storage.skill_store.USER_SKILLS_DIR", state_dir / "user"))
        stack.enter_context(patch("app.skills.definitions.USER_SKILLS_DIR", state_dir / "user"))
        stack.enter_context(patch("app.skills.registry.USER_SKILLS_DIR", state_dir / "user"))
        yield stack.enter_context(TestClient(app))


def _skill_zip_bytes() -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("uploaded_zip_skill/SKILL.md", _skill_markdown())
        archive.writestr("uploaded_zip_skill/helper.py", "print('helper')\n")
    return payload.getvalue()


def _native_skill_zip_bytes(skill_key: str = "video_understanding") -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr(f"{skill_key}/skill.json", _native_skill_manifest(skill_key))
        title = "Video Understanding" if skill_key == "video_understanding" else skill_key
        archive.writestr(f"{skill_key}/SKILL.md", f"# {title}\n")
        archive.writestr(f"{skill_key}/workflow.json", '{"steps":[]}\n')
        archive.writestr(f"{skill_key}/scripts/probe.py", "print('probe')\n")
    return payload.getvalue()


def _write_native_skill(
    skills_dir: Path,
    skill_key: str,
    *,
    configured: bool = True,
    healthy: bool = True,
    runtime: bool = True,
) -> None:
    skill_dir = skills_dir / skill_key
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "skill.json").write_text(
        _native_skill_manifest(
            skill_key,
            configured=configured,
            healthy=healthy,
            runtime_entrypoint="run.py" if runtime else None,
        ),
        encoding="utf-8",
    )
    (skill_dir / "SKILL.md").write_text(f"# {skill_key}\n", encoding="utf-8")
    if runtime:
        (skill_dir / "run.py").write_text("import json\nprint(json.dumps({'summary': 'ok'}))\n", encoding="utf-8")


class SkillUploadImportRouteTests(unittest.TestCase):
    def test_default_catalog_loads_official_skill_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir) / "data" / "skills"
            with _test_client_with_skill_state(state_dir) as client:
                response = client.get("/api/skills/catalog?include_disabled=true")

                self.assertEqual(response.status_code, 200)
                catalog_items = {item["skillKey"]: item for item in response.json()}
                self.assertEqual(
                    sorted(catalog_items),
                    [
                        "graphiteUI_skill_builder",
                        "local_workspace_executor",
                        "web_search",
                    ],
                )
                source_path = {
                    key: item["sourcePath"].replace("\\", "/")
                    for key, item in catalog_items.items()
                }
                self.assertEqual(catalog_items["web_search"]["sourceFormat"], "skill")
                self.assertEqual(catalog_items["web_search"]["sourceScope"], "official")
                self.assertFalse(catalog_items["web_search"]["canManage"])
                self.assertNotIn("targets", catalog_items["web_search"])
                self.assertTrue(catalog_items["web_search"]["runPolicies"]["default"]["discoverable"])
                self.assertTrue(catalog_items["web_search"]["runPolicies"]["origins"]["companion"]["autoSelectable"])
                self.assertFalse(catalog_items["web_search"]["runPolicies"]["origins"]["companion"]["requiresApproval"])
                self.assertTrue(catalog_items["web_search"]["runtimeReady"])
                self.assertTrue(catalog_items["web_search"]["runtimeRegistered"])
                self.assertTrue(source_path["web_search"].endswith("/skill/web_search/skill.json"))
                self.assertNotIn("compatibility", catalog_items["web_search"])

    def test_native_skill_json_upload_imports_user_skill_package(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                response = client.post(
                    "/api/skills/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_skill_zip_bytes(), "application/zip"))],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["skillKey"], "video_understanding")
                self.assertEqual(payload["sourceFormat"], "skill")
                self.assertEqual(payload["sourceScope"], "user")
                self.assertNotIn("targets", payload)
                self.assertEqual(
                    payload["runPolicies"]["origins"]["companion"],
                    {
                        "discoverable": True,
                        "autoSelectable": True,
                        "requiresApproval": True,
                    },
                )
                self.assertEqual(payload["kind"], "workflow")
                self.assertEqual(payload["mode"], "workflow")
                self.assertEqual(payload["scope"], "graph")
                self.assertEqual(payload["permissions"], ["model_vision", "file_read"])
                self.assertNotIn("compatibility", payload)
                self.assertFalse(payload["runtimeReady"])
                self.assertFalse(payload["runtimeRegistered"])
                self.assertEqual(payload["agentNodeEligibility"], "needs_manifest")
                self.assertIn("Skill manifest is missing a script runtime entrypoint.", payload["agentNodeBlockers"])
                self.assertTrue(payload["configured"])
                self.assertTrue(payload["healthy"])

                imported_path = state_dir / "user" / "video_understanding" / "skill.json"
                self.assertTrue(imported_path.exists())
                self.assertTrue((state_dir / "user" / "video_understanding" / "workflow.json").exists())

                catalog_response = client.get("/api/skills/catalog?include_disabled=true")
                self.assertEqual(catalog_response.status_code, 200)
                catalog_items = {item["skillKey"]: item for item in catalog_response.json()}
                self.assertIn("video_understanding", catalog_items)
                self.assertNotIn("targets", catalog_items["video_understanding"])
                self.assertTrue(catalog_items["video_understanding"]["runPolicies"]["default"]["discoverable"])

    def test_skill_file_tree_lists_package_files_for_inspection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                client.post(
                    "/api/skills/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_skill_zip_bytes(), "application/zip"))],
                )

                response = client.get("/api/skills/video_understanding/files")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["skillKey"], "video_understanding")
        self.assertEqual(payload["root"]["type"], "directory")
        root_children = {item["path"]: item for item in payload["root"]["children"]}
        self.assertIn("skill.json", root_children)
        self.assertIn("SKILL.md", root_children)
        self.assertIn("workflow.json", root_children)
        self.assertIn("scripts", root_children)
        self.assertEqual(root_children["scripts"]["type"], "directory")
        self.assertEqual(root_children["scripts"]["children"][0]["path"], "scripts/probe.py")
        self.assertTrue(root_children["scripts"]["children"][0]["previewable"])

    def test_skill_file_content_reads_text_and_blocks_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                client.post(
                    "/api/skills/imports/upload",
                    files=[("files", ("video_understanding.zip", _native_skill_zip_bytes(), "application/zip"))],
                )

                content_response = client.get("/api/skills/video_understanding/files/content?path=SKILL.md")
                traversal_response = client.get("/api/skills/video_understanding/files/content?path=../registry_states.json")

        self.assertEqual(content_response.status_code, 200)
        self.assertEqual(content_response.json()["content"], "# Video Understanding\n")
        self.assertEqual(content_response.json()["language"], "markdown")
        self.assertEqual(traversal_response.status_code, 400)

    def test_zip_archive_upload_imports_skill_into_managed_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                response = client.post(
                    "/api/skills/imports/upload",
                    files=[("files", ("uploaded_zip_skill.zip", _skill_zip_bytes(), "application/zip"))],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["skillKey"], "uploaded_zip_skill")
                self.assertEqual(payload["status"], "active")
                self.assertTrue(payload["canManage"])
                self.assertNotIn("canImport", payload)
                self.assertEqual(payload["sourceScope"], "user")

                imported_path = state_dir / "user" / "uploaded_zip_skill" / "SKILL.md"
                self.assertTrue(imported_path.exists())
                self.assertTrue((state_dir / "user" / "uploaded_zip_skill" / "helper.py").exists())

                catalog_response = client.get("/api/skills/catalog?include_disabled=true")
                self.assertEqual(catalog_response.status_code, 200)
                self.assertIn("uploaded_zip_skill", [item["skillKey"] for item in catalog_response.json()])

    def test_folder_upload_imports_skill_using_browser_relative_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                response = client.post(
                    "/api/skills/imports/upload",
                    data={
                        "relativePaths": [
                            "uploaded_folder_skill/SKILL.md",
                            "uploaded_folder_skill/helper.py",
                        ],
                    },
                    files=[
                        ("files", ("SKILL.md", _skill_markdown("uploaded_folder_skill"), "text/markdown")),
                        ("files", ("helper.py", "print('helper')\n", "text/x-python")),
                    ],
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["skillKey"], "uploaded_folder_skill")
                self.assertEqual(payload["sourceScope"], "user")
                self.assertTrue((state_dir / "user" / "uploaded_folder_skill" / "SKILL.md").exists())
                self.assertTrue((state_dir / "user" / "uploaded_folder_skill" / "helper.py").exists())

    def test_upload_import_rejects_skill_key_that_collides_with_official_skill(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            _write_native_skill(skills_dir, "web_search")
            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                response = client.post(
                    "/api/skills/imports/upload",
                    files=[("files", ("web_search.zip", _native_skill_zip_bytes("web_search"), "application/zip"))],
                )

                self.assertEqual(response.status_code, 400)
                self.assertIn("official Skill", response.json()["detail"])

    def test_catalog_ignores_legacy_platform_wrapper_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            legacy_platform_skill_dir = skills_dir / "openclaw" / "tavily-search"
            legacy_platform_skill_dir.mkdir(parents=True)
            (legacy_platform_skill_dir / "SKILL.md").write_text(_skill_markdown("tavily-search"), encoding="utf-8")
            direct_skill_dir = skills_dir / "direct-skill"
            direct_skill_dir.mkdir(parents=True)
            (direct_skill_dir / "SKILL.md").write_text(_skill_markdown("direct-skill"), encoding="utf-8")

            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                catalog_response = client.get("/api/skills/catalog?include_disabled=true")

                self.assertEqual(catalog_response.status_code, 200)
                skill_keys = [item["skillKey"] for item in catalog_response.json()]
                self.assertIn("direct-skill", skill_keys)
                self.assertNotIn("tavily-search", skill_keys)

    def test_definitions_endpoint_only_returns_agent_attachable_runtime_skills(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            _write_native_skill(skills_dir, "web_search")
            _write_native_skill(skills_dir, "extract_json_fields", runtime=False)
            _write_native_skill(skills_dir, "summarize_text", configured=False)
            _write_native_skill(skills_dir, "translate_text", healthy=False)

            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                response = client.get("/api/skills/definitions")

                self.assertEqual(response.status_code, 200)
                self.assertEqual([item["skillKey"] for item in response.json()], ["web_search"])

    def test_graph_validation_reports_unready_agent_skills(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            _write_native_skill(skills_dir, "rewrite_text", runtime=False)
            _write_native_skill(skills_dir, "summarize_text", configured=False)
            _write_native_skill(skills_dir, "translate_text", healthy=False)

            graph = NodeSystemGraphPayload.model_validate(
                {
                    "name": "Skill validation",
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
                                "skillKey": "rewrite_text",
                                "taskInstruction": "",
                            },
                        },
                        "agent_summarize": {
                            "kind": "agent",
                            "name": "Agent",
                            "description": "",
                            "ui": {"position": {"x": 220, "y": 0}, "collapsed": False},
                            "reads": [],
                            "writes": [],
                            "config": {"skillKey": "summarize_text", "taskInstruction": ""},
                        },
                        "agent_translate": {
                            "kind": "agent",
                            "name": "Agent",
                            "description": "",
                            "ui": {"position": {"x": 440, "y": 0}, "collapsed": False},
                            "reads": [],
                            "writes": [],
                            "config": {"skillKey": "translate_text", "taskInstruction": ""},
                        },
                        "agent_video": {
                            "kind": "agent",
                            "name": "Agent",
                            "description": "",
                            "ui": {"position": {"x": 660, "y": 0}, "collapsed": False},
                            "reads": [],
                            "writes": [],
                            "config": {"skillKey": "video_understanding", "taskInstruction": ""},
                        },
                    },
                    "edges": [],
                    "conditional_edges": [],
                    "metadata": {},
                }
            )

            with ExitStack() as stack:
                for patcher in _patch_skill_storage(skills_dir, state_dir):
                    stack.enter_context(patcher)
                validation = validate_graph(graph)

            self.assertFalse(validation.valid)
            issue_codes = [issue.code for issue in validation.issues]
            self.assertIn("agent_skill_not_agent_node_ready", issue_codes)
            self.assertIn("agent_skill_not_configured", issue_codes)
            self.assertIn("agent_skill_unhealthy", issue_codes)
            self.assertIn("agent_skill_not_runtime_registered", issue_codes)


if __name__ == "__main__":
    unittest.main()
