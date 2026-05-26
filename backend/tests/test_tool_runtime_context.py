from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.node_handlers import execute_tool_node
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemToolNode


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


if __name__ == "__main__":
    unittest.main()
