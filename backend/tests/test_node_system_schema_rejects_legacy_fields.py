from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import NodeSystemInputConfig, NodeSystemStateDefinition


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


if __name__ == "__main__":
    unittest.main()
