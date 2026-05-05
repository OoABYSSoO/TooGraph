from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import threading
import unittest
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility, SkillSideEffect
from app.skills.definitions import _parse_native_skill_manifest
from app.skills.registry import get_skill_registry


GAME_AD_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "game_ad_research_collector" / "run.py"
GAME_AD_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "skill" / "game_ad_research_collector" / "skill.json"


def _load_game_ad_module():
    spec = importlib.util.spec_from_file_location("graphiteui_game_ad_research_collector_skill_test", GAME_AD_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load game_ad_research_collector skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GameAdResearchCollectorSkillTests(unittest.TestCase):
    def test_manifest_is_agent_ready_and_declares_network_file_outputs(self) -> None:
        definition = _parse_native_skill_manifest(GAME_AD_MANIFEST_PATH, source_scope="installed").definition

        self.assertEqual(definition.skill_key, "game_ad_research_collector")
        self.assertNotIn("targets", definition.model_dump(by_alias=True))
        self.assertTrue(definition.run_policies.default.discoverable)
        self.assertFalse(definition.run_policies.default.auto_selectable)
        self.assertTrue(definition.run_policies.origins["companion"].requires_approval)
        self.assertEqual(definition.runtime.type, "python")
        self.assertEqual(definition.runtime.entrypoint, "run.py")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertIn(SkillSideEffect.NETWORK, definition.side_effects)
        self.assertIn(SkillSideEffect.FILE_WRITE, definition.side_effects)

    def test_fetches_rss_and_writes_source_document_artifacts_without_ads(self) -> None:
        collector = _load_game_ad_module()
        server = _start_research_server()
        try:
            feed_url = f"http://127.0.0.1:{server.server_port}/feed.xml"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "run_1" / "agent" / "game_ad_research_collector" / "invocation_001"
                with patch.dict(
                    os.environ,
                    {
                        "GRAPHITE_SKILL_ARTIFACT_DIR": str(artifact_dir),
                        "GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR": "run_1/agent/game_ad_research_collector/invocation_001",
                    },
                    clear=True,
                ):
                    result = collector.game_ad_research_collector_skill(
                        genre="SLG",
                        feed_urls=feed_url,
                        enable_ads="false",
                        enable_rss="true",
                        max_news_items="1",
                    )

                self.assertEqual(result["status"], "succeeded")
                self.assertEqual(result["genre"], "SLG")
                self.assertEqual(result["news_count"], 1)
                self.assertEqual(result["ad_count"], 0)
                self.assertEqual(result["downloaded_count"], 0)
                self.assertEqual(len(result["rss_items"]), 1)
                self.assertEqual(len(result["source_documents"]), 1)
                self.assertTrue((artifact_dir / "rss_raw.json").is_file())
                self.assertTrue((artifact_dir / "source_documents.json").is_file())
                source_document = result["source_documents"][0]
                self.assertEqual(source_document["content_type"], "text/markdown")
                self.assertTrue(source_document["local_path"].endswith("/001-demo-article.md"))
                self.assertTrue((artifact_dir / "001-demo-article.md").is_file())
        finally:
            server.shutdown()
            server.server_close()

    def test_downloads_ad_video_with_playwright_context_cookies(self) -> None:
        collector = _load_game_ad_module()
        server = _start_research_server()
        try:
            video_url = f"http://127.0.0.1:{server.server_port}/protected-video.mp4"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "run_1" / "agent" / "game_ad_research_collector" / "invocation_001"
                discovery_result = SimpleNamespace(
                    video_urls=[video_url],
                    cookies=[
                        {
                            "name": "session",
                            "value": "ok",
                            "domain": "127.0.0.1",
                            "path": "/",
                        }
                    ],
                    warning="",
                    user_agent="DemoBrowser/1.0",
                )
                with (
                    patch.dict(
                        os.environ,
                        {
                            "GRAPHITE_SKILL_ARTIFACT_DIR": str(artifact_dir),
                            "GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR": "run_1/agent/game_ad_research_collector/invocation_001",
                        },
                        clear=True,
                    ),
                    patch.object(collector, "_discover_public_ad_videos_with_playwright", return_value=discovery_result),
                ):
                    result = collector.game_ad_research_collector_skill(
                        genre="SLG",
                        enable_ads="true",
                        enable_rss="false",
                        use_playwright="true",
                        top_fetch_per_term="1",
                    )

                self.assertEqual(result["status"], "succeeded")
                self.assertEqual(result["downloaded_count"], 1)
                downloaded_file = result["downloaded_files"][0]
                self.assertEqual(downloaded_file["source"], "facebook_ad_library")
                self.assertEqual(downloaded_file["content_type"], "video/mp4")
                self.assertTrue(downloaded_file["local_path"].endswith("/videos/01-01-slg.mp4"))
                self.assertEqual((artifact_dir / "videos" / downloaded_file["filename"]).read_bytes(), b"fake-protected-video")
        finally:
            server.shutdown()
            server.server_close()

    def test_rejects_html_response_when_url_only_mentions_video_in_query(self) -> None:
        collector = _load_game_ad_module()
        server = _start_research_server()
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                destination = Path(temp_dir) / "fake.mp4"
                record = collector._download_video(
                    f"http://127.0.0.1:{server.server_port}/ads/library/?media_type=video",
                    destination=destination,
                    timeout_seconds=5.0,
                    artifact_relative_dir="run_1/agent/videos",
                )

                self.assertEqual(record["status"], "failed")
                self.assertIn("not a video", record["error"])
                self.assertFalse(destination.exists())
        finally:
            server.shutdown()
            server.server_close()

    def test_facebook_ad_library_url_matches_demo_search_shape(self) -> None:
        collector = _load_game_ad_module()

        url = collector._build_facebook_ad_library_url(
            "SLG",
            country="US",
            start_date=date(2026, 4, 27),
            end_date=date(2026, 5, 4),
        )

        self.assertIn("media_type=all", url)
        self.assertIn("sort_data%5Bdirection%5D=desc", url)
        self.assertIn("sort_data%5Bmode%5D=total_impressions", url)
        self.assertIn("q=SLG", url)

    def test_game_ad_research_collector_skill_is_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        self.assertIn("game_ad_research_collector", registry)


class _ResearchHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path.startswith("/feed.xml"):
            body = f"""<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0">
              <channel>
                <title>Game Market Feed</title>
                <item>
                  <title>Demo Article</title>
                  <link>http://127.0.0.1:{self.server.server_port}/article</link>
                  <description>Strategy game creative trend.</description>
                  <pubDate>Mon, 04 May 2026 10:00:00 GMT</pubDate>
                </item>
              </channel>
            </rss>
            """.encode("utf-8")
            self._send(200, "application/rss+xml; charset=utf-8", body)
            return
        if self.path.startswith("/article"):
            body = b"""
            <html>
              <head><title>Demo Article</title></head>
              <body>
                <article><h1>Demo Article</h1><p>SLG players respond to survival pressure and upgrade decisions.</p></article>
              </body>
            </html>
            """
            self._send(200, "text/html; charset=utf-8", body)
            return
        if self.path.startswith("/protected-video.mp4"):
            if "session=ok" not in self.headers.get("Cookie", ""):
                self._send(403, "text/plain", b"missing cookie")
                return
            self._send(200, "video/mp4", b"fake-protected-video")
            return
        if self.path.startswith("/ads/library/"):
            self._send(200, "text/html; charset=utf-8", b"<html>not video</html>")
            return
        self._send(404, "text/plain", b"not found")

    def _send(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def _start_research_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ResearchHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


if __name__ == "__main__":
    unittest.main()
