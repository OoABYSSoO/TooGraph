from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import (
    NodeSystemConditionConfig,
    NodeSystemGraphDocument,
    NodeSystemInputConfig,
    NodeSystemStateDefinition,
)


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

    def test_input_config_preserves_virtual_boundary_type(self) -> None:
        config = NodeSystemInputConfig.model_validate(
            {
                "value": "",
                "boundaryType": "video",
            }
        )

        self.assertEqual(config.boundary_type.value, "video")
        self.assertEqual(config.model_dump(by_alias=True)["boundaryType"], "video")

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

    def test_condition_config_accepts_configurable_loop_limit(self) -> None:
        config = NodeSystemConditionConfig.model_validate(
            {
                "branches": ["true", "false", "exhausted"],
                "loopLimit": 8,
                "branchMapping": {
                    "true": "true",
                    "false": "false",
                },
                "rule": {
                    "source": "counter",
                    "operator": "<",
                    "value": 3,
                },
            }
        )

        self.assertEqual(config.loop_limit, 8)

    def test_condition_config_rejects_invalid_loop_limits_and_custom_branch_shapes(self) -> None:
        default_config = NodeSystemConditionConfig.model_validate(
            {
                "rule": {
                    "source": "counter",
                    "operator": "exists",
                    "value": None,
                },
            }
        )

        self.assertEqual(default_config.loop_limit, 5)
        self.assertEqual(default_config.branches, ["true", "false", "exhausted"])
        self.assertEqual(default_config.branch_mapping, {"true": "true", "false": "false"})

        for loop_limit in (-1, 0, 11):
            with self.subTest(loop_limit=loop_limit):
                with self.assertRaises(ValidationError):
                    NodeSystemConditionConfig.model_validate(
                        {
                            "branches": ["true", "false", "exhausted"],
                            "loopLimit": loop_limit,
                            "branchMapping": {
                                "true": "true",
                                "false": "false",
                            },
                            "rule": {
                                "source": "counter",
                                "operator": "exists",
                                "value": None,
                            },
                        }
                    )

        with self.assertRaises(ValidationError):
            NodeSystemConditionConfig.model_validate(
                {
                    "branches": ["continue", "retry"],
                    "loopLimit": 5,
                    "branchMapping": {
                        "true": "continue",
                        "false": "retry",
                    },
                    "rule": {
                        "source": "counter",
                        "operator": "exists",
                        "value": None,
                    },
                }
            )


if __name__ == "__main__":
    unittest.main()
