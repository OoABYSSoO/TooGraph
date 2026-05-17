from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import json

from fastapi.testclient import TestClient

from app.main import app


def _template_payload(template_id: str, label: str) -> dict[str, object]:
    return {
        "template_id": template_id,
        "label": label,
        "description": f"{label} description.",
        "default_graph_name": label,
        "state_schema": {},
        "nodes": {},
        "edges": [],
        "conditional_edges": [],
        "metadata": {},
    }


def _graph_payload(name: str = "Reusable Flow") -> dict[str, object]:
    return {
        "graph_id": None,
        "name": name,
        "state_schema": {},
        "nodes": {},
        "edges": [],
        "conditional_edges": [],
        "metadata": {},
    }


def _agent_graph_payload(name: str = "Reusable Agent Flow") -> dict[str, object]:
    return {
        "graph_id": None,
        "name": name,
        "state_schema": {
            "answer": {"name": "Answer", "description": "", "type": "markdown", "value": "", "color": "#2563eb"},
        },
        "nodes": {
            "agent": {
                "kind": "agent",
                "name": "Agent",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "answer", "mode": "replace"}],
                "config": {
                    "skillKey": "",
                    "skillBindings": [],
                    "suspendedFreeWrites": [],
                    "skillInstructionBlocks": {},
                    "taskInstruction": "Respond.",
                    "modelSource": "global",
                    "model": "",
                    "thinkingMode": "xhigh",
                    "temperature": 0.2,
                },
            }
        },
        "edges": [],
        "conditional_edges": [],
        "metadata": {"description": "Agent template config preservation"},
    }


class TemplateRouteTests(unittest.TestCase):
    def test_templates_are_listed_from_official_and_user_template_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()
            user_dir.mkdir()
            official_template_dir = official_dir / "advanced_web_research_loop"
            user_template_dir = user_dir / "custom_research"
            official_template_dir.mkdir()
            user_template_dir.mkdir()
            (official_template_dir / "template.json").write_text(
                json.dumps(_template_payload("advanced_web_research_loop", "Advanced Web Research")),
                encoding="utf-8",
            )
            (user_template_dir / "template.json").write_text(
                json.dumps(_template_payload("custom_research", "Custom Research")),
                encoding="utf-8",
            )

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                response = client.get("/api/templates")

            self.assertEqual(response.status_code, 200)
            templates = response.json()
            self.assertEqual([template["template_id"] for template in templates], ["advanced_web_research_loop", "custom_research"])
            self.assertEqual([template["source"] for template in templates], ["official", "user"])
            self.assertEqual([template["capabilityDiscoverable"] for template in templates], [True, True])

    def test_save_template_writes_user_template_under_graph_template_user_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                save_response = client.post("/api/templates/save", json=_graph_payload())
                list_response = client.get("/api/templates")

            self.assertEqual(save_response.status_code, 200)
            saved_payload = save_response.json()
            self.assertTrue(saved_payload["saved"])
            self.assertEqual(saved_payload["template"]["source"], "user")
            self.assertEqual(saved_payload["template"]["label"], "Reusable Flow")
            self.assertEqual(saved_payload["template"]["default_graph_name"], "Reusable Flow")
            saved_path = user_dir / saved_payload["template_id"] / "template.json"
            self.assertTrue(saved_path.exists())
            self.assertNotIn("status", json.loads(saved_path.read_text(encoding="utf-8")))
            settings_payload = json.loads((root / "settings.json").read_text(encoding="utf-8"))
            self.assertTrue(settings_payload["entries"][saved_payload["template_id"]]["enabled"])
            self.assertTrue(settings_payload["entries"][saved_payload["template_id"]]["capabilityDiscoverable"])
            self.assertEqual(list_response.json(), [saved_payload["template"]])

    def test_save_template_resolves_duplicate_names_with_numbered_suffixes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()
            official_template_dir = official_dir / "official_reusable"
            official_template_dir.mkdir()
            (official_template_dir / "template.json").write_text(
                json.dumps(_template_payload("official_reusable", "Reusable Flow")),
                encoding="utf-8",
            )

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                first_response = client.post("/api/templates/save", json=_graph_payload("Reusable Flow"))
                second_response = client.post("/api/templates/save", json=_graph_payload("Reusable Flow"))

            self.assertEqual(first_response.status_code, 200)
            self.assertEqual(second_response.status_code, 200)
            self.assertEqual(first_response.json()["template"]["label"], "Reusable Flow_1")
            self.assertEqual(first_response.json()["template"]["default_graph_name"], "Reusable Flow_1")
            self.assertEqual(second_response.json()["template"]["label"], "Reusable Flow_2")
            self.assertEqual(second_response.json()["template"]["default_graph_name"], "Reusable Flow_2")

    def test_save_template_preserves_agent_config_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                payload = _agent_graph_payload()
                save_response = client.post("/api/templates/save", json=payload)

            self.assertEqual(save_response.status_code, 200)
            saved_template = save_response.json()["template"]
            self.assertEqual(saved_template["description"], "Agent template config preservation")
            self.assertEqual(saved_template["nodes"]["agent"]["config"], payload["nodes"]["agent"]["config"])

    def test_user_templates_can_be_disabled_enabled_listed_and_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                save_response = client.post("/api/templates/save", json=_graph_payload("Managed Template"))
                self.assertEqual(save_response.status_code, 200)
                template_id = save_response.json()["template_id"]

                listed_response = client.get("/api/templates")
                self.assertEqual(listed_response.status_code, 200)
                self.assertEqual(listed_response.json()[0]["status"], "active")

                disabled_response = client.post(f"/api/templates/{template_id}/disable")
                self.assertEqual(disabled_response.status_code, 200)
                self.assertEqual(disabled_response.json()["status"], "disabled")
                self.assertFalse(disabled_response.json()["capabilityDiscoverable"])
                saved_path = user_dir / template_id / "template.json"
                self.assertNotIn("status", json.loads(saved_path.read_text(encoding="utf-8")))
                settings_payload = json.loads((root / "settings.json").read_text(encoding="utf-8"))
                self.assertFalse(settings_payload["entries"][template_id]["enabled"])
                self.assertFalse(settings_payload["entries"][template_id]["capabilityDiscoverable"])

                active_only_response = client.get("/api/templates")
                self.assertEqual(active_only_response.status_code, 200)
                self.assertEqual(active_only_response.json(), [])

                management_response = client.get("/api/templates?include_disabled=true")
                self.assertEqual(management_response.status_code, 200)
                self.assertEqual(len(management_response.json()), 1)
                self.assertEqual(management_response.json()[0]["status"], "disabled")

                enabled_response = client.post(f"/api/templates/{template_id}/enable")
                self.assertEqual(enabled_response.status_code, 200)
                self.assertEqual(enabled_response.json()["status"], "active")
                self.assertFalse(enabled_response.json()["capabilityDiscoverable"])

                delete_response = client.delete(f"/api/templates/{template_id}")
                self.assertEqual(delete_response.status_code, 200)
                self.assertEqual(delete_response.json(), {"template_id": template_id, "status": "deleted"})

                missing_response = client.get(f"/api/templates/{template_id}")
                self.assertEqual(missing_response.status_code, 404)

    def test_official_templates_are_read_only_in_management_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()
            user_dir.mkdir()
            official_template_dir = official_dir / "official_loop"
            official_template_dir.mkdir()
            (official_template_dir / "template.json").write_text(
                json.dumps(_template_payload("official_loop", "Official Loop")),
                encoding="utf-8",
            )

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                disable_response = client.post("/api/templates/official_loop/disable")
                delete_response = client.delete("/api/templates/official_loop")
                listed_response = client.get("/api/templates?include_disabled=true")

            self.assertEqual(disable_response.status_code, 403)
            self.assertEqual(delete_response.status_code, 403)
            self.assertEqual(listed_response.status_code, 200)
            self.assertEqual(listed_response.json()[0]["source"], "official")
            self.assertEqual(listed_response.json()[0]["status"], "active")

    def test_template_capability_discovery_can_be_toggled_without_editing_template_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()
            user_dir.mkdir()
            official_template_dir = official_dir / "official_loop"
            user_template_dir = user_dir / "custom_loop"
            official_template_dir.mkdir()
            user_template_dir.mkdir()
            (official_template_dir / "template.json").write_text(
                json.dumps(_template_payload("official_loop", "Official Loop")),
                encoding="utf-8",
            )
            (user_template_dir / "template.json").write_text(
                json.dumps(_template_payload("custom_loop", "Custom Loop")),
                encoding="utf-8",
            )

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                TestClient(app) as client,
            ):
                official_response = client.post(
                    "/api/templates/official_loop/capability-discoverable",
                    json={"capabilityDiscoverable": False},
                )
                user_response = client.post(
                    "/api/templates/custom_loop/capability-discoverable",
                    json={"capabilityDiscoverable": False},
                )
                list_response = client.get("/api/templates?include_disabled=true")

            self.assertEqual(official_response.status_code, 200)
            self.assertEqual(user_response.status_code, 200)
            self.assertFalse(official_response.json()["capabilityDiscoverable"])
            self.assertFalse(user_response.json()["capabilityDiscoverable"])
            self.assertNotIn("capabilityDiscoverable", json.loads((official_template_dir / "template.json").read_text(encoding="utf-8")))
            settings_payload = json.loads((root / "settings.json").read_text(encoding="utf-8"))
            self.assertFalse(settings_payload["entries"]["official_loop"]["capabilityDiscoverable"])
            self.assertFalse(settings_payload["entries"]["custom_loop"]["capabilityDiscoverable"])
            self.assertEqual(
                {template["template_id"]: template["capabilityDiscoverable"] for template in list_response.json()},
                {"official_loop": False, "custom_loop": False},
            )


if __name__ == "__main__":
    unittest.main()
