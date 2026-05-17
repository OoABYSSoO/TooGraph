from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
ADAPTER_SKILL_DIR = REPO_ROOT / "skill" / "official" / "buddy_visible_subgraph_result_adapter"
ADAPTER_MANIFEST_PATH = ADAPTER_SKILL_DIR / "skill.json"
ADAPTER_AFTER_LLM_PATH = ADAPTER_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        env=os.environ.copy(),
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class BuddyVisibleSubgraphResultAdapterSkillTests(unittest.TestCase):
    def test_manifest_exposes_internal_result_package_adapter_contract(self) -> None:
        definition = _parse_native_skill_manifest(ADAPTER_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "buddy_visible_subgraph_result_adapter")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, [])
        self.assertNotIn("page_operation_context", [field.key for field in definition.state_input_schema])
        self.assertNotIn("operation_result", [field.key for field in definition.state_input_schema])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            [
                "selected_capability",
                "operation_report",
                "page_operation_final_reply",
                "page_operation_workflow_report",
                "visible_operation_result",
                "user_goal",
                "reason",
            ],
        )
        self.assertEqual(
            {field.key: field.value_type for field in definition.state_output_schema},
            {
                "ok": "boolean",
                "result_package": "result_package",
                "error": "json",
            },
        )

    def test_after_llm_wraps_visible_template_operation_result_as_original_subgraph_result(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "高级联网搜索",
                    "description": "多轮搜索并产出答案。",
                },
                "operation_report": {
                    "operation_request_id": "vop_template_123",
                    "status": "succeeded",
                    "commands": ["run_template advanced_web_research_loop"],
                    "triggered_run_id": "run_template_123",
                    "triggered_run_status": "completed",
                    "triggered_run_result_summary": "已运行模板并拿到结果。",
                    "triggered_run_final_result": "已运行模板并拿到结果。",
                    "input_text": "研究 TooGraph。",
                    "route_after": "/editor/advanced_web_research_loop",
                },
                "user_goal": "研究 TooGraph。",
                "reason": "目标模板通过可见页面操作运行。",
            },
        )

        self.assertEqual(result["ok"], True)
        package = result["result_package"]
        self.assertEqual(package["kind"], "result_package")
        self.assertEqual(package["sourceType"], "subgraph")
        self.assertEqual(package["sourceKey"], "advanced_web_research_loop")
        self.assertEqual(package["sourceName"], "高级联网搜索")
        self.assertEqual(package["status"], "succeeded")
        self.assertEqual(package["inputs"]["user_goal"], "研究 TooGraph。")
        self.assertEqual(package["inputs"]["visible_operation_capability"], "toograph_page_operator")
        self.assertEqual(package["outputs"]["final_reply"]["value"], "已运行模板并拿到结果。")
        self.assertEqual(package["outputs"]["operation_report"]["value"]["operation_report"]["triggered_run_id"], "run_template_123")
        self.assertNotIn("page_operation_context", package["outputs"]["operation_report"]["value"])
        self.assertEqual(package["outputs"]["visible_operation_result"]["value"]["triggered_run_id"], "run_template_123")
        self.assertNotIn("fieldKey", package["outputs"]["final_reply"])

    def test_after_llm_wraps_page_operation_workflow_outputs(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "toograph_page_operation_workflow",
                    "name": "操作 TooGraph 页面",
                },
                "page_operation_final_reply": "已打开运行历史。",
                "page_operation_workflow_report": {"goal_completed": True, "route_after": "/runs"},
                "user_goal": "打开运行历史。",
                "reason": "页面目标模糊，使用页面操作子图。",
            },
        )

        self.assertEqual(result["ok"], True)
        package = result["result_package"]
        self.assertEqual(package["sourceKey"], "toograph_page_operation_workflow")
        self.assertEqual(package["outputs"]["final_reply"]["value"], "已打开运行历史。")
        self.assertEqual(package["outputs"]["operation_report"]["value"]["route_after"], "/runs")

    def test_after_llm_rejects_non_subgraph_capability(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {"kind": "skill", "key": "web_search", "name": "Web Search"},
                "operation_report": {"status": "succeeded"},
                "user_goal": "研究 TooGraph。",
            },
        )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"]["code"], "unsupported_capability_kind")


if __name__ == "__main__":
    unittest.main()
