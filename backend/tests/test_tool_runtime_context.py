from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.node_handlers import execute_tool_node
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition, NodeSystemToolNode


class ToolRuntimeContextTests(unittest.TestCase):
    def test_tool_node_receives_graph_runtime_context_metadata(self) -> None:
        captured_contexts: list[dict] = []

        def invoke_tool_func(_tool_func, _tool_inputs, *, context=None):
            captured_contexts.append(context or {})
            return {
                "conversation_history": {
                    "kind": "context_assembly_ref",
                    "source_refs": [],
                }
            }

        node = NodeSystemToolNode.model_validate(
            {
                "kind": "tool",
                "name": "组装历史",
                "ui": {"position": {"x": 0, "y": 0}, "collapsed": False},
                "reads": [],
                "writes": [{"state": "conversation_history", "mode": "replace"}],
                "config": {"toolKey": "buddy_history_context_loader"},
            }
        )
        state_schema = {
            "conversation_history": NodeSystemStateDefinition.model_validate(
                {
                    "name": "会话历史引用",
                    "type": "json",
                    "value": {},
                    "binding": {
                        "kind": "tool_output",
                        "toolKey": "buddy_history_context_loader",
                        "nodeId": "load_history",
                        "fieldKey": "conversation_history",
                    },
                }
            )
        }

        execute_tool_node(
            state_schema,
            node,
            {},
            {
                "metadata": {
                    "runtime_context": {
                        "buddy_session_id": "session_runtime",
                        "buddy_current_message_id": "msg_current",
                    }
                }
            },
            node_name="load_history",
            state={"run_id": "run_1", "state_values": {}},
            get_tool_registry_func=lambda include_disabled=False: {"buddy_history_context_loader": object()},
            get_tool_definition_registry_func=lambda include_disabled=False: {},
            invoke_tool_func=invoke_tool_func,
        )

        self.assertEqual(
            captured_contexts[0]["runtime_context"],
            {
                "buddy_session_id": "session_runtime",
                "buddy_current_message_id": "msg_current",
            },
        )
        self.assertEqual(
            captured_contexts[0]["action_runtime_context"],
            {
                "buddy_session_id": "session_runtime",
                "buddy_current_message_id": "msg_current",
            },
        )

    def test_context_pressure_tool_collects_target_agent_context_without_input_ports(self) -> None:
        captured_inputs: list[dict] = []

        def invoke_tool_func(_tool_func, tool_inputs, *, context=None):
            captured_inputs.append(tool_inputs)
            return {
                "status": "succeeded",
                "needs_context_compaction": False,
                "context_budget_report": {},
            }

        tool_node = NodeSystemToolNode.model_validate(
            {
                "kind": "tool",
                "name": "上下文压力检查",
                "ui": {"position": {"x": 0, "y": 0}, "collapsed": False},
                "reads": [],
                "writes": [{"state": "needs_context_compaction", "mode": "replace"}],
                "config": {
                    "toolKey": "buddy_context_pressure_check",
                    "targetAgentNodeId": "reply_llm",
                },
            }
        )
        target_agent = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "回复",
                "description": "",
                "ui": {"position": {"x": 320, "y": 0}, "collapsed": False},
                "reads": [
                    {"state": "user_message", "required": True},
                    {"state": "conversation_history", "required": False},
                    {"state": "buddy_context", "required": False},
                ],
                "writes": [{"state": "public_response", "mode": "replace"}],
                "config": {
                    "taskInstruction": "Reply.",
                    "modelSource": "override",
                    "model": "openai/gpt-4.1",
                    "thinkingMode": "medium",
                    "temperature": 0.2,
                },
            }
        )
        state_schema = {
            "user_message": NodeSystemStateDefinition.model_validate(
                {"name": "用户消息", "type": "text", "value": "", "color": "#d97706"}
            ),
            "conversation_history": NodeSystemStateDefinition.model_validate(
                {"name": "会话历史", "type": "json", "value": {}, "color": "#2563eb"}
            ),
            "buddy_context": NodeSystemStateDefinition.model_validate(
                {"name": "Buddy Home", "type": "file", "value": "", "color": "#16a34a"}
            ),
            "needs_context_compaction": NodeSystemStateDefinition.model_validate(
                {"name": "需要压缩", "type": "boolean", "value": False, "color": "#0891b2"}
            ),
        }
        state = {
            "run_id": "run_1",
            "state_values": {
                "user_message": "请继续",
                "conversation_history": {"kind": "context_package", "items": []},
                "buddy_context": "home",
            },
        }

        with patch(
            "app.core.runtime.node_handlers.resolve_model_context_budget",
            return_value={
                "model_ref": "openai/gpt-4.1",
                "context_window_tokens": 128000,
                "max_output_tokens": None,
                "compression_threshold": 0.9,
            },
        ):
            execute_tool_node(
                state_schema,
                tool_node,
                {},
                {
                    "metadata": {},
                    "state": state["state_values"],
                    "state_schema": state_schema,
                    "nodes": {"reply_llm": target_agent},
                },
                node_name="check_context_pressure",
                state=state,
                get_tool_registry_func=lambda include_disabled=False: {"buddy_context_pressure_check": object()},
                get_tool_definition_registry_func=lambda include_disabled=False: {},
                invoke_tool_func=invoke_tool_func,
            )

        self.assertEqual(
            [item["state"] for item in captured_inputs[0]["context_items"]],
            ["user_message", "conversation_history", "buddy_context"],
        )
        self.assertEqual(captured_inputs[0]["target_agent_node_id"], "reply_llm")
        self.assertEqual(captured_inputs[0]["model_budget"]["context_window_tokens"], 128000)
        self.assertEqual(captured_inputs[0]["model_budget"]["compression_threshold"], 0.9)
        self.assertEqual(captured_inputs[0]["context_assembly_report"]["node_id"], "reply_llm")


if __name__ == "__main__":
    unittest.main()
