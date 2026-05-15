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
            [field.key for field in definition.state_input_schema],
            ["user_goal"],
        )
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            ["commands", "cursor_lifecycle", "reason"],
        )
        llm_output_types = {field.key: field.value_type for field in definition.llm_output_schema}
        self.assertEqual(llm_output_types["commands"], "text_array")
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["ok", "cursor_session_id", "journal", "error"],
        )

    def test_before_llm_returns_operation_book_without_buddy_targets(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_BEFORE_LLM_PATH,
            {
                "graph_state": {"page_path": "/stale-graph-state"},
                "page_context": "当前路径: /stale-top-level",
                "runtime_context": {
                    "page_path": "/buddy",
                    "page_operation_book": {
                        "page": {"path": "/buddy", "title": "伙伴", "snapshotId": "snapshot-test"},
                        "allowedOperations": [
                            {
                                "targetId": "app.nav.runs",
                                "label": "运行历史",
                                "role": "navigation-link",
                                "commands": ["click app.nav.runs"],
                                "resultHint": {"path": "/runs"},
                            },
                            {
                                "targetId": "app.nav.library",
                                "label": "图库",
                                "role": "navigation-link",
                                "commands": ["click app.nav.library"],
                                "resultHint": {"path": "/library"},
                            },
                            {
                                "targetId": "editor.canvas.node.agent_1",
                                "label": "节点：页面操作器",
                                "role": "button",
                                "commands": ["click editor.canvas.node.agent_1"],
                                "resultHint": None,
                            },
                            {
                                "targetId": "app.nav.buddy",
                                "label": "伙伴",
                                "role": "navigation-link",
                                "commands": ["click app.nav.buddy"],
                                "resultHint": {"path": "/buddy"},
                            },
                        ],
                        "inputs": [],
                        "unavailable": [],
                        "forbidden": ["伙伴页面、伙伴浮窗、伙伴形象和伙伴调试入口已过滤。"],
                    },
                },
            },
        )

        context = str(result.get("context") or "")
        self.assertIn('"current_page_path": "/buddy"', context)
        self.assertNotIn("/stale-graph-state", context)
        self.assertNotIn("/stale-top-level", context)
        self.assertIn('"targetId": "app.nav.runs"', context)
        self.assertIn('"click app.nav.runs"', context)
        self.assertIn('"targetId": "app.nav.library"', context)
        self.assertIn('"click app.nav.library"', context)
        self.assertIn('"targetId": "editor.canvas.node.agent_1"', context)
        self.assertIn('"click editor.canvas.node.agent_1"', context)
        context_payload = json.loads(context)
        self.assertEqual(
            context_payload["available_commands"],
            ["click app.nav.runs", "click app.nav.library", "click editor.canvas.node.agent_1"],
        )
        self.assertEqual(context_payload["output_contract"]["commands"], ["click app.nav.runs"])
        self.assertIn("伙伴页面、伙伴浮窗、伙伴形象", context)
        self.assertNotIn("app.nav.buddy", context)
        self.assertNotIn("buddy.tab.history", context)
        self.assertNotIn("mascot-debug", context)

    def test_after_llm_emits_virtual_click_event_for_runs_navigation(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/",
                "commands": ["click app.nav.runs"],
                "cursor_lifecycle": "return_after_step",
                "reason": "用户要打开运行历史页。",
            },
        )

        self.assertEqual(result["ok"], True)
        self.assertNotIn("next_page_path", result)
        self.assertEqual(result["journal"][0]["target_id"], "app.nav.runs")
        event = result["activity_events"][0]
        self.assertEqual(event["kind"], "virtual_ui_operation")
        self.assertEqual(event["status"], "requested")
        self.assertEqual(event["detail"]["operation"]["kind"], "click")
        self.assertEqual(event["detail"]["operation"]["target_id"], "app.nav.runs")
        self.assertNotIn("next_page_path", event["detail"])
        self.assertNotIn("next_page_path", event["detail"]["operation_request"])
        self.assertEqual(event["detail"]["commands"], ["click app.nav.runs"])
        self.assertEqual(event["detail"]["reason"], "用户要打开运行历史页。")
        self.assertEqual(event["detail"]["cursor_lifecycle"], "return_after_step")

    def test_after_llm_emits_virtual_click_event_for_canvas_targets(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/editor",
                "commands": ["click editor.canvas.node.agent_1"],
                "cursor_lifecycle": "keep",
                "reason": "用户要选中图中的节点。",
            },
        )

        self.assertEqual(result["ok"], True)
        self.assertEqual(result["journal"][0]["target_id"], "editor.canvas.node.agent_1")
        event = result["activity_events"][0]
        self.assertEqual(event["detail"]["operation"]["kind"], "click")
        self.assertEqual(event["detail"]["operation"]["target_id"], "editor.canvas.node.agent_1")
        self.assertEqual(event["detail"]["operation"]["target_label"], "editor.canvas.node.agent_1")
        self.assertEqual(event["detail"]["cursor_lifecycle"], "keep")

    def test_after_llm_accepts_nested_commands_object_as_compatibility_fallback(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/editor",
                "commands": {"commands": ["click app.nav.library"]},
                "cursor_lifecycle": "return-after-step",
                "reason": "模型把 commands 数组包进了对象。",
            },
        )

        self.assertEqual(result["ok"], True)
        self.assertNotIn("next_page_path", result)
        self.assertEqual(result["journal"][0]["target_id"], "app.nav.library")
        event = result["activity_events"][0]
        self.assertEqual(event["detail"]["commands"], ["click app.nav.library"])
        self.assertEqual(event["detail"]["operation"]["target_id"], "app.nav.library")
        self.assertNotIn("next_page_path", event["detail"]["operation_request"])

    def test_after_llm_rejects_buddy_self_targets(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/buddy",
                "commands": ["click app.nav.buddy"],
            },
        )

        self.assertEqual(result["ok"], False)
        self.assertNotIn("next_page_path", result)
        self.assertEqual(result["error"]["code"], "forbidden_self_surface")
        self.assertEqual(result["activity_events"][0]["kind"], "virtual_ui_operation")
        self.assertEqual(result["activity_events"][0]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
