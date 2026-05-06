from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.input_boundary import coerce_input_boundary_value, first_truthy
from app.core.schemas.node_system import NodeSystemStateType


class RuntimeInputBoundaryTests(unittest.TestCase):
    def test_coerce_input_boundary_value_parses_structured_state_types(self) -> None:
        self.assertEqual(coerce_input_boundary_value("42", NodeSystemStateType.NUMBER), 42)
        self.assertEqual(coerce_input_boundary_value("true", NodeSystemStateType.BOOLEAN), True)
        self.assertEqual(coerce_input_boundary_value('{"items": [1]}', NodeSystemStateType.JSON), {"items": [1]})
        self.assertEqual(coerce_input_boundary_value("[1, 2]", NodeSystemStateType.JSON), [1, 2])
        self.assertEqual(
            coerce_input_boundary_value('[{"skillKey": "web_search"}]', NodeSystemStateType.SKILL),
            [{"skillKey": "web_search"}],
        )

    def test_coerce_input_boundary_value_preserves_text_and_knowledge_base_strings(self) -> None:
        self.assertEqual(coerce_input_boundary_value('{"text": "value"}', NodeSystemStateType.TEXT), '{"text": "value"}')
        self.assertEqual(coerce_input_boundary_value('{"kb": "docs"}', NodeSystemStateType.KNOWLEDGE_BASE), '{"kb": "docs"}')
        self.assertEqual(coerce_input_boundary_value("{invalid", NodeSystemStateType.JSON), "{invalid")

    def test_coerce_input_boundary_value_parses_uploaded_file_payloads_to_local_paths_for_file_types(self) -> None:
        payload = '{"kind": "uploaded_file", "name": "image.png", "localPath": "uploads/image.png"}'

        self.assertEqual(coerce_input_boundary_value(payload, NodeSystemStateType.IMAGE), "uploads/image.png")
        self.assertEqual(coerce_input_boundary_value(payload, NodeSystemStateType.FILE), "uploads/image.png")
        self.assertEqual(
            coerce_input_boundary_value(
                '[{"kind": "uploaded_file", "localPath": "uploads/a.md"}, "uploads/b.md"]',
                NodeSystemStateType.FILE,
            ),
            ["uploads/a.md", "uploads/b.md"],
        )
        self.assertEqual(
            coerce_input_boundary_value(
                '[{"kind": "uploaded_file", "localPath": "uploads/a.mp3"}, "uploads/b.wav"]',
                NodeSystemStateType.AUDIO,
            ),
            ["uploads/a.mp3", "uploads/b.wav"],
        )
        self.assertEqual(coerce_input_boundary_value(payload, NodeSystemStateType.TEXT), payload)

    def test_state_type_enum_omits_legacy_collection_and_object_types(self) -> None:
        values = {state_type.value for state_type in NodeSystemStateType}

        self.assertNotIn("object", values)
        self.assertNotIn("array", values)
        self.assertNotIn("file_list", values)

    def test_first_truthy_returns_first_truthy_value_or_none(self) -> None:
        self.assertEqual(first_truthy(["", 0, "answer", "later"]), "answer")
        self.assertIsNone(first_truthy(["", 0, None, []]))


if __name__ == "__main__":
    unittest.main()
