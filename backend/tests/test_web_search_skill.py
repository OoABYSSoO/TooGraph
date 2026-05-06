from __future__ import annotations

import os
import sys
import tempfile
import threading
import unittest
import importlib.util
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.skills.registry import get_skill_registry


WEB_SEARCH_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "web_search" / "run.py"


def _load_web_search_module():
    spec = importlib.util.spec_from_file_location("graphiteui_web_search_skill_test", WEB_SEARCH_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load web_search skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WebSearchSkillTests(unittest.TestCase):
    def test_web_search_skill_owns_time_sensitive_query_date_anchor(self) -> None:
        web_search = _load_web_search_module()

        query = web_search._enrich_time_sensitive_web_search_query(
            "最新模型发布日期",
            now=datetime(2026, 5, 1, 13, 28, 44, tzinfo=timezone.utc),
        )

        self.assertEqual(query, "最新模型发布日期 2026-05-01")

    def test_web_search_skill_normalizes_tavily_results_when_api_key_is_configured(self) -> None:
        web_search = _load_web_search_module()
        with (
            patch.dict(os.environ, {"TAVILY_API_KEY": "tvly-test"}, clear=True),
            patch.object(web_search, "_search_with_tavily") as tavily_search,
        ):
            tavily_search.return_value = {
                "answer": "GraphiteUI is a visual workflow studio.",
                "results": [
                    {
                        "title": "GraphiteUI Docs",
                        "url": "https://example.com/docs",
                        "content": "A visual workflow editor for LangGraph-style automations.",
                        "score": 0.91,
                    }
                ],
            }

            result = web_search.web_search_skill(
                query="GraphiteUI workflow studio",
            )

        tavily_search.assert_called_once_with(
            query="GraphiteUI workflow studio",
            max_results=5,
            search_depth="basic",
            include_raw_content=False,
            api_key="tvly-test",
            timeout_seconds=15.0,
        )
        self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors"})
        self.assertEqual(result["query"], "GraphiteUI workflow studio")
        self.assertEqual(result["source_urls"], ["https://example.com/docs"])
        self.assertEqual(result["artifact_paths"], [])
        self.assertEqual(result["errors"], [])

    def test_web_search_skill_falls_back_to_duckduckgo_without_api_key(self) -> None:
        web_search = _load_web_search_module()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(web_search, "_search_with_duckduckgo") as duckduckgo_search,
        ):
            duckduckgo_search.return_value = {
                "results": [
                    {
                        "title": "Fallback Result",
                        "url": "https://example.org/fallback",
                        "content": "Fallback search works without a private API key.",
                    }
                ]
            }

            result = web_search.web_search_skill(query="fallback search")

        duckduckgo_search.assert_called_once_with(
            query="fallback search",
            max_results=5,
            timeout_seconds=15.0,
        )
        self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors"})
        self.assertEqual(result["query"], "fallback search")
        self.assertEqual(result["source_urls"], ["https://example.org/fallback"])
        self.assertEqual(result["artifact_paths"], [])
        self.assertEqual(result["errors"], [])

    def test_web_search_skill_retries_transient_search_errors_five_times(self) -> None:
        web_search = _load_web_search_module()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(web_search, "_search_with_duckduckgo") as duckduckgo_search,
        ):
            duckduckgo_search.side_effect = [
                RuntimeError("temporary TLS EOF"),
                RuntimeError("temporary TLS EOF"),
                RuntimeError("temporary TLS EOF"),
                RuntimeError("temporary TLS EOF"),
                {
                    "results": [
                        {
                            "title": "Retry Result",
                            "url": "https://example.org/retry",
                            "content": "Retry recovered the search result.",
                        }
                    ]
                },
            ]

            result = web_search.web_search_skill(query="retry search")

        self.assertEqual(duckduckgo_search.call_count, 5)
        self.assertEqual(result["source_urls"], ["https://example.org/retry"])
        self.assertEqual(result["artifact_paths"], [])
        self.assertEqual(result["errors"], [])

    def test_web_search_skill_returns_last_error_after_five_failed_search_attempts(self) -> None:
        web_search = _load_web_search_module()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(web_search, "_search_with_duckduckgo") as duckduckgo_search,
        ):
            duckduckgo_search.side_effect = RuntimeError("persistent TLS EOF")

            result = web_search.web_search_skill(query="retry search")

        self.assertEqual(duckduckgo_search.call_count, 5)
        self.assertEqual(result["source_urls"], [])
        self.assertEqual(result["artifact_paths"], [])
        self.assertEqual(result["errors"], ["persistent TLS EOF"])

    def test_web_search_skill_fetches_pages_to_local_artifacts_when_requested(self) -> None:
        web_search = _load_web_search_module()
        server = _start_article_server(
            """
            <html>
              <head><title>Full Article Title</title></head>
              <body>
                <nav>Navigation should not dominate extraction.</nav>
                <main>
                  <h1>Full Article Title</h1>
                  <p>Detailed evidence paragraph with enough information for later review.</p>
                  <p>Second paragraph containing source facts and publication details.</p>
                </main>
              </body>
            </html>
            """
        )
        try:
            article_url = f"http://127.0.0.1:{server.server_port}/article"
            with tempfile.TemporaryDirectory() as temp_dir:
                artifact_dir = Path(temp_dir) / "run_1" / "searcher" / "web_search" / "invocation_001"
                with (
                    patch.dict(
                        os.environ,
                        {
                            "GRAPHITE_SKILL_ARTIFACT_DIR": str(artifact_dir),
                            "GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR": "run_1/searcher/web_search/invocation_001",
                        },
                        clear=True,
                    ),
                    patch.object(web_search, "_search_with_duckduckgo") as duckduckgo_search,
                ):
                    duckduckgo_search.return_value = {
                        "results": [
                            {
                                "title": "Search Result Title",
                                "url": article_url,
                                "content": "Search result snippet.",
                            }
                        ]
                    }

                    result = web_search.web_search_skill(query="full article")

                document_path = artifact_dir / "doc_001.md"
                self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors"})
                self.assertEqual(result["query"], "full article")
                self.assertEqual(result["artifact_paths"], ["run_1/searcher/web_search/invocation_001/doc_001.md"])
                self.assertEqual(result["errors"], [])
                self.assertTrue(document_path.is_file())
                document_text = document_path.read_text(encoding="utf-8")
                self.assertIn("Detailed evidence paragraph", document_text)
                self.assertNotIn("Source URL:", document_text)
                self.assertNotIn("Fetched at:", document_text)
        finally:
            server.shutdown()
            server.server_close()

    def test_web_search_skill_returns_structured_error_for_missing_query(self) -> None:
        web_search = _load_web_search_module()
        result = web_search.web_search_skill(query="   ")

        self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors"})
        self.assertEqual(result["query"], "")
        self.assertEqual(result["source_urls"], [])
        self.assertEqual(result["artifact_paths"], [])
        self.assertEqual(result["errors"], ["Search query is required."])

    def test_web_search_skill_is_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        self.assertIn("web_search", registry)


class _ArticleHandler(BaseHTTPRequestHandler):
    article_html = ""

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        body = self.article_html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def _start_article_server(html: str) -> ThreadingHTTPServer:
    handler = type("GraphiteUITestArticleHandler", (_ArticleHandler,), {"article_html": html})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


if __name__ == "__main__":
    unittest.main()
