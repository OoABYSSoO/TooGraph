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
ADAPTER_SKILL_DIR = REPO_ROOT / "action" / "official" / "buddy_visible_subgraph_result_adapter"
ADAPTER_MANIFEST_PATH = ADAPTER_SKILL_DIR / "action.json"
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
        self.assertNotIn("selected_capability", [field.key for field in definition.state_input_schema])
        self.assertNotIn("capability_selection_audit", [field.key for field in definition.state_input_schema])
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
                    "output_contract": [
                        {
                            "key": "final_reply",
                            "name": "最终回复",
                            "type": "markdown",
                            "role": "final_response",
                            "pass_through": True,
                            "required": True,
                        },
                        {
                            "key": "evidence_cards",
                            "name": "证据卡片",
                            "type": "json",
                            "role": "evidence",
                            "pass_through": False,
                            "required": False,
                        },
                    ],
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
                    "artifact_refs": [
                        {
                            "title": "最终回复",
                            "artifact_kind": "saved_output",
                            "path": "runs/run_template_123/final.md",
                            "local_path": None,
                            "file_name": "final.md",
                            "source_key": "final_reply",
                            "node_id": "output_final",
                            "format": "md",
                            "content_type": None,
                        }
                    ],
                    "target_run_validation": {
                        "run_id": "run_template_123",
                        "graph_id": "advanced_web_research_loop",
                        "status": "completed",
                        "final_result_preview": "已运行模板并拿到结果。",
                        "root_outputs": [
                            {
                                "node_id": "output_final",
                                "source_key": "final_reply",
                                "label": "最终回复",
                                "display_mode": "markdown",
                                "persist_enabled": False,
                                "persist_format": "md",
                                "value_type": "text",
                                "value_preview": "已运行模板并拿到结果。",
                                "has_value": True,
                            }
                        ],
                        "errors": [],
                        "warnings": ["部分搜索源失败。"],
                        "activity_events": [
                            {
                                "kind": "subgraph_invocation",
                                "summary": "Ran target template.",
                                "status": "succeeded",
                                "node_id": "run_search",
                                "error": None,
                            }
                        ],
                        "artifact_refs": [
                            {
                                "title": "最终回复",
                                "artifact_kind": "saved_output",
                                "path": "runs/run_template_123/final.md",
                                "local_path": None,
                                "file_name": "final.md",
                                "source_key": "final_reply",
                                "node_id": "output_final",
                                "format": "md",
                                "content_type": None,
                            }
                        ],
                    },
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
        self.assertEqual(package["outputContract"][0]["key"], "final_reply")
        self.assertEqual(package["outputs"]["final_reply"]["value"], "已运行模板并拿到结果。")
        self.assertEqual(package["outputs"]["operation_report"]["value"]["operation_report"]["triggered_run_id"], "run_template_123")
        validation_report = package["outputs"]["validation_report"]["value"]
        self.assertEqual(validation_report["target_run"]["run_id"], "run_template_123")
        self.assertEqual(validation_report["root_outputs"][0]["source_key"], "final_reply")
        self.assertEqual(validation_report["missing_required_outputs"], [])
        self.assertEqual(validation_report["final_response_strategy"], "pass_through")
        self.assertEqual(validation_report["artifact_refs"][0]["path"], "runs/run_template_123/final.md")
        self.assertEqual(validation_report["warnings"], ["部分搜索源失败。"])
        self.assertNotIn("page_operation_context", package["outputs"]["operation_report"]["value"])
        self.assertEqual(package["outputs"]["visible_operation_result"]["value"]["triggered_run_id"], "run_template_123")
        self.assertNotIn("fieldKey", package["outputs"]["final_reply"])

    def test_after_llm_reports_repair_options_for_failed_target_run(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "高级联网搜索",
                    "output_contract": [
                        {
                            "key": "final_reply",
                            "name": "最终回复",
                            "type": "markdown",
                            "role": "final_response",
                            "pass_through": True,
                            "required": True,
                        }
                    ],
                },
                "operation_report": {
                    "operation_request_id": "vop_template_failed",
                    "status": "failed",
                    "triggered_run_id": "run_template_failed",
                    "triggered_graph_id": "advanced_web_research_loop",
                    "triggered_run_status": "failed",
                    "target_run_validation": {
                        "run_id": "run_template_failed",
                        "graph_id": "advanced_web_research_loop",
                        "status": "failed",
                        "final_result_preview": "",
                        "root_outputs": [],
                        "errors": ["required input query is missing"],
                        "warnings": [],
                        "activity_events": [],
                        "artifact_refs": [],
                    },
                },
                "user_goal": "研究 TooGraph。",
            },
        )

        validation_report = result["result_package"]["outputs"]["validation_report"]["value"]
        self.assertTrue(validation_report["needs_repair"])
        self.assertEqual(validation_report["missing_required_outputs"], ["final_reply"])
        self.assertEqual(validation_report["final_response_strategy"], "ask_user")
        self.assertEqual(
            [option["action"] for option in validation_report["repair_options"]],
            ["rebind_inputs", "rerun_template", "switch_template", "ask_user", "end_with_gap"],
        )
        self.assertTrue(validation_report["repair_options"][0]["requires_user_input"])

    def test_after_llm_wraps_page_operation_workflow_outputs(self) -> None:
        result = _run_skill_script(
            ADAPTER_AFTER_LLM_PATH,
            {
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
