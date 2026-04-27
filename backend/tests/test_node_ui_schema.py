import pytest
from pydantic import ValidationError

from app.core.schemas.node_system import NodeSystemGraphPayload


def test_node_ui_accepts_single_size_field() -> None:
    graph = NodeSystemGraphPayload.model_validate(
        {
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
                    "ui": {
                        "position": {"x": 0, "y": 0},
                        "collapsed": False,
                        "size": {"width": 520, "height": 360},
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

    assert graph.nodes["input_value"].ui.size is not None
    assert graph.nodes["input_value"].ui.size.width == 520
    assert graph.nodes["input_value"].ui.size.height == 360


def test_node_ui_rejects_invalid_size_field() -> None:
    with pytest.raises(ValidationError):
        NodeSystemGraphPayload.model_validate(
            {
                "name": "Invalid UI",
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
                            "size": {"width": 0, "height": 360},
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
