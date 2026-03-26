from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility
from app.skills.definitions import _parse_native_skill_manifest
from app.skills.registry import get_skill_registry


AUTONOMOUS_DECISION_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "autonomous_decision" / "run.py"
AUTONOMOUS_DECISION_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "skill" / "autonomous_decision" / "skill.json"


def _load_autonomous_decision_module():
    spec = importlib.util.spec_from_file_location("graphiteui_autonomous_decision_skill_test", AUTONOMOUS_DECISION_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load autonomous_decision skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _catalog_item(
    skill_key: str,
    *,
    label: str,
    description: str,
    permissions: list[str] | None = None,
    side_effects: list[str] | None = None,
    discoverable: bool = True,
    auto_selectable: bool = True,
    requires_approval: bool = False,
    runtime_ready: bool = True,
    runtime_registered: bool = True,
    configured: bool = True,
    healthy: bool = True,
    status: str = "active",
    agent_node_eligibility: str = "ready",
) -> dict[str, object]:
    return {
        "skillKey": skill_key,
        "label": label,
        "description": description,
        "permissions": permissions or [],
        "sideEffects": side_effects or [],
        "supportedValueTypes": ["text", "json"],
        "inputSchema": [{"key": "query", "label": "Query", "valueType": "text", "required": True}],
        "outputSchema": [{"key": "summary", "label": "Summary", "valueType": "markdown"}],
        "runPolicies": {
            "default": {
                "discoverable": discoverable,
                "autoSelectable": False,
                "requiresApproval": False,
            },
            "origins": {
                "companion": {
                    "discoverable": discoverable,
                    "autoSelectable": auto_selectable,
                    "requiresApproval": requires_approval,
                }
            },
        },
        "runtimeReady": runtime_ready,
        "runtimeRegistered": runtime_registered,
        "configured": configured,
        "healthy": healthy,
        "status": status,
        "agentNodeEligibility": agent_node_eligibility,
        "agentNodeBlockers": [],
    }


class AutonomousDecisionSkillTests(unittest.TestCase):
    def test_manifest_is_control_skill_ready_and_not_autonomously_selectable(self) -> None:
        definition = _parse_native_skill_manifest(AUTONOMOUS_DECISION_MANIFEST_PATH, source_scope="installed").definition

        self.assertEqual(definition.skill_key, "autonomous_decision")
        self.assertEqual(definition.kind, "control")
        self.assertEqual(definition.mode, "context")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertFalse(definition.run_policies.default.discoverable)
        self.assertFalse(definition.run_policies.default.auto_selectable)
        self.assertFalse(definition.run_policies.origins["companion"].auto_selectable)

    def test_selects_ready_auto_selectable_skill_and_requests_approval_when_policy_requires_it(self) -> None:
        autonomous_decision = _load_autonomous_decision_module()
        result = autonomous_decision.autonomous_decision_skill(
            run_origin="companion",
            user_message="请帮我联网搜索今天最新的 GraphiteUI 资料",
            required_capability="web search latest information",
            skill_catalog=[
                _catalog_item(
                    "local_file",
                    label="Local File",
                    description="Read and write local files.",
                    discoverable=False,
                    auto_selectable=False,
                    requires_approval=False,
                    permissions=["file_read", "file_write"],
                    side_effects=["file_read", "file_write"],
                ),
                _catalog_item(
                    "web_media_downloader",
                    label="Web Media Downloader",
                    description="Download authorized web media.",
                    auto_selectable=False,
                    requires_approval=True,
                    permissions=["network", "file_write"],
                    side_effects=["network", "file_write"],
                ),
                _catalog_item(
                    "web_search",
                    label="Web Search",
                    description="Search the public web and return cited results.",
                    auto_selectable=True,
                    requires_approval=True,
                    permissions=["network", "secret_read"],
                    side_effects=["network", "secret_read"],
                ),
            ],
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["decision"], "request_approval")
        self.assertTrue(result["needs_tool"])
        self.assertEqual(result["selected_skill"]["skillKey"], "web_search")
        self.assertTrue(result["requires_approval"])
        self.assertEqual(result["permission_request"]["skillKey"], "web_search")
        self.assertIn("network", result["permission_request"]["permissions"])
        self.assertEqual(result["next_action"], "request_approval")

    def test_selects_companion_web_search_without_approval_when_policy_allows_it(self) -> None:
        autonomous_decision = _load_autonomous_decision_module()
        result = autonomous_decision.autonomous_decision_skill(
            run_origin="companion",
            user_message="帮我总结一下今天的 AI 新闻",
            required_capability="web search latest AI news",
            skill_catalog=[
                _catalog_item(
                    "web_search",
                    label="Web Search",
                    description="Search the public web and return cited results.",
                    auto_selectable=True,
                    requires_approval=False,
                    permissions=["network", "secret_read"],
                    side_effects=["network", "secret_read"],
                ),
            ],
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["decision"], "use_skill")
        self.assertEqual(result["next_action"], "execute_skill")
        self.assertTrue(result["needs_tool"])
        self.assertEqual(result["selected_skill"]["skillKey"], "web_search")
        self.assertFalse(result["requires_approval"])
        self.assertIsNone(result["permission_request"])

    def test_reports_missing_skill_when_only_hidden_or_manual_skills_match(self) -> None:
        autonomous_decision = _load_autonomous_decision_module()
        result = autonomous_decision.autonomous_decision_skill(
            run_origin="companion",
            user_message="下载这个网页里的视频素材",
            required_capability="download web video media",
            skill_catalog=[
                _catalog_item(
                    "web_media_downloader",
                    label="Web Media Downloader",
                    description="Download authorized web media.",
                    auto_selectable=False,
                    requires_approval=True,
                    permissions=["network", "file_write"],
                    side_effects=["network", "file_write"],
                ),
                _catalog_item(
                    "local_file",
                    label="Local File",
                    description="Read and write local files.",
                    discoverable=False,
                    auto_selectable=False,
                    permissions=["file_read", "file_write"],
                    side_effects=["file_read", "file_write"],
                ),
            ],
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["decision"], "missing_skill")
        self.assertIsNone(result["selected_skill"])
        self.assertEqual(result["next_action"], "propose_skill")
        self.assertEqual(result["missing_skill_proposal"]["capability"], "download web video media")
        self.assertIn("web_media_downloader", result["blocked_candidates"][0]["skillKey"])

    def test_returns_direct_reply_branch_when_tool_is_not_needed(self) -> None:
        autonomous_decision = _load_autonomous_decision_module()
        result = autonomous_decision.autonomous_decision_skill(
            run_origin="companion",
            user_message="你好，先不用工具，解释一下当前页面就好",
            needs_tool=False,
            required_capability="",
            skill_catalog=[],
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["decision"], "answer_directly")
        self.assertFalse(result["needs_tool"])
        self.assertEqual(result["next_action"], "compose_reply")

    def test_autonomous_decision_skill_is_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        self.assertIn("autonomous_decision", registry)


if __name__ == "__main__":
    unittest.main()
