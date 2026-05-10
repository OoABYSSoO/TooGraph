from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class RetiredLocalRuntimeWrapperTests(unittest.TestCase):
    def _run_python_script(self, relative_path: str) -> subprocess.CompletedProcess[str]:
        script_path = REPO_ROOT / relative_path
        return subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            check=False,
        )

    def _read_script_text(self, relative_path: str) -> str:
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_lm_core0_wrapper_points_to_model_providers_page(self) -> None:
        result = self._run_python_script("scripts/lm_core0.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("Model Providers", combined_output)
        self.assertNotIn("LOCAL_BASE_URL", combined_output)
        self.assertNotIn("LOCAL_TEXT_MODEL", combined_output)

    def test_download_gemma_wrapper_points_to_model_providers_page(self) -> None:
        result = self._run_python_script("scripts/download_Gemma_gguf.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("Model Providers", combined_output)
        self.assertNotIn("LOCAL_BASE_URL", combined_output)

    def test_lm_server_wrapper_static_contract_points_to_model_providers_page(self) -> None:
        script_text = self._read_script_text("scripts/lm-server")

        self.assertIn("#!/usr/bin/env bash", script_text)
        self.assertIn("Model Providers", script_text)
        self.assertNotIn("LOCAL_BASE_URL", script_text)
        self.assertNotIn("LOCAL_API_KEY", script_text)
        self.assertIn("exit 1", script_text)


if __name__ == "__main__":
    unittest.main()
