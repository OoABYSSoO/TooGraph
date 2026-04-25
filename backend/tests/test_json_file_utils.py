from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.json_file_utils import write_json_file


class JsonFileUtilsTests(unittest.TestCase):
    def test_write_json_file_retries_permission_errors_from_atomic_replace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = Path(temp_dir) / "run.json"
            path_type = type(target_path)
            original_replace = path_type.replace
            attempts = 0

            def flaky_replace(self: Path, target: Path) -> Path:
                nonlocal attempts
                attempts += 1
                if attempts == 1:
                    raise PermissionError("target file is temporarily locked")
                return original_replace(self, target)

            with patch.object(path_type, "replace", flaky_replace):
                write_json_file(target_path, {"run_id": "run_1", "status": "completed"})

            self.assertEqual(attempts, 2)
            self.assertEqual(json.loads(target_path.read_text(encoding="utf-8")), {"run_id": "run_1", "status": "completed"})


if __name__ == "__main__":
    unittest.main()
