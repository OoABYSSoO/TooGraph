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
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            ["selected_capability", "visible_operation_result", "user_goal", "reason"],
        )
        self.assertEqual(
            {field.key: field.value_type for field in definition.state_output_schema},
            {
                "ok": "boolean",
                "result_package": "result_package",
                "error": "json",
            },
        )

    def test_after_llm_wraps_visible_page_operation_result_as_original_subgraph_result(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "高级联网搜索",
                    "description": "多轮搜索并产出答案。",
                },
                "visible_operation_result": {
                    "kind": "result_package",
                    "sourceType": "subgraph",
                    "sourceKey": "toograph_page_operation_workflow",
                    "sourceName": "操作 TooGraph 页面",
                    "status": "succeeded",
                    "inputs": {"user_goal": "运行图模板 高级联网搜索。本次目标：研究 TooGraph。"},
                    "outputs": {
                        "final_reply": {
                            "name": "最终回复",
                            "description": "页面操作结果。",
                            "type": "markdown",
                            "value": "已运行模板并拿到结果。",
                        },
                        "operation_report": {
                            "name": "操作报告",
                            "description": "页面操作结构化结果。",
                            "type": "json",
                            "value": {
                                "operation_result": {
                                    "triggered_run_id": "run_template_123",
                                    "triggered_run_status": "completed",
                                    "input_text": "研究 TooGraph。",
                                }
                            },
                        },
                    },
                    "durationMs": 321,
                    "error": "",
                    "errorType": "",
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
        self.assertEqual(package["inputs"]["visible_operation_capability"], "toograph_page_operation_workflow")
        self.assertEqual(package["outputs"]["final_reply"]["value"], "已运行模板并拿到结果。")
        self.assertEqual(package["outputs"]["operation_report"]["value"]["operation_result"]["triggered_run_id"], "run_template_123")
        self.assertEqual(package["outputs"]["visible_operation_result"]["value"]["sourceKey"], "toograph_page_operation_workflow")
        self.assertNotIn("fieldKey", package["outputs"]["final_reply"])

    def test_after_llm_rejects_non_subgraph_capability(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {"kind": "skill", "key": "web_search", "name": "Web Search"},
                "visible_operation_result": {"kind": "result_package"},
                "user_goal": "研究 TooGraph。",
            },
        )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"]["code"], "unsupported_capability_kind")


if __name__ == "__main__":
    unittest.main()
