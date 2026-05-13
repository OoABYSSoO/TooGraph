from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.streaming_json_state_router import route_streaming_json_state_text


class StreamingJsonStateRouterTests(unittest.TestCase):
    def test_routes_partial_top_level_json_string_fields_by_state_key(self) -> None:
        self.assertEqual(
            route_streaming_json_state_text(
                '{"ja":"こんにちは","en":"Hel',
                ["ja", "en"],
            ),
            {
                "ja": {"text": "こんにちは", "completed": True},
                "en": {"text": "Hel", "completed": False},
            },
        )

    def test_ignores_nested_keys_and_non_string_values_until_final_state_write(self) -> None:
        self.assertEqual(
            route_streaming_json_state_text(
                '{"links":[{"title":"A"}],"answer":"Done',
                ["links", "answer"],
            ),
            {
                "answer": {"text": "Done", "completed": False},
            },
        )


if __name__ == "__main__":
    unittest.main()
