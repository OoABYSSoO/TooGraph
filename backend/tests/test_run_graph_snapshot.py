from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.templates.loader import list_template_records


class RunGraphSnapshotTests(unittest.TestCase):
    def test_snapshot_tests_no_longer_depend_on_builtin_templates(self) -> None:
        self.assertEqual(list_template_records(), [])


if __name__ == "__main__":
    unittest.main()
