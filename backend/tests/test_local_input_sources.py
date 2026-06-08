from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.local_input_sources import (
    list_local_directory_entries,
    list_local_folder,
    read_local_input_text_for_prompt,
)
from app.main import app


class LocalInputSourcesTests(unittest.TestCase):
    def test_list_local_folder_returns_recursive_selectable_files_inside_read_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "buddy_home"
            nested = source / "notes"
            nested.mkdir(parents=True)
            (source / "SOUL.md").write_text("identity", encoding="utf-8")
            (nested / "MEMORY.md").write_text("memory", encoding="utf-8")
            (source / ".git").mkdir()
            (source / ".git" / "config").write_text("secret", encoding="utf-8")

            tree = list_local_folder(str(source), read_roots=[workspace])

        self.assertEqual(tree["kind"], "local_folder_tree")
        self.assertEqual(tree["root"], str(source))
        paths = {entry["path"]: entry for entry in tree["entries"]}
        self.assertIn("SOUL.md", paths)
        self.assertIn("notes", paths)
        self.assertIn("notes/MEMORY.md", paths)
        self.assertNotIn(".git/config", paths)
        self.assertEqual(paths["SOUL.md"]["type"], "file")
        self.assertEqual(paths["SOUL.md"]["size"], len("identity"))
        self.assertTrue(paths["SOUL.md"]["text_like"])

    def test_list_local_folder_allows_read_root_inside_dot_worktrees_parent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / ".worktrees" / "feature-branch"
            source = workspace / "buddy_home"
            source.mkdir(parents=True)
            (source / "AGENTS.md").write_text("buddy home", encoding="utf-8")

            tree = list_local_folder(str(source), read_roots=[workspace])

        self.assertEqual(tree["kind"], "local_folder_tree")
        self.assertEqual([entry["path"] for entry in tree["entries"]], ["AGENTS.md"])

    def test_read_local_input_text_for_prompt_reads_full_selected_file_without_size_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "context"
            source.mkdir()
            content = "line\n" * 5000
            (source / "large.md").write_bytes(content.encode("utf-8"))

            payload = read_local_input_text_for_prompt(str(source), "large.md", read_roots=[workspace])

        self.assertEqual(payload["name"], "large.md")
        self.assertEqual(payload["content"], content)
        self.assertFalse(payload["truncated"])

    def test_local_folder_route_uses_same_read_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "context"
            source.mkdir()
            (source / "README.md").write_text("hello", encoding="utf-8")

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                response = TestClient(app).get(
                    "/api/local-input-sources/folder",
                    params={"path": str(source)},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["kind"], "local_folder_tree")
        self.assertEqual([entry["path"] for entry in payload["entries"]], ["README.md"])

    def test_list_local_directory_entries_returns_only_current_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "policy"
            nested = source / "2025"
            nested.mkdir(parents=True)
            (source / "README.md").write_text("root", encoding="utf-8")
            (nested / "deep.md").write_text("nested", encoding="utf-8")

            listing = list_local_directory_entries(str(source), read_roots=[workspace])

        self.assertEqual(listing["kind"], "local_directory_entries")
        self.assertEqual(listing["path"], str(source))
        self.assertEqual(listing["parent"], str(workspace))
        self.assertGreaterEqual(len(listing["breadcrumbs"]), 2)
        self.assertEqual(listing["breadcrumbs"][0]["path"], str(workspace))
        self.assertEqual(listing["breadcrumbs"][-1]["path"], str(source))
        entries = {entry["name"]: entry for entry in listing["entries"]}
        self.assertEqual(set(entries), {"2025", "README.md"})
        self.assertEqual(entries["2025"]["kind"], "directory")
        self.assertEqual(entries["2025"]["path"], str(nested))
        self.assertEqual(entries["2025"]["relative_path"], "2025")
        self.assertEqual(entries["README.md"]["kind"], "file")
        self.assertNotIn("deep.md", entries)

    def test_local_directory_entries_route_uses_same_read_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "context"
            source.mkdir()
            (source / "README.md").write_text("hello", encoding="utf-8")

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                response = TestClient(app).get(
                    "/api/local-input-sources/entries",
                    params={"path": str(source)},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["kind"], "local_directory_entries")
        self.assertEqual([entry["name"] for entry in payload["entries"]], ["README.md"])


if __name__ == "__main__":
    unittest.main()
