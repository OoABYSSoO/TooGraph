from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.skills.builtin.web_search import web_search_skill
from app.skills.registry import get_skill_registry


class WebSearchSkillTests(unittest.TestCase):
    def test_web_search_skill_normalizes_tavily_results_when_api_key_is_configured(self) -> None:
        with (
            patch.dict(os.environ, {"TAVILY_API_KEY": "tvly-test"}, clear=True),
            patch("app.skills.builtin.web_search._search_with_tavily") as tavily_search,
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

            result = web_search_skill(
                query="GraphiteUI workflow studio",
                max_results="2",
                search_depth="advanced",
                include_raw_content="true",
            )

        tavily_search.assert_called_once_with(
            query="GraphiteUI workflow studio",
            max_results=2,
            search_depth="advanced",
            include_raw_content=True,
            api_key="tvly-test",
            timeout_seconds=15.0,
        )
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["provider"], "tavily")
        self.assertEqual(result["summary"], "GraphiteUI is a visual workflow studio.")
        self.assertEqual(result["result_count"], 1)
        self.assertEqual(result["results"][0]["title"], "GraphiteUI Docs")
        self.assertEqual(result["citations"], [{"index": 1, "title": "GraphiteUI Docs", "url": "https://example.com/docs"}])
        self.assertIn("[1] GraphiteUI Docs", result["context"])

    def test_web_search_skill_falls_back_to_duckduckgo_without_api_key(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("app.skills.builtin.web_search._search_with_duckduckgo") as duckduckgo_search,
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

            result = web_search_skill(query="fallback search", max_results=1)

        duckduckgo_search.assert_called_once_with(
            query="fallback search",
            max_results=1,
            timeout_seconds=15.0,
        )
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["provider"], "duckduckgo")
        self.assertRegex(result["searched_at"], r"^\d{4}-\d{2}-\d{2}T")
        self.assertRegex(result["searched_date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(result["results"][0]["url"], "https://example.org/fallback")
        self.assertIn("Fallback Result", result["summary"])
        self.assertIn("Search date:", result["context"])

    def test_web_search_skill_returns_structured_error_for_missing_query(self) -> None:
        result = web_search_skill(query="   ")

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["result_count"], 0)
        self.assertEqual(result["results"], [])
        self.assertIn("query", result["error"].lower())

    def test_web_search_skill_is_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        self.assertIn("web_search", registry)


if __name__ == "__main__":
    unittest.main()
