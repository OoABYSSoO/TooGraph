from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import NodeSystemConditionConfig


class ConditionProtocolTests(unittest.TestCase):
    def test_condition_config_defaults_to_fixed_three_branch_protocol(self) -> None:
        config = NodeSystemConditionConfig.model_validate({})

        self.assertEqual(config.branches, ["true", "false", "exhausted"])
        self.assertEqual(config.loop_limit, 5)
        self.assertEqual(config.branch_mapping, {"true": "true", "false": "false"})

    def test_condition_config_rejects_custom_branch_shape(self) -> None:
        with self.assertRaises(ValidationError):
            NodeSystemConditionConfig.model_validate(
                {
                    "branches": ["supplement", "finalize", "exhausted"],
                    "loopLimit": 5,
                    "branchMapping": {"true": "supplement", "false": "finalize"},
                }
            )

    def test_condition_config_accepts_custom_loop_limit(self) -> None:
        config = NodeSystemConditionConfig.model_validate({"loopLimit": 7})

        self.assertEqual(config.loop_limit, 7)
        self.assertEqual(config.branches, ["true", "false", "exhausted"])
        self.assertEqual(config.branch_mapping, {"true": "true", "false": "false"})

    def test_condition_config_rejects_out_of_range_loop_limits(self) -> None:
        for loop_limit in (-1, 0, 11):
            with self.subTest(loop_limit=loop_limit):
                with self.assertRaises(ValidationError):
                    NodeSystemConditionConfig.model_validate({"loopLimit": loop_limit})


if __name__ == "__main__":
    unittest.main()
