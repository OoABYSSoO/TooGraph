from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.permission_approval import (
    build_pending_permission_approval,
    consume_pending_permission_approval,
    should_pause_for_action_permission_approval,
)
from app.core.schemas.actions import ActionDefinition


class PermissionApprovalTests(unittest.TestCase):
    def test_ask_first_pauses_for_risky_action_permissions(self) -> None:
        definition = ActionDefinition(
            actionKey="local_workspace_executor",
            name="Local Workspace Executor",
            permissions=["file_read", "file_write", "subprocess"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={"metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_definition=definition,
        )

        self.assertTrue(decision.required)
        self.assertEqual(decision.risky_permissions, ["file_write", "subprocess"])

    def test_workspace_read_operation_does_not_pause_for_write_capable_action(self) -> None:
        definition = ActionDefinition(
            actionKey="local_workspace_executor",
            name="Local Workspace Executor",
            permissions=["file_read", "file_write", "subprocess"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={"metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_definition=definition,
            action_inputs={"operation": "read", "path": "README.md"},
        )

        self.assertFalse(decision.required)
        self.assertEqual(decision.risky_permissions, [])

    def test_workspace_write_operation_requests_only_write_permission(self) -> None:
        definition = ActionDefinition(
            actionKey="local_workspace_executor",
            name="Local Workspace Executor",
            permissions=["file_read", "file_write", "subprocess"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={"metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_definition=definition,
            action_inputs={"operation": "write", "path": "action/user/demo/ACTION.md", "content": "# Demo"},
        )

        self.assertTrue(decision.required)
        self.assertEqual(decision.risky_permissions, ["file_write"])

    def test_full_access_does_not_pause_for_risky_action_permissions(self) -> None:
        definition = ActionDefinition(
            actionKey="local_workspace_executor",
            name="Local Workspace Executor",
            permissions=["file_write", "subprocess"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={"metadata": {"graph_permission_mode": "full_access", "buddy_can_execute_actions": True}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_definition=definition,
        )

        self.assertFalse(decision.required)
        self.assertEqual(decision.risky_permissions, ["file_write", "subprocess"])

    def test_permission_policy_can_require_risky_approval_without_mode_flag(self) -> None:
        definition = ActionDefinition(
            actionKey="local_workspace_executor",
            name="Local Workspace Executor",
            permissions=["file_read", "file_write", "subprocess"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={
                "metadata": {
                    "capability_permission_policy": {
                        "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
                        "approval_required_permission_tiers": ["risky"],
                    }
                }
            },
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_definition=definition,
            action_inputs={"operation": "write", "path": "action/user/demo/ACTION.md", "content": "# Demo"},
        )

        self.assertTrue(decision.required)
        self.assertEqual(decision.risky_permissions, ["file_write"])

    def test_ask_first_pauses_for_standard_risky_capability_permissions(self) -> None:
        definition = ActionDefinition(
            actionKey="memory_delivery_writer",
            name="Memory Delivery Writer",
            permissions=["memory_write", "external_delivery", "cost"],
            runtimeReady=True,
            runtimeRegistered=True,
        )

        decision = should_pause_for_action_permission_approval(
            state={"metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="memory_delivery_writer",
            action_definition=definition,
        )

        self.assertTrue(decision.required)
        self.assertEqual(decision.risky_permissions, ["memory_write", "cost", "external_delivery"])

    def test_pending_permission_approval_is_consumed_once_for_matching_action(self) -> None:
        pending = build_pending_permission_approval(
            state={"run_id": "run-1", "metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_name="Local Workspace Executor",
            binding_source="capability_state",
            permissions=["file_write"],
            inputs={"operation": "write", "path": "action/user/demo/ACTION.md"},
        )
        state = {
            "metadata": {
                "pending_permission_approval": pending,
                "pending_permission_approval_resume_payload": {},
            },
            "permission_approvals": [],
        }

        consumed = consume_pending_permission_approval(
            state,
            node_name="execute_capability",
            action_key="local_workspace_executor",
            binding_source="capability_state",
        )

        self.assertIsNotNone(consumed)
        self.assertEqual(consumed["inputs"], {"operation": "write", "path": "action/user/demo/ACTION.md"})
        self.assertNotIn("pending_permission_approval", state["metadata"])
        self.assertEqual(state["permission_approvals"][0]["status"], "approved")

        self.assertIsNone(
            consume_pending_permission_approval(
                state,
                node_name="execute_capability",
                action_key="local_workspace_executor",
                binding_source="capability_state",
            )
        )

    def test_pending_permission_approval_input_preview_redacts_secret_values(self) -> None:
        secret_value = "sk-previewsecretvalue1234567890"

        pending = build_pending_permission_approval(
            state={"run_id": "run-1", "metadata": {"graph_permission_mode": "ask_first"}},
            node_name="execute_capability",
            action_key="local_workspace_executor",
            action_name="Local Workspace Executor",
            binding_source="capability_state",
            permissions=["file_write"],
            inputs={"operation": "write", "content": f"OPENAI_API_KEY={secret_value}"},
        )

        self.assertEqual(pending["inputs"]["content"], f"OPENAI_API_KEY={secret_value}")
        self.assertNotIn(secret_value, pending["input_preview"])
        self.assertIn("[REDACTED_SECRET]", pending["input_preview"])


if __name__ == "__main__":
    unittest.main()
