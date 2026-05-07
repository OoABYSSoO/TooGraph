from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


class TemplateRouteTests(unittest.TestCase):
    def test_templates_are_listed_from_official_and_user_template_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()
            user_dir.mkdir()
            (official_dir / "advanced_web_research_loop.json").write_text(
                __import__("json").dumps(_template_payload("advanced_web_research_loop", "Advanced Web Research")),
                encoding="utf-8",
            )
            (user_dir / "custom_research.json").write_text(
                __import__("json").dumps(_template_payload("custom_research", "Custom Research")),
                encoding="utf-8",
            )

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                TestClient(app) as client,
            ):
                response = client.get("/api/templates")

            self.assertEqual(response.status_code, 200)
            templates = response.json()
            self.assertEqual([template["template_id"] for template in templates], ["advanced_web_research_loop", "custom_research"])
            self.assertEqual([template["source"] for template in templates], ["official", "user"])

    def test_save_template_writes_user_template_under_backend_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official_dir = root / "official"
            user_dir = root / "user"
            official_dir.mkdir()

            with (
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
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
            saved_path = user_dir / f"{saved_payload['template_id']}.json"
            self.assertTrue(saved_path.exists())
            self.assertEqual(list_response.json(), [saved_payload["template"]])


if __name__ == "__main__":
    unittest.main()
