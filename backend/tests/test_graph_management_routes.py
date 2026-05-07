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


def _agent_graph_payload(graph_id: str | None = None, name: str = "Agent Flow") -> dict[str, object]:
    return {
        "graph_id": graph_id,
        "name": name,
        "state_schema": {
            "answer": {"name": "Answer", "description": "", "type": "markdown", "value": "", "color": "#2563eb"},
            "draft": {"name": "Draft", "description": "", "type": "markdown", "value": "", "color": "#10b981"},
        },
        "nodes": {
            "agent": {
                "kind": "agent",
                "name": "Agent",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}, "collapsed": True, "size": {"width": 420, "height": 320}},
                "reads": [],
                "writes": [{"state": "answer", "mode": "replace"}],
                "config": {
                    "skillKey": "web_search",
                    "skillBindings": [{"skillKey": "web_search", "outputMapping": {"result": "answer"}}],
                    "suspendedFreeWrites": [{"state": "draft", "mode": "append"}],
                    "skillInstructionBlocks": {
                        "web_search": {
                            "skillKey": "web_search",
                            "title": "搜索说明",
                            "content": "只搜索公开网页。",
                            "source": "node.override",
                        }
                    },
                    "taskInstruction": "Search and summarize.",
                    "modelSource": "override",
                    "model": "openai/gpt-5.5",
                    "thinkingMode": "xhigh",
                    "temperature": 0.8,
                },
            }
        },
        "edges": [],
        "conditional_edges": [],
        "metadata": {"description": "Runtime config preservation"},
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
                revision_response = client.get("/api/graphs/graph_managed/revisions")
                self.assertEqual(revision_response.status_code, 200)
                revisions = revision_response.json()
                self.assertEqual(len(revisions), 4)
                self.assertIsNone(revisions[0]["next_graph"])
                self.assertEqual(revisions[0]["reason"], "Delete saved graph.")

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

    def test_saving_graphs_resolves_duplicate_names_with_numbered_suffixes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                first_response = client.post("/api/graphs/save", json=_graph_payload("graph_first", "Managed Flow"))
                second_response = client.post("/api/graphs/save", json=_graph_payload(None, "Managed Flow"))
                third_response = client.post("/api/graphs/save", json=_graph_payload(None, "Managed Flow"))
                update_response = client.post("/api/graphs/save", json=_graph_payload("graph_first", "Managed Flow"))

                self.assertEqual(first_response.status_code, 200)
                self.assertEqual(second_response.status_code, 200)
                self.assertEqual(third_response.status_code, 200)
                self.assertEqual(update_response.status_code, 200)

                first_graph = client.get("/api/graphs/graph_first").json()
                second_graph = client.get(f"/api/graphs/{second_response.json()['graph_id']}").json()
                third_graph = client.get(f"/api/graphs/{third_response.json()['graph_id']}").json()

                self.assertEqual(first_graph["name"], "Managed Flow")
                self.assertEqual(second_graph["name"], "Managed Flow_1")
                self.assertEqual(third_graph["name"], "Managed Flow_2")
                self.assertEqual(client.get("/api/graphs/graph_first").json()["name"], "Managed Flow")

    def test_saving_graph_preserves_agent_config_ui_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                payload = _agent_graph_payload("graph_runtime_config")
                save_response = client.post("/api/graphs/save", json=payload)

                self.assertEqual(save_response.status_code, 200)
                graph_response = client.get("/api/graphs/graph_runtime_config")
                self.assertEqual(graph_response.status_code, 200)
                graph = graph_response.json()
                self.assertEqual(graph["metadata"]["description"], "Runtime config preservation")
                self.assertEqual(graph["nodes"]["agent"]["ui"]["collapsed"], True)
                self.assertEqual(graph["nodes"]["agent"]["ui"]["size"], {"width": 420.0, "height": 320.0})
                self.assertEqual(graph["nodes"]["agent"]["config"], payload["nodes"]["agent"]["config"])

    def test_saving_graph_records_revision_with_diff_and_audit_context(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                create_payload = {
                    **_graph_payload("graph_revision_target", "Initial Graph"),
                    "revision_context": {
                        "actor": "buddy",
                        "run_id": "run_graph_edit",
                        "node_id": "execute_page_operation",
                        "reason": "Create graph through virtual graph edit playback.",
                    },
                }
                update_payload = {
                    **_graph_payload("graph_revision_target", "Updated Graph"),
                    "metadata": {"description": "Updated by playback."},
                    "revision_context": {
                        "actor": "buddy",
                        "run_id": "run_graph_edit",
                        "node_id": "execute_page_operation",
                        "reason": "Rename graph through virtual graph edit playback.",
                    },
                }

                create_response = client.post("/api/graphs/save", json=create_payload)
                update_response = client.post("/api/graphs/save", json=update_payload)
                self.assertEqual(create_response.status_code, 200)
                self.assertTrue(create_response.json()["revision_id"].startswith("grev_"))
                self.assertEqual(update_response.status_code, 200)
                self.assertTrue(update_response.json()["revision_id"].startswith("grev_"))

                revisions_response = client.get("/api/graphs/graph_revision_target/revisions")

            self.assertEqual(revisions_response.status_code, 200)
            revisions = revisions_response.json()
            self.assertEqual(len(revisions), 2)
            latest = revisions[0]
            self.assertEqual(update_response.json()["revision_id"], latest["revision_id"])
            self.assertEqual(create_response.json()["revision_id"], revisions[1]["revision_id"])
            self.assertTrue(latest["revision_id"].startswith("grev_"))
            self.assertEqual(latest["graph_id"], "graph_revision_target")
            self.assertEqual(latest["actor"], "buddy")
            self.assertEqual(latest["run_id"], "run_graph_edit")
            self.assertEqual(latest["node_id"], "execute_page_operation")
            self.assertEqual(latest["reason"], "Rename graph through virtual graph edit playback.")
            self.assertEqual(latest["previous_graph"]["name"], "Initial Graph")
            self.assertEqual(latest["next_graph"]["name"], "Updated Graph")
            self.assertEqual(latest["validation"]["valid"], True)
            self.assertIn({"op": "replace", "path": "/name", "previous": "Initial Graph", "next": "Updated Graph"}, latest["diff"])

    def test_graph_revision_restore_reverts_to_previous_graph_and_records_restore_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            graph_dir = Path(temp_dir) / "graphs"
            with (
                patch("app.core.storage.database.GRAPH_DATA_DIR", graph_dir),
                patch("app.core.storage.graph_store.GRAPH_DATA_DIR", graph_dir),
                TestClient(app) as client,
            ):
                self.assertEqual(client.post("/api/graphs/save", json=_graph_payload("graph_restore_target", "Before")).status_code, 200)
                self.assertEqual(client.post("/api/graphs/save", json=_graph_payload("graph_restore_target", "After")).status_code, 200)
                revision_to_restore = client.get("/api/graphs/graph_restore_target/revisions").json()[0]["revision_id"]

                restore_response = client.post(f"/api/graphs/graph_restore_target/revisions/{revision_to_restore}/restore")
                graph_response = client.get("/api/graphs/graph_restore_target")
                revisions_response = client.get("/api/graphs/graph_restore_target/revisions")

            self.assertEqual(restore_response.status_code, 200)
            self.assertEqual(restore_response.json()["restored"], True)
            self.assertEqual(restore_response.json()["graph"]["name"], "Before")
            self.assertTrue(restore_response.json()["revision"]["revision_id"].startswith("grev_"))
            self.assertEqual(restore_response.json()["restored_revision_id"], restore_response.json()["revision"]["revision_id"])
            self.assertNotEqual(restore_response.json()["restored_revision_id"], revision_to_restore)
            self.assertEqual(graph_response.status_code, 200)
            self.assertEqual(graph_response.json()["name"], "Before")
            revisions = revisions_response.json()
            self.assertEqual(len(revisions), 3)
            self.assertEqual(revisions[0]["reason"], f"Restore graph revision {revision_to_restore}.")
            self.assertEqual(revisions[0]["previous_graph"]["name"], "After")
            self.assertEqual(revisions[0]["next_graph"]["name"], "Before")


if __name__ == "__main__":
    unittest.main()
