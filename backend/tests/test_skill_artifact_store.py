from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.skill_artifact_store import (
    create_skill_artifact_context,
    read_skill_artifact_text,
)


class SkillArtifactStoreTests(unittest.TestCase):
    def test_create_skill_artifact_context_builds_whitelisted_invocation_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "skill_artifacts"
            with patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", root):
                context = create_skill_artifact_context(
                    run_id="run/1",
                    node_id="searcher node",
                    skill_key="web_search",
                    invocation_index=1,
                )

            artifact_dir = Path(str(context["artifact_dir"]))
            self.assertTrue(artifact_dir.is_dir())
            self.assertTrue(artifact_dir.is_relative_to(root))
            self.assertEqual(context["artifact_relative_dir"], "run_1/searcher_node/web_search/invocation_001")

    def test_read_skill_artifact_text_reads_inside_whitelist_and_rejects_escape_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "skill_artifacts"
            artifact_path = root / "run_1" / "searcher" / "doc_001.md"
            artifact_path.parent.mkdir(parents=True)
            artifact_path.write_text("# Article\n\nBody text", encoding="utf-8")
            outside_path = Path(temp_dir) / "outside.md"
            outside_path.write_text("secret", encoding="utf-8")

            with patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", root):
                payload = read_skill_artifact_text("run_1/searcher/doc_001.md")
                with self.assertRaisesRegex(ValueError, "inside the skill artifact folder"):
                    read_skill_artifact_text("../outside.md")

            self.assertEqual(payload["path"], "run_1/searcher/doc_001.md")
            self.assertEqual(payload["name"], "doc_001.md")
            self.assertEqual(payload["content"], "# Article\n\nBody text")
            self.assertEqual(payload["content_type"], "text/markdown")


if __name__ == "__main__":
    unittest.main()
