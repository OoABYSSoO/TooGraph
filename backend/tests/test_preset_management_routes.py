from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import json

from fastapi.testclient import TestClient

from app.main import app


def _preset_payload(preset_id: str = "agent_writer") -> dict[str, object]:
    return {
        "presetId": preset_id,
        "sourcePresetId": None,
        "definition": {
            "label": "Writer Agent",
            "description": "Drafts an answer.",
            "state_schema": {
                "question": {
                    "name": "Question",
                    "description": "User question",
                    "type": "text",
                    "color": "#d8a650",
                }
            },
            "node": {
                "kind": "agent",
                "name": "Writer",
                "description": "Answer agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question", "required": True}],
                "writes": [],
                "config": {
                    "skillKey": "",
                    "taskInstruction": "Answer the question.",
                    "modelSource": "global",
                    "model": "",
                    "thinkingMode": "on",
                    "temperature": 0.2,
                },
            },
        },
    }


def _input_preset_payload() -> dict[str, object]:
    payload = _preset_payload("input_question")
    definition = payload["definition"]
    assert isinstance(definition, dict)
    definition["label"] = "Question Input"
    definition["description"] = "Captures the user's question."
    definition["node"] = {
        "kind": "input",
        "name": "Question",
        "description": "Question input",
        "ui": {"position": {"x": 0, "y": 0}},
        "reads": [],
        "writes": [{"state": "question"}],
        "config": {"value": ""},
    }
    return payload


class PresetManagementRouteTests(unittest.TestCase):
    def test_presets_can_be_disabled_enabled_listed_and_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            preset_root = Path(temp_dir) / "node_preset"
            official_preset_dir = preset_root / "official"
            user_preset_dir = preset_root / "user"
            with (
                patch("app.core.storage.database.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_ROOT", preset_root, create=True),
                patch("app.core.storage.preset_store.OFFICIAL_PRESET_ROOT", official_preset_dir, create=True),
                patch("app.core.storage.preset_store.USER_PRESET_ROOT", user_preset_dir, create=True),
                patch("app.core.storage.preset_store.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_SETTINGS_PATH", preset_root / "settings.local.json", create=True),
                TestClient(app) as client,
            ):
                create_response = client.post("/api/presets", json=_preset_payload())

                self.assertEqual(create_response.status_code, 200)
                self.assertEqual(create_response.json()["presetId"], "agent_writer")
                saved_path = user_preset_dir / "agent_writer" / "preset.json"
                self.assertTrue(saved_path.exists())
                self.assertNotIn("status", json.loads(saved_path.read_text(encoding="utf-8")))
                settings_payload = json.loads((preset_root / "settings.local.json").read_text(encoding="utf-8"))
                self.assertTrue(settings_payload["entries"]["agent_writer"]["enabled"])

                listed_response = client.get("/api/presets")
                self.assertEqual(listed_response.status_code, 200)
                listed_payload = listed_response.json()
                self.assertEqual(len(listed_payload), 1)
                self.assertEqual(listed_payload[0]["status"], "active")

                disabled_response = client.post("/api/presets/agent_writer/disable")
                self.assertEqual(disabled_response.status_code, 200)
                self.assertEqual(disabled_response.json()["status"], "disabled")
                self.assertNotIn("status", json.loads(saved_path.read_text(encoding="utf-8")))
                settings_payload = json.loads((preset_root / "settings.local.json").read_text(encoding="utf-8"))
                self.assertFalse(settings_payload["entries"]["agent_writer"]["enabled"])

                active_only_response = client.get("/api/presets")
                self.assertEqual(active_only_response.status_code, 200)
                self.assertEqual(active_only_response.json(), [])

                management_response = client.get("/api/presets?include_disabled=true")
                self.assertEqual(management_response.status_code, 200)
                self.assertEqual(len(management_response.json()), 1)
                self.assertEqual(management_response.json()[0]["status"], "disabled")

                enabled_response = client.post("/api/presets/agent_writer/enable")
                self.assertEqual(enabled_response.status_code, 200)
                self.assertEqual(enabled_response.json()["status"], "active")

                delete_response = client.delete("/api/presets/agent_writer")
                self.assertEqual(delete_response.status_code, 200)
                self.assertEqual(delete_response.json(), {"presetId": "agent_writer", "status": "deleted"})

                missing_response = client.get("/api/presets/agent_writer")
                self.assertEqual(missing_response.status_code, 404)

    def test_preset_save_rejects_non_agent_nodes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            preset_root = Path(temp_dir) / "node_preset"
            official_preset_dir = preset_root / "official"
            user_preset_dir = preset_root / "user"
            with (
                patch("app.core.storage.database.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_ROOT", preset_root, create=True),
                patch("app.core.storage.preset_store.OFFICIAL_PRESET_ROOT", official_preset_dir, create=True),
                patch("app.core.storage.preset_store.USER_PRESET_ROOT", user_preset_dir, create=True),
                patch("app.core.storage.preset_store.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_SETTINGS_PATH", preset_root / "settings.local.json", create=True),
                TestClient(app) as client,
            ):
                create_response = client.post("/api/presets", json=_input_preset_payload())

                self.assertEqual(create_response.status_code, 400)
                self.assertEqual(create_response.json()["detail"], "Only LLM nodes can be saved as presets.")
                self.assertEqual(client.get("/api/presets?include_disabled=true").json(), [])

    def test_presets_are_listed_from_official_and_user_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            preset_root = Path(temp_dir) / "node_preset"
            official_preset_dir = preset_root / "official"
            user_preset_dir = preset_root / "user"
            official_agent_dir = official_preset_dir / "official_writer"
            user_agent_dir = user_preset_dir / "agent_writer"
            official_agent_dir.mkdir(parents=True)
            user_agent_dir.mkdir(parents=True)
            official_payload = _preset_payload("official_writer")
            user_payload = _preset_payload("agent_writer")
            (official_agent_dir / "preset.json").write_text(
                json.dumps({**official_payload, "createdAt": "2026-05-10T00:00:00Z", "updatedAt": "2026-05-10T00:00:00Z"}),
                encoding="utf-8",
            )
            (user_agent_dir / "preset.json").write_text(
                json.dumps({**user_payload, "createdAt": "2026-05-10T00:00:01Z", "updatedAt": "2026-05-10T00:00:01Z"}),
                encoding="utf-8",
            )

            with (
                patch("app.core.storage.database.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_ROOT", preset_root, create=True),
                patch("app.core.storage.preset_store.OFFICIAL_PRESET_ROOT", official_preset_dir, create=True),
                patch("app.core.storage.preset_store.USER_PRESET_ROOT", user_preset_dir, create=True),
                patch("app.core.storage.preset_store.PRESET_DATA_DIR", user_preset_dir),
                patch("app.core.storage.preset_store.PRESET_SETTINGS_PATH", preset_root / "settings.local.json", create=True),
                TestClient(app) as client,
            ):
                response = client.get("/api/presets?include_disabled=true")

            self.assertEqual(response.status_code, 200)
            self.assertEqual([item["presetId"] for item in response.json()], ["agent_writer", "official_writer"])


if __name__ == "__main__":
    unittest.main()
