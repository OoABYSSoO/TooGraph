from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import configure_frontend_static


class FrontendStaticRoutesTest(unittest.TestCase):
    def test_serves_built_frontend_without_intercepting_api_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dist_dir = Path(temp_dir)
            assets_dir = dist_dir / "assets"
            assets_dir.mkdir()
            (dist_dir / "index.html").write_text("<div id=\"app\"></div>", encoding="utf-8")
            (dist_dir / "logo.svg").write_text("<svg></svg>", encoding="utf-8")
            (assets_dir / "app.js").write_text("console.log('graphiteui');", encoding="utf-8")

            app = FastAPI()

            @app.get("/api/ping")
            def ping() -> dict[str, bool]:
                return {"ok": True}

            self.assertTrue(configure_frontend_static(app, dist_dir))

            with TestClient(app) as client:
                self.assertEqual(client.get("/").text, "<div id=\"app\"></div>")
                self.assertEqual(client.get("/workspace/graph-1").text, "<div id=\"app\"></div>")
                self.assertEqual(client.get("/logo.svg").text, "<svg></svg>")
                self.assertEqual(client.get("/assets/app.js").text, "console.log('graphiteui');")
                self.assertEqual(client.get("/api/ping").json(), {"ok": True})

                missing_api = client.get("/api/missing")
                self.assertEqual(missing_api.status_code, 404)
                self.assertNotEqual(missing_api.text, "<div id=\"app\"></div>")

                missing_api_post = client.post("/api/missing")
                self.assertEqual(missing_api_post.status_code, 404)
                self.assertNotEqual(missing_api_post.text, "<div id=\"app\"></div>")


if __name__ == "__main__":
    unittest.main()
