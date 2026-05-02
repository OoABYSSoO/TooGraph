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
                "buddy_autonomous_loop",
                "toograph_page_operation_workflow",
                "toograph_skill_creation_workflow",
            ],
        )


if __name__ == "__main__":
    unittest.main()
