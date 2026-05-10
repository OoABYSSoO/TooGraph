from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.templates.loader import list_template_records


def _official_template_ids() -> list[str]:
    return [record["template_id"] for record in list_template_records() if record.get("source") == "official"]


class RunGraphSnapshotTests(unittest.TestCase):
    def test_snapshot_tests_do_not_depend_on_template_fixtures(self) -> None:
        self.assertEqual(
            _official_template_ids(),
            [
                "advanced_web_research_loop",
                "ai_news_digest_to_wechat_article",
                "buddy_autonomous_loop",
                "buddy_capability_loop",
                "ecommerce_review_mining_agent",
                "game_creative_factory",
                "job_application_interview_coach",
                "multi_platform_content_repurposer",
                "policy_navigator_agent",
                "product_competitor_research_agent",
                "toograph_graph_template_creation_workflow",
                "toograph_page_operation_workflow",
                "toograph_skill_creation_workflow",
            ],
        )


if __name__ == "__main__":
    unittest.main()
