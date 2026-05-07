from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def _graph_payload(graph_id: str | None = None, name: str = "Managed Flow") -> dict[str, object]:
    return {
        "graph_id": graph_id,
        "name": name,
        "state_schema": {},
        "nodes": {},
        "edges": [],
        "conditional_edges": [],
        "metadata": {},
    }


class GraphManagementRouteTests(unittest.TestCase):
    def test_graphs_can_be_disabled_enabled_listed_and_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                save_response = client.post("/api/graphs/save", json=_graph_payload("graph_managed"))

                self.assertEqual(save_response.status_code, 200)
                self.assertEqual(save_response.json()["graph_id"], "graph_managed")

                listed_response = client.get("/api/graphs")
                self.assertEqual(listed_response.status_code, 200)
                listed_payload = listed_response.json()
                self.assertEqual(len(listed_payload), 1)
                self.assertEqual(listed_payload[0]["status"], "active")

                disabled_response = client.post("/api/graphs/graph_managed/disable")
                self.assertEqual(disabled_response.status_code, 200)
                self.assertEqual(disabled_response.json()["status"], "disabled")

                active_only_response = client.get("/api/graphs")
                self.assertEqual(active_only_response.status_code, 200)
                self.assertEqual(active_only_response.json(), [])

                management_response = client.get("/api/graphs?include_disabled=true")
                self.assertEqual(management_response.status_code, 200)
                self.assertEqual(len(management_response.json()), 1)
                self.assertEqual(management_response.json()[0]["status"], "disabled")

                enabled_response = client.post("/api/graphs/graph_managed/enable")
                self.assertEqual(enabled_response.status_code, 200)
                self.assertEqual(enabled_response.json()["status"], "active")

                delete_response = client.delete("/api/graphs/graph_managed")
                self.assertEqual(delete_response.status_code, 200)
                self.assertEqual(delete_response.json(), {"graph_id": "graph_managed", "status": "deleted"})

                missing_response = client.get("/api/graphs/graph_managed")
                self.assertEqual(missing_response.status_code, 404)

    def test_saving_existing_graph_preserves_management_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                self.assertEqual(client.post("/api/graphs/save", json=_graph_payload("graph_managed")).status_code, 200)
                self.assertEqual(client.post("/api/graphs/graph_managed/disable").status_code, 200)

                save_response = client.post("/api/graphs/save", json=_graph_payload("graph_managed", "Renamed Flow"))

                self.assertEqual(save_response.status_code, 200)
                graph_response = client.get("/api/graphs/graph_managed")
                self.assertEqual(graph_response.status_code, 200)
                self.assertEqual(graph_response.json()["name"], "Renamed Flow")
                self.assertEqual(graph_response.json()["status"], "disabled")


if __name__ == "__main__":
    unittest.main()
