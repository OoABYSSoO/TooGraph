from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.core.storage.local_workspace_store import create_or_open_local_workspace, list_local_workspaces
from app.main import app


class LocalWorkspaceTests(unittest.TestCase):
    def test_local_workspaces_start_empty_then_create_current_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with self._patched_database(Path(temp_dir)):
                database.initialize_storage()
                workspace_root = Path(temp_dir) / "Workspace"
                workspace_root.mkdir()

                initial = list_local_workspaces()
                created = create_or_open_local_workspace(str(workspace_root))
                listed = list_local_workspaces()

        self.assertEqual(initial["workspaces"], [])
        self.assertEqual(initial["current_workspace_id"], "")
        self.assertEqual(created["name"], "Workspace")
        self.assertEqual(created["root_path"], str(workspace_root))
        self.assertEqual(listed["current_workspace_id"], created["workspace_id"])
        self.assertEqual([workspace["workspace_id"] for workspace in listed["workspaces"]], [created["workspace_id"]])

    def test_local_workspace_routes_bind_entries_to_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_dir = Path(temp_dir) / "db"
            db_dir.mkdir()
            workspace_root = Path(temp_dir) / "Project"
            nested = workspace_root / "notes"
            nested.mkdir(parents=True)
            (nested / "README.md").write_text("hello", encoding="utf-8")
            outside = Path(temp_dir) / "Outside"
            outside.mkdir()

            with self._patched_database(db_dir):
                database.initialize_storage()
                client = TestClient(app)

                create_response = client.post(
                    "/api/local-input-sources/workspaces",
                    json={"root_path": str(workspace_root)},
                )
                workspace_id = create_response.json()["workspace_id"]
                list_response = client.get("/api/local-input-sources/workspaces")
                entries_response = client.get(
                    "/api/local-input-sources/entries",
                    params={"path": str(workspace_root), "workspace_id": workspace_id},
                )
                outside_response = client.get(
                    "/api/local-input-sources/entries",
                    params={"path": str(outside), "workspace_id": workspace_id},
                )

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["current_workspace_id"], workspace_id)
        self.assertEqual(entries_response.status_code, 200)
        self.assertEqual([entry["name"] for entry in entries_response.json()["entries"]], ["notes"])
        self.assertEqual(outside_response.status_code, 400)

    def test_picker_entries_can_browse_a_local_directory_without_creating_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "Candidate").mkdir()
            (root / "note.txt").write_text("not a workspace root", encoding="utf-8")

            response = TestClient(app).get(
                "/api/local-input-sources/picker/entries",
                params={"path": str(root)},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["kind"], "local_directory_entries")
        self.assertIn("Candidate", [entry["name"] for entry in payload["entries"]])

    def _patched_database(self, temp_dir: Path):
        return patch.multiple(
            database,
            DATA_DIR=temp_dir,
            DB_PATH=temp_dir / "toograph.db",
            _SCHEMA_INITIALIZED_DB_PATH=None,
        )


if __name__ == "__main__":
    unittest.main()
