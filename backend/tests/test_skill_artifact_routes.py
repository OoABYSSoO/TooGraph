from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class SkillArtifactRouteTests(unittest.TestCase):
    def test_skill_artifact_content_endpoint_reads_only_whitelisted_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "skill_artifacts"
            artifact_path = root / "run_1" / "searcher" / "doc_001.md"
            artifact_path.parent.mkdir(parents=True)
            artifact_path.write_text("# Saved Page\n\nVisible content.", encoding="utf-8")

            with (
                patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", root),
                TestClient(app) as client,
            ):
                response = client.get("/api/skill-artifacts/content", params={"path": "run_1/searcher/doc_001.md"})
                blocked = client.get("/api/skill-artifacts/content", params={"path": "../outside.md"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], "# Saved Page\n\nVisible content.")
        self.assertEqual(blocked.status_code, 400)


if __name__ == "__main__":
    unittest.main()
