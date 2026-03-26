from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility, SkillSideEffect
from app.skills.definitions import _parse_native_skill_manifest
from app.skills.registry import get_skill_registry


WEB_MEDIA_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "web_media_downloader" / "run.py"
WEB_MEDIA_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "skill" / "web_media_downloader" / "skill.json"


def _load_web_media_module():
    spec = importlib.util.spec_from_file_location("graphiteui_web_media_downloader_skill_test", WEB_MEDIA_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load web_media_downloader skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WebMediaDownloaderSkillTests(unittest.TestCase):
    def test_manifest_is_agent_ready_and_declares_network_file_outputs(self) -> None:
        definition = _parse_native_skill_manifest(WEB_MEDIA_MANIFEST_PATH, source_scope="installed").definition

        self.assertEqual(definition.skill_key, "web_media_downloader")
        self.assertNotIn("targets", definition.model_dump(by_alias=True))
        self.assertTrue(definition.run_policies.default.discoverable)
        self.assertFalse(definition.run_policies.default.auto_selectable)
        self.assertFalse(definition.run_policies.origins["companion"].auto_selectable)
        self.assertTrue(definition.run_policies.origins["companion"].requires_approval)
        self.assertEqual(definition.runtime.type, "python")
        self.assertEqual(definition.runtime.entrypoint, "run.py")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertIn(SkillSideEffect.NETWORK, definition.side_effects)
        self.assertIn(SkillSideEffect.FILE_WRITE, definition.side_effects)

    def test_static_page_downloads_authorized_media_to_skill_artifacts(self) -> None:
        web_media = _load_web_media_module()
        server = _start_media_server()
        try:
            page_url = f"http://127.0.0.1:{server.server_port}/gallery"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "run_1" / "agent" / "web_media_downloader" / "invocation_001"
                with patch.dict(
                    os.environ,
                    {
                        "GRAPHITE_SKILL_ARTIFACT_DIR": str(artifact_dir),
                        "GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR": "run_1/agent/web_media_downloader/invocation_001",
                    },
                    clear=True,
                ):
                    result = web_media.web_media_downloader_skill(
                        urls=page_url,
                        media_types="image,video",
                        max_items="2",
                    )

                self.assertEqual(result["status"], "succeeded")
                self.assertEqual(result["downloaded_count"], 2)
                self.assertEqual(result["failed_count"], 0)
                self.assertEqual(len(result["downloaded_files"]), 2)
                self.assertTrue((artifact_dir / "001-photo.jpg").is_file())
                self.assertTrue((artifact_dir / "002-clip.mp4").is_file())
                self.assertEqual(
                    [item["local_path"] for item in result["downloaded_files"]],
                    [
                        "run_1/agent/web_media_downloader/invocation_001/001-photo.jpg",
                        "run_1/agent/web_media_downloader/invocation_001/002-clip.mp4",
                    ],
                )
                self.assertEqual(
                    result["paths_file"]["local_path"],
                    "run_1/agent/web_media_downloader/invocation_001/downloaded_paths.txt",
                )
                paths_file = artifact_dir / "downloaded_paths.txt"
                self.assertIn("001-photo.jpg", paths_file.read_text(encoding="utf-8"))
        finally:
            server.shutdown()
            server.server_close()

    def test_discover_only_returns_media_without_writing_downloads(self) -> None:
        web_media = _load_web_media_module()
        server = _start_media_server()
        try:
            page_url = f"http://127.0.0.1:{server.server_port}/gallery"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "artifacts"
                with patch.dict(
                    os.environ,
                    {
                        "GRAPHITE_SKILL_ARTIFACT_DIR": str(artifact_dir),
                        "GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR": "run_1/agent/web_media_downloader/invocation_001",
                    },
                    clear=True,
                ):
                    result = web_media.web_media_downloader_skill(urls=page_url, discover_only="true")

                self.assertEqual(result["status"], "succeeded")
                self.assertGreaterEqual(result["discovered_count"], 2)
                self.assertEqual(result["downloaded_count"], 0)
                self.assertFalse((artifact_dir / "001-photo.jpg").exists())
        finally:
            server.shutdown()
            server.server_close()

    def test_web_media_downloader_skill_is_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        self.assertIn("web_media_downloader", registry)

    def test_runtime_runner_invokes_skill_and_returns_artifact_paths(self) -> None:
        server = _start_media_server()
        try:
            image_url = f"http://127.0.0.1:{server.server_port}/photo.jpg"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "run_1" / "agent" / "web_media_downloader" / "invocation_001"
                runner = get_skill_registry(include_disabled=True)["web_media_downloader"]

                result = runner.invoke(
                    {"urls": image_url, "media_types": "image"},
                    context={
                        "artifact_dir": str(artifact_dir),
                        "artifact_relative_dir": "run_1/agent/web_media_downloader/invocation_001",
                    },
                )

                self.assertEqual(result["status"], "succeeded")
                self.assertEqual(result["downloaded_count"], 1)
                self.assertEqual(
                    result["downloaded_files"][0]["local_path"],
                    "run_1/agent/web_media_downloader/invocation_001/001-photo.jpg",
                )
                self.assertTrue((artifact_dir / "001-photo.jpg").is_file())
        finally:
            server.shutdown()
            server.server_close()


class _MediaHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path.startswith("/gallery"):
            body = f"""
            <html>
              <head><meta property="og:image" content="http://127.0.0.1:{self.server.server_port}/photo.jpg"></head>
              <body>
                <img src="/photo.jpg" srcset="/thumb.webp 480w, /photo.jpg 1200w">
                <video poster="/poster.jpg"><source src="/clip.mp4" type="video/mp4"></video>
              </body>
            </html>
            """.encode("utf-8")
            self._send(200, "text/html; charset=utf-8", body)
            return
        if self.path.startswith("/photo.jpg"):
            self._send(200, "image/jpeg", b"fake-jpeg")
            return
        if self.path.startswith("/clip.mp4"):
            self._send(200, "video/mp4", b"fake-mp4")
            return
        if self.path.startswith("/poster.jpg"):
            self._send(200, "image/jpeg", b"fake-poster")
            return
        if self.path.startswith("/thumb.webp"):
            self._send(200, "image/webp", b"fake-webp")
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


def _start_media_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _MediaHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


if __name__ == "__main__":
    unittest.main()
