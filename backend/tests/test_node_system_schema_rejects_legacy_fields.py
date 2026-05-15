from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import (
    NodeSystemAgentConfig,
    NodeSystemConditionConfig,
    NodeSystemGraphDocument,
    NodeSystemInputConfig,
    NodeSystemOutputConfig,
    NodeSystemReadBinding,
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

    def test_state_definition_and_output_config_accept_html_rendering(self) -> None:
        definition = NodeSystemStateDefinition.model_validate(
            {
                "name": "Rendered Page",
                "type": "html",
                "value": "<!doctype html><html><body><h1>Hi</h1></body></html>",
            }
        )
        config = NodeSystemOutputConfig.model_validate({"displayMode": "html"})

        self.assertEqual(definition.type.value, "html")
        self.assertEqual(config.display_mode.value, "html")

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

    def test_agent_config_preserves_suspended_free_writes(self) -> None:
        config = NodeSystemAgentConfig.model_validate(
            {
                "skillKey": "web_search",
                "suspendedFreeWrites": [
                    {"state": "free_answer", "mode": "replace"},
                    {"state": "free_notes", "mode": "append"},
                ],
            }
        )

        self.assertEqual([binding.state for binding in config.suspended_free_writes], ["free_answer", "free_notes"])
        self.assertEqual(config.model_dump(by_alias=True)["suspendedFreeWrites"][1]["mode"].value, "append")

    def test_state_definition_accepts_managed_capability_result_binding(self) -> None:
        definition = NodeSystemStateDefinition.model_validate(
            {
                "name": "Capability Result",
                "type": "result_package",
                "binding": {
                    "kind": "capability_result",
                    "nodeId": "executor",
                    "fieldKey": "result_package",
                    "managed": True,
                },
            }
        )

        dumped = definition.model_dump(by_alias=True)
        self.assertEqual(dumped["binding"]["kind"].value, "capability_result")
        self.assertEqual(dumped["binding"]["nodeId"], "executor")
        self.assertEqual(dumped["binding"]["fieldKey"], "result_package")
        self.assertEqual(dumped["binding"]["skillKey"], "")

    def test_read_binding_accepts_managed_skill_input_binding(self) -> None:
        binding = NodeSystemReadBinding.model_validate(
            {
                "state": "user_question",
                "required": True,
                "binding": {
                    "kind": "skill_input",
                    "skillKey": "web_search",
                    "fieldKey": "user_question",
                    "managed": True,
                },
            }
        )

        dumped = binding.model_dump(by_alias=True)
        self.assertEqual(dumped["binding"]["kind"].value, "skill_input")
        self.assertEqual(dumped["binding"]["skillKey"], "web_search")
        self.assertEqual(dumped["binding"]["fieldKey"], "user_question")

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
