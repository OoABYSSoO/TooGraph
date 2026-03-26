from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.templates.loader import list_template_records


class TemplateLayoutTests(unittest.TestCase):
    def test_builtin_template_registry_is_empty_for_manual_rebuild(self) -> None:
        self.assertEqual(list_template_records(), [])


if __name__ == "__main__":
    unittest.main()
