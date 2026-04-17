from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import NodeSystemConditionConfig, NodeSystemInputConfig, NodeSystemStateDefinition


class NodeSystemSchemaLegacyFieldRejectionTests(unittest.TestCase):
    def test_state_definition_rejects_default_value_alias(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemStateDefinition.model_validate(
                {
                    "name": "Question",
                    "type": "text",
                    "defaultValue": "legacy",
                }
            )

    def test_input_config_rejects_default_value_alias(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemInputConfig.model_validate(
                {
                    "defaultValue": "legacy",
                }
            )

    def test_condition_config_rejects_condition_mode(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemConditionConfig.model_validate(
                {
                    "branches": ["continue", "retry"],
                    "conditionMode": "rule",
                    "branchMapping": {
                        "true": "continue",
                        "false": "retry",
                    },
                    "rule": {
                        "source": "result",
                        "operator": "exists",
                        "value": None,
                    },
                }
            )

    def test_condition_config_accepts_loop_limit(self) -> None:
        config = NodeSystemConditionConfig.model_validate(
            {
                "branches": ["continue", "retry"],
                "loopLimit": 5,
                "branchMapping": {
                    "true": "continue",
                    "false": "retry",
                },
                "rule": {
                    "source": "counter",
                    "operator": "<",
                    "value": 3,
                },
            }
        )

        self.assertEqual(config.loop_limit, 5)


if __name__ == "__main__":
    unittest.main()
