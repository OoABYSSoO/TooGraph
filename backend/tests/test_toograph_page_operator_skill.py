from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
PAGE_OPERATOR_SKILL_DIR = REPO_ROOT / "skill" / "official" / "toograph_page_operator"
PAGE_OPERATOR_MANIFEST_PATH = PAGE_OPERATOR_SKILL_DIR / "skill.json"
PAGE_OPERATOR_BEFORE_LLM_PATH = PAGE_OPERATOR_SKILL_DIR / "before_llm.py"
PAGE_OPERATOR_AFTER_LLM_PATH = PAGE_OPERATOR_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class TooGraphPageOperatorSkillTests(unittest.TestCase):
    def test_manifest_exposes_page_operator_contract(self) -> None:
        definition = _parse_native_skill_manifest(PAGE_OPERATOR_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "toograph_page_operator")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["virtual_ui_operation"])
        self.assertEqual(
            [field.key for field in definition.input_schema],
            ["page_path", "user_goal", "action", "target", "cursor_lifecycle"],
        )
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["ok", "next_page_path", "cursor_session_id", "journal", "error"],
        )

    def test_before_llm_returns_operation_book_without_buddy_targets(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_BEFORE_LLM_PATH,
            {"page_context": "当前路径: /buddy\n伙伴页面里有历史按钮，但不应该返回。"},
        )

        context = str(result.get("context") or "")
        self.assertIn('"current_page_path": "/buddy"', context)
        self.assertIn('"affordance_id": "app.nav.runs"', context)
        self.assertIn("伙伴页面、伙伴浮窗、伙伴形象", context)
        self.assertNotIn("app.nav.buddy", context)
        self.assertNotIn("buddy.tab.history", context)
        self.assertNotIn("mascot-debug", context)

    def test_after_llm_emits_virtual_click_event_for_runs_navigation(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/",
                "action": "click_nav",
                "target": "runs",
                "cursor_lifecycle": "return_after_step",
            },
        )

        self.assertEqual(result["ok"], True)
        self.assertEqual(result["next_page_path"], "/runs")
        self.assertEqual(result["journal"][0]["target_id"], "app.nav.runs")
        event = result["activity_events"][0]
        self.assertEqual(event["kind"], "virtual_ui_operation")
        self.assertEqual(event["status"], "requested")
        self.assertEqual(event["detail"]["operation"]["kind"], "click")
        self.assertEqual(event["detail"]["operation"]["target_id"], "app.nav.runs")
        self.assertEqual(event["detail"]["cursor_lifecycle"], "return_after_step")

    def test_after_llm_rejects_buddy_self_targets(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/buddy",
                "action": "click_nav",
                "target": "app.nav.buddy",
            },
        )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"]["code"], "forbidden_self_surface")
        self.assertEqual(result["activity_events"][0]["kind"], "virtual_ui_operation")
        self.assertEqual(result["activity_events"][0]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
