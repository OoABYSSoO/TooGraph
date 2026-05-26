from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime import node_handlers
from app.core.schemas.node_system import NodeSystemGraphDocument


def _tool_definition(tool_key: str):
    from app.core.schemas.tools import ToolDefinition, ToolIoField

    return ToolDefinition(
        toolKey=tool_key,
        name="JSON Passthrough",
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        runtimeReady=True,
        runtimeRegistered=True,
    )


def _tool_graph() -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph-1",
            "name": "Tool Graph",
            "state_schema": {
                "source": {"type": "json", "value": {"ok": True}},
                "result": {
                    "type": "json",
                    "binding": {
                        "kind": "tool_output",
                        "toolKey": "json_passthrough",
                        "nodeId": "passthrough",
                        "fieldKey": "result",
                        "managed": True,
                    },
                },
            },
            "nodes": {
                "passthrough": {
                    "kind": "tool",
                    "name": "JSON Passthrough",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [
                        {
                            "state": "source",
                            "required": True,
                            "binding": {
                                "kind": "tool_input",
                                "toolKey": "json_passthrough",
                                "fieldKey": "value",
                                "managed": True,
                            },
                        }
                    ],
                    "writes": [{"state": "result"}],
                    "config": {"toolKey": "json_passthrough"},
                }
            },
            "edges": [],
            "conditional_edges": [],
        }
    )


class ToolNodeRuntimeTests(unittest.TestCase):
    def test_execute_tool_node_invokes_tool_and_maps_outputs(self) -> None:
        execute_tool_node = getattr(node_handlers, "execute_tool_node", None)
        self.assertIsNotNone(execute_tool_node, "Tool nodes need a deterministic runtime handler.")
        graph = _tool_graph()
        node = graph.nodes["passthrough"]
        calls: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []

        def run_tool(tool_func: object, tool_inputs: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            calls.append({"inputs": tool_inputs, "kwargs": kwargs})
            return {"status": "succeeded", "result": {"echo": tool_inputs["value"]}}

        result = execute_tool_node(
            graph.state_schema,
            node,
            {"source": {"ok": True}},
            {"state": {"source": {"ok": True}}},
            node_name="passthrough",
            state={"run_id": "run-1"},
            get_tool_registry_func=lambda *, include_disabled: {"json_passthrough": object()},
            get_tool_definition_registry_func=lambda *, include_disabled: {
                "json_passthrough": _tool_definition("json_passthrough")
            },
            invoke_tool_func=run_tool,
            record_activity_event_func=lambda state, **event: events.append(event) or event,
        )

        self.assertEqual(calls[0]["inputs"], {"value": {"ok": True}})
        self.assertIn("context", calls[0]["kwargs"])
        self.assertEqual(result["outputs"], {"result": {"echo": {"ok": True}}})
        self.assertEqual(result["selected_tools"], ["json_passthrough"])
        self.assertEqual(result["tool_outputs"][0]["node_id"], "passthrough")
        self.assertEqual(result["tool_outputs"][0]["tool_key"], "json_passthrough")
        self.assertEqual(result["tool_outputs"][0]["state_writes"], {"result": {"echo": {"ok": True}}})
        self.assertEqual(events[0]["kind"], "tool_invocation")


if __name__ == "__main__":
    unittest.main()
