from __future__ import annotations

from contextlib import ExitStack, contextmanager
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def _native_skill_manifest(skill_key: str = "video_understanding") -> str:
    return f"""{{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "{skill_key}",
  "label": "Video Understanding",
  "description": "Use frame sampling rules to understand a video with image-only model capability.",
  "version": "0.1.0",
  "targets": ["agent_node", "companion"],
  "kind": "workflow",
  "mode": "workflow",
  "scope": "graph",
  "permissions": ["model_vision", "file_read"],
  "inputSchema": [
    {{
      "key": "video",
      "label": "Video",
      "valueType": "video",
      "required": true,
      "description": "Source video file."
    }}
  ],
  "outputSchema": [
    {{
      "key": "summary",
      "label": "Summary",
      "valueType": "text",
      "required": true,
      "description": "Structured video summary."
    }}
  ],
  "supportedValueTypes": ["video", "image", "text"],
  "sideEffects": ["model_call", "file_read"]
}}
"""


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
      label: Text
      valueType: text
      required: true
      description: Source text.
  output_schema:
    - key: result
      label: Result
      valueType: text
      description: Imported result.
---
Imported skill body.
"""


def _patch_skill_storage(skills_dir: Path, state_dir: Path):
    return (
        patch("app.core.storage.skill_store.GRAPHITE_SKILLS_DIR", skills_dir),
        patch("app.core.storage.skill_store.SKILL_STATE_DATA_DIR", state_dir),
        patch("app.core.storage.skill_store.SKILL_STATE_PATH", state_dir / "registry_states.json"),
        patch("app.skills.definitions.GRAPHITE_SKILLS_DIR", skills_dir),
    )


@contextmanager
def _test_client_with_skill_storage(skills_dir: Path, state_dir: Path):
    with ExitStack() as stack:
        for patcher in _patch_skill_storage(skills_dir, state_dir):
            stack.enter_context(patcher)
        yield stack.enter_context(TestClient(app))


def _skill_zip_bytes() -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("uploaded_zip_skill/SKILL.md", _skill_markdown())
        archive.writestr("uploaded_zip_skill/helper.py", "print('helper')\n")
    return payload.getvalue()


def _native_skill_zip_bytes() -> bytes:
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("video_understanding/skill.json", _native_skill_manifest())
        archive.writestr("video_understanding/SKILL.md", "# Video Understanding\n")
        archive.writestr("video_understanding/workflow.json", '{"steps":[]}\n')
    return payload.getvalue()


class SkillUploadImportRouteTests(unittest.TestCase):
    def test_native_skill_json_upload_imports_graphite_skill_package(self) -> None:
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
                self.assertEqual(payload["sourceFormat"], "graphite_definition")
                self.assertEqual(payload["sourceScope"], "graphite_managed")
                self.assertEqual(payload["targets"], ["agent_node", "companion"])
                self.assertEqual(payload["kind"], "workflow")
                self.assertEqual(payload["mode"], "workflow")
                self.assertEqual(payload["scope"], "graph")
                self.assertEqual(payload["permissions"], ["model_vision", "file_read"])
                self.assertFalse(payload["runtimeReady"])
                self.assertFalse(payload["runtimeRegistered"])
                self.assertTrue(payload["configured"])
                self.assertTrue(payload["healthy"])

                imported_path = skills_dir / "graphite" / "video_understanding" / "skill.json"
                self.assertTrue(imported_path.exists())
                self.assertTrue((skills_dir / "graphite" / "video_understanding" / "workflow.json").exists())

                catalog_response = client.get("/api/skills/catalog?include_disabled=true")
                self.assertEqual(catalog_response.status_code, 200)
                catalog_items = {item["skillKey"]: item for item in catalog_response.json()}
                self.assertIn("video_understanding", catalog_items)
                self.assertEqual(catalog_items["video_understanding"]["targets"], ["agent_node", "companion"])

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
                self.assertFalse(payload["canImport"])
                self.assertEqual(payload["sourceScope"], "graphite_managed")

                imported_path = skills_dir / "claude_code" / "uploaded_zip_skill" / "SKILL.md"
                self.assertTrue(imported_path.exists())
                self.assertTrue((skills_dir / "claude_code" / "uploaded_zip_skill" / "helper.py").exists())

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
                self.assertTrue((skills_dir / "claude_code" / "uploaded_folder_skill" / "SKILL.md").exists())
                self.assertTrue((skills_dir / "claude_code" / "uploaded_folder_skill" / "helper.py").exists())

    def test_catalog_does_not_auto_discover_external_skill_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skills_dir = temp_path / "skill"
            state_dir = temp_path / "data" / "skills"
            external_skill_dir = skills_dir / "openclaw" / "tavily-search"
            external_skill_dir.mkdir(parents=True)
            (external_skill_dir / "SKILL.md").write_text(_skill_markdown("tavily-search"), encoding="utf-8")

            with _test_client_with_skill_storage(skills_dir, state_dir) as client:
                catalog_response = client.get("/api/skills/catalog?include_disabled=true")

                self.assertEqual(catalog_response.status_code, 200)
                self.assertNotIn("tavily-search", [item["skillKey"] for item in catalog_response.json()])


if __name__ == "__main__":
    unittest.main()
