from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.runtime.node_handlers import execute_condition_node
from app.core.schemas.node_system import NodeSystemConditionNode, NodeSystemGraphDocument


def _condition_graph(*, state_type: str, operator: str, value: object) -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph-1",
            "name": "Condition Type Graph",
            "state_schema": {
                "gate_value": {"type": state_type, "value": False if state_type == "boolean" else 0},
                "true_output": {"type": "text", "value": ""},
                "false_output": {"type": "text", "value": ""},
                "exhausted_output": {"type": "text", "value": ""},
            },
            "nodes": {
                "input_gate": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "gate_value"}],
                },
                "gate": {
                    "kind": "condition",
                    "ui": {"position": {"x": 200, "y": 0}},
                    "reads": [{"state": "gate_value", "required": True}],
                    "config": {
                        "branches": ["true", "false", "exhausted"],
                        "loopLimit": 5,
                        "branchMapping": {"true": "true", "false": "false"},
                        "rule": {"source": "gate_value", "operator": operator, "value": value},
                    },
                },
                "true_node": {
                    "kind": "output",
                    "ui": {"position": {"x": 420, "y": -80}},
                    "reads": [{"state": "true_output"}],
                },
                "false_node": {
                    "kind": "output",
                    "ui": {"position": {"x": 420, "y": 0}},
                    "reads": [{"state": "false_output"}],
                },
                "exhausted_node": {
                    "kind": "output",
                    "ui": {"position": {"x": 420, "y": 80}},
                    "reads": [{"state": "exhausted_output"}],
                },
            },
            "edges": [{"source": "input_gate", "target": "gate"}],
            "conditional_edges": [
                {
                    "source": "gate",
                    "branches": {
                        "true": "true_node",
                        "false": "false_node",
                        "exhausted": "exhausted_node",
                    },
                }
            ],
        }
    )


class ConditionTypeConstraintTests(unittest.TestCase):
    def test_validator_rejects_non_boolean_value_for_boolean_condition_source(self) -> None:
        graph = _condition_graph(state_type="boolean", operator="==", value="true")

        validation = validate_graph(graph)

        self.assertIn("condition_rule_value_type_mismatch", [issue.code for issue in validation.issues])

    def test_validator_rejects_non_number_value_for_number_condition_source(self) -> None:
        graph = _condition_graph(state_type="number", operator=">=", value="60")

        validation = validate_graph(graph)

        self.assertIn("condition_rule_value_type_mismatch", [issue.code for issue in validation.issues])

    def test_validator_accepts_boolean_and_number_condition_values(self) -> None:
        boolean_validation = validate_graph(_condition_graph(state_type="boolean", operator="==", value=True))
        number_validation = validate_graph(_condition_graph(state_type="number", operator=">=", value=60))

        self.assertNotIn("condition_rule_value_type_mismatch", [issue.code for issue in boolean_validation.issues])
        self.assertNotIn("condition_rule_value_type_mismatch", [issue.code for issue in number_validation.issues])

    def test_runtime_rejects_invalid_typed_condition_value(self) -> None:
        node = NodeSystemConditionNode.model_validate(
            {
                "kind": "condition",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "score", "required": True}],
                "config": {
                    "branches": ["true", "false", "exhausted"],
                    "loopLimit": 5,
                    "branchMapping": {"true": "true", "false": "false"},
                    "rule": {"source": "score", "operator": ">=", "value": "60"},
                },
            }
        )

        with self.assertRaisesRegex(ValueError, "number"):
            execute_condition_node(
                node,
                {"score": 75},
                {
                    "state": {"score": 75},
                    "state_schema": {"score": {"type": "number"}},
                },
            )


if __name__ == "__main__":
    unittest.main()
