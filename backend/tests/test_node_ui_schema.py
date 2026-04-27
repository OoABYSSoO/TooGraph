import pytest
from pydantic import ValidationError

from app.core.schemas.node_system import NodeSystemGraphPayload


def test_node_ui_rejects_legacy_size_fields() -> None:
    with pytest.raises(ValidationError):
        NodeSystemGraphPayload.model_validate(
        {
            "name": "Legacy UI",
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
                    "ui": {
                        "position": {"x": 0, "y": 0},
                        "collapsed": True,
                        "expandedSize": {"width": 320},
                        "collapsedSize": {"width": 160, "height": 48},
                    },
                    "reads": [],
                    "writes": [{"state": "value", "mode": "replace"}],
                    "config": {"value": ""},
                }
            },
            "edges": [],
            "conditional_edges": [],
            "metadata": {},
        }
    )
