from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
            preset_dir = Path(temp_dir) / "presets"
            with (
                patch("app.core.storage.database.PRESET_DATA_DIR", preset_dir),
                patch("app.core.storage.preset_store.PRESET_DATA_DIR", preset_dir),
                TestClient(app) as client,
            ):
                create_response = client.post("/api/presets", json=_preset_payload())

                self.assertEqual(create_response.status_code, 200)
                self.assertEqual(create_response.json()["presetId"], "agent_writer")

                listed_response = client.get("/api/presets")
                self.assertEqual(listed_response.status_code, 200)
                listed_payload = listed_response.json()
                self.assertEqual(len(listed_payload), 1)
                self.assertEqual(listed_payload[0]["status"], "active")

                disabled_response = client.post("/api/presets/agent_writer/disable")
                self.assertEqual(disabled_response.status_code, 200)
                self.assertEqual(disabled_response.json()["status"], "disabled")

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
            preset_dir = Path(temp_dir) / "presets"
            with (
                patch("app.core.storage.database.PRESET_DATA_DIR", preset_dir),
                patch("app.core.storage.preset_store.PRESET_DATA_DIR", preset_dir),
                TestClient(app) as client,
            ):
                create_response = client.post("/api/presets", json=_input_preset_payload())

                self.assertEqual(create_response.status_code, 400)
                self.assertEqual(create_response.json()["detail"], "Only LLM nodes can be saved as presets.")
                self.assertEqual(client.get("/api/presets?include_disabled=true").json(), [])


if __name__ == "__main__":
    unittest.main()
