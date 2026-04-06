from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.local_input_sources import list_local_folder, read_local_input_text_for_prompt
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

    def test_read_local_input_text_for_prompt_reads_full_selected_file_without_size_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            source = workspace / "context"
            source.mkdir()
            content = "line\n" * 5000
            (source / "large.md").write_text(content, encoding="utf-8")

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

            with patch.dict(os.environ, {"GRAPHITEUI_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                response = TestClient(app).get(
                    "/api/local-input-sources/folder",
                    params={"path": str(source)},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["kind"], "local_folder_tree")
        self.assertEqual([entry["path"] for entry in payload["entries"]], ["README.md"])


if __name__ == "__main__":
    unittest.main()
