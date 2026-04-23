from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class EzllmMigrationWrapperTests(unittest.TestCase):
    def _run_python_script(self, relative_path: str) -> subprocess.CompletedProcess[str]:
        script_path = REPO_ROOT / relative_path
        return subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            check=False,
        )

    def test_lm_core0_wrapper_prints_ezllm_migration_instructions(self) -> None:
        result = self._run_python_script("scripts/lm_core0.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("EZLLM", combined_output)
        self.assertIn("pipx install ezllm", combined_output)

    def test_download_gemma_wrapper_points_to_ezllm_models_download(self) -> None:
        result = self._run_python_script("scripts/download_Gemma_gguf.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("EZLLM", combined_output)
        self.assertIn("ezllm models download", combined_output)


if __name__ == "__main__":
    unittest.main()
