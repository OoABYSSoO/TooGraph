from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.schemas.node_system import NodeSystemGraphDocument


def _tool_definition(tool_key: str):
    from app.core.schemas.tools import ToolDefinition, ToolIoField

    return ToolDefinition(
        toolKey=tool_key,
        name=tool_key,
        runtime={"type": "python", "entrypoint": "run.py"},
        inputSchema=[ToolIoField(key="value", name="Value", valueType="json")],
        outputSchema=[ToolIoField(key="result", name="Result", valueType="json")],
        runtimeReady=True,
        runtimeRegistered=True,
    )


def _tool_graph(*, tool_key: str = "json_passthrough", output_binding: dict | None = None) -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph-1",
            "name": "Tool Graph",
            "state_schema": {
                "source": {"type": "json", "value": {"ok": True}},
                "result": {
                    "type": "json",
                    "value": None,
                    "binding": output_binding
                    if output_binding is not None
                    else {
                        "kind": "tool_output",
                        "toolKey": tool_key,
                        "nodeId": "passthrough",
                        "fieldKey": "result",
                        "managed": True,
                    },
                },
            },
            "nodes": {
                "input": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "source"}],
                },
                "passthrough": {
                    "kind": "tool",
                    "ui": {"position": {"x": 200, "y": 0}},
                    "reads": [
                        {
                            "state": "source",
                            "required": True,
                            "binding": {
                                "kind": "tool_input",
                                "toolKey": tool_key,
                                "fieldKey": "value",
                                "managed": True,
                            },
                        }
                    ],
                    "writes": [{"state": "result"}],
                    "config": {"toolKey": tool_key},
                },
            },
            "edges": [{"source": "input", "target": "passthrough"}],
            "conditional_edges": [],
        }
    )


class NodeSystemValidatorToolTests(unittest.TestCase):
    def test_registered_tool_node_with_managed_bindings_is_valid(self) -> None:
        graph = _tool_graph()
        definition = _tool_definition("json_passthrough")

        with (
            patch("app.core.compiler.validator.get_tool_registry", return_value={"json_passthrough": object()}),
            patch("app.core.compiler.validator.get_tool_catalog_registry", return_value={"json_passthrough": definition}),
        ):
            validation = validate_graph(graph)

        self.assertEqual([], validation.issues)
        self.assertTrue(validation.valid)

    def test_tool_node_rejects_unknown_runtime_tool(self) -> None:
        graph = _tool_graph(tool_key="missing_tool")

        with (
            patch("app.core.compiler.validator.get_tool_registry", return_value={}),
            patch("app.core.compiler.validator.get_tool_catalog_registry", return_value={}),
        ):
            validation = validate_graph(graph)

        self.assertIn("tool_not_runtime_registered", [issue.code for issue in validation.issues])

    def test_tool_node_requires_managed_output_binding_for_each_write(self) -> None:
        graph = _tool_graph(output_binding=None)
        graph.state_schema["result"].binding = None
        definition = _tool_definition("json_passthrough")

        with (
            patch("app.core.compiler.validator.get_tool_registry", return_value={"json_passthrough": object()}),
            patch("app.core.compiler.validator.get_tool_catalog_registry", return_value={"json_passthrough": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("tool_output_binding_missing", [issue.code for issue in validation.issues])


if __name__ == "__main__":
    unittest.main()
