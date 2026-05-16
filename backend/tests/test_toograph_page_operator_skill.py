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
PAGE_OPERATOR_SKILL_DIR = REPO_ROOT / "skill" / "official" / "toograph_page_operator"
PAGE_OPERATOR_MANIFEST_PATH = PAGE_OPERATOR_SKILL_DIR / "skill.json"
PAGE_OPERATOR_BEFORE_LLM_PATH = PAGE_OPERATOR_SKILL_DIR / "before_llm.py"
PAGE_OPERATOR_AFTER_LLM_PATH = PAGE_OPERATOR_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object], *, env: dict[str, str] | None = None) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        env={**os.environ, **(env or {})},
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
            ["commands", "graph_edit_intents", "cursor_lifecycle", "reason"],
        )
        llm_output_types = {field.key: field.value_type for field in definition.llm_output_schema}
        self.assertEqual(llm_output_types["commands"], "text_array")
        self.assertEqual(llm_output_types["graph_edit_intents"], "json")
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
                    "page_path": "/editor",
                    "page_operation_book": {
                        "page": {"path": "/editor", "title": "图编辑器", "snapshotId": "snapshot-test"},
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
                                "targetId": "editor.graph.playback",
                                "label": "图编辑回放",
                                "role": "button",
                                "commands": ["graph_edit editor.graph.playback"],
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
        self.assertIn('"current_page_path": "/editor"', context)
        self.assertNotIn("/stale-graph-state", context)
        self.assertNotIn("/stale-top-level", context)
        self.assertIn('"targetId": "app.nav.runs"', context)
        self.assertIn('"click app.nav.runs"', context)
        self.assertIn('"targetId": "app.nav.library"', context)
        self.assertIn('"click app.nav.library"', context)
        self.assertIn('"targetId": "editor.canvas.node.agent_1"', context)
        self.assertIn('"click editor.canvas.node.agent_1"', context)
        self.assertIn('"targetId": "editor.graph.playback"', context)
        self.assertIn('"graph_edit editor.graph.playback"', context)
        context_payload = json.loads(context)
        self.assertEqual(
            context_payload["available_commands"],
            ["click app.nav.runs", "click app.nav.library", "click editor.canvas.node.agent_1", "graph_edit editor.graph.playback"],
        )
        self.assertEqual(context_payload["output_contract"]["commands"], ["click app.nav.runs"])
        self.assertIn("graph_edit_intents", context_payload["output_contract"])
        self.assertIn("伙伴页面、伙伴浮窗、伙伴形象", context)
        self.assertNotIn("app.nav.buddy", context)
        self.assertNotIn("buddy.tab.history", context)
        self.assertNotIn("mascot-debug", context)

    def test_before_llm_filters_graph_edit_commands_outside_editor_page(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_BEFORE_LLM_PATH,
            {
                "runtime_context": {
                    "page_path": "/runs",
                    "page_operation_book": {
                        "page": {"path": "/runs", "title": "运行历史", "snapshotId": "snapshot-runs"},
                        "allowedOperations": [
                            {
                                "targetId": "editor.graph.playback",
                                "label": "图编辑回放",
                                "role": "button",
                                "commands": ["graph_edit editor.graph.playback"],
                            },
                            {
                                "targetId": "app.nav.editor",
                                "label": "图编辑器",
                                "role": "navigation-link",
                                "commands": ["click app.nav.editor"],
                            },
                        ],
                        "inputs": [],
                        "unavailable": [],
                        "forbidden": [],
                    },
                },
            },
        )

        context_payload = json.loads(str(result.get("context") or ""))
        self.assertEqual(context_payload["current_page_path"], "/runs")
        self.assertEqual(context_payload["available_commands"], ["click app.nav.editor"])
        self.assertEqual(context_payload["output_contract"]["graph_edit_intents"], [])
        allowed_commands = [
            command
            for operation in context_payload["page_operation_book"]["allowedOperations"]
            for command in operation["commands"]
        ]
        self.assertNotIn("graph_edit editor.graph.playback", allowed_commands)

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

    def test_after_llm_emits_graph_edit_playback_event(self) -> None:
        intents = [
            {"kind": "create_node", "ref": "name_input", "nodeType": "input", "title": "input节点", "description": "输入姓名。"},
            {"kind": "create_state", "ref": "name", "name": "姓名", "valueType": "text"},
            {"kind": "bind_state", "nodeRef": "name_input", "stateRef": "name", "mode": "write"},
            {"kind": "create_node", "ref": "ask_name", "nodeType": "agent", "title": "LLM节点", "taskInstruction": "读取姓名，给这个姓名加问号。"},
            {"kind": "bind_state", "nodeRef": "ask_name", "stateRef": "name", "mode": "read"},
            {"kind": "connect_nodes", "sourceRef": "name_input", "targetRef": "ask_name"},
            {"kind": "create_node", "ref": "name_output", "nodeType": "output", "title": "output节点", "description": "输出姓名。"},
            {"kind": "bind_state", "nodeRef": "name_output", "stateRef": "name", "mode": "read"},
            {"kind": "connect_nodes", "sourceRef": "ask_name", "targetRef": "name_output"},
        ]

        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "commands": ["graph_edit editor.graph.playback"],
                "graph_edit_intents": intents,
                "cursor_lifecycle": "return_at_end",
                "reason": "用户要创建一个姓名输入到输出的图。",
            },
            env={"TOOGRAPH_SKILL_RUNTIME_CONTEXT": json.dumps({"page_path": "/editor/new"})},
        )

        self.assertEqual(result["ok"], True)
        self.assertEqual(result["journal"][0]["kind"], "graph_edit")
        event = result["activity_events"][0]
        operation = event["detail"]["operation"]
        self.assertEqual(operation["kind"], "graph_edit")
        self.assertEqual(operation["target_id"], "editor.canvas.surface")
        self.assertEqual(operation["graph_edit_intents"], intents)
        self.assertEqual(event["detail"]["operation_request"]["operations"][0]["graph_edit_intents"], intents)
        self.assertEqual(event["detail"]["cursor_lifecycle"], "return_at_end")

    def test_after_llm_rejects_graph_edit_outside_editor_page(self) -> None:
        result = _run_skill_script(
            PAGE_OPERATOR_AFTER_LLM_PATH,
            {
                "page_path": "/runs",
                "commands": ["graph_edit editor.graph.playback"],
                "graph_edit_intents": [
                    {"kind": "create_node", "ref": "name_input", "nodeType": "input", "title": "input节点"},
                ],
            },
        )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"]["code"], "graph_edit_requires_editor_page")
        self.assertEqual(result["activity_events"][0]["status"], "failed")

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
