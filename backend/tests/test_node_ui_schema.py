from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import NodeSystemGraphPayload


def _graph_payload(ui: dict[str, object]) -> dict[str, object]:
    return {
        "name": "Resizable UI",
        "state_schema": {
            "value": {
                "name": "value",
                "description": "",
                "type": "text",
                "value": "",
                "color": "",
            }
        },
        "nodes": {
            "input_value": {
                "kind": "input",
                "name": "Input",
                "description": "",
                "ui": ui,
                "reads": [],
                "writes": [{"state": "value", "mode": "replace"}],
                "config": {"value": ""},
            }
        },
        "edges": [],
        "conditional_edges": [],
        "metadata": {},
    }


class NodeUiSchemaTests(unittest.TestCase):
    def test_node_ui_accepts_single_size_field(self) -> None:
        graph = NodeSystemGraphPayload.model_validate(
            _graph_payload(
                {
                    "position": {"x": 0, "y": 0},
                    "collapsed": False,
                    "size": {"width": 520, "height": 360},
                }
            )
        )

        self.assertIsNotNone(graph.nodes["input_value"].ui.size)
        self.assertEqual(graph.nodes["input_value"].ui.size.width, 520)
        self.assertEqual(graph.nodes["input_value"].ui.size.height, 360)

    def test_node_ui_rejects_invalid_size_field(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemGraphPayload.model_validate(
                _graph_payload(
                    {
                        "position": {"x": 0, "y": 0},
                        "size": {"width": 0, "height": 360},
                    }
                )
            )

    def test_node_ui_rejects_legacy_size_fields(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemGraphPayload.model_validate(
                _graph_payload(
                    {
                        "position": {"x": 0, "y": 0},
                        "collapsed": True,
                        "expandedSize": {"width": 320},
                        "collapsedSize": {"width": 160, "height": 48},
                    }
                )
            )


if __name__ == "__main__":
    unittest.main()
