from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class OpenAiCompatibleMigrationWrapperTests(unittest.TestCase):
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

    def test_lm_core0_wrapper_prints_openai_compatible_provider_guidance(self) -> None:
        result = self._run_python_script("scripts/lm_core0.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("OpenAI-compatible", combined_output)
        self.assertIn("LOCAL_BASE_URL=http://127.0.0.1:8000/v1", combined_output)
        self.assertIn("LOCAL_TEXT_MODEL=<model name exposed by your gateway>", combined_output)

    def test_download_gemma_wrapper_points_to_gateway_model_manager(self) -> None:
        result = self._run_python_script("scripts/download_Gemma_gguf.py")
        combined_output = f"{result.stdout}\n{result.stderr}"

        self.assertEqual(result.returncode, 1)
        self.assertIn("model manager for your OpenAI-compatible gateway", combined_output)
        self.assertIn("LOCAL_BASE_URL=http://127.0.0.1:8000/v1", combined_output)

    def test_lm_server_wrapper_static_contract_points_to_custom_provider(self) -> None:
        script_text = self._read_script_text("scripts/lm-server")

        self.assertIn("#!/usr/bin/env bash", script_text)
        self.assertIn("OpenAI-compatible local or private gateway", script_text)
        self.assertIn("LOCAL_BASE_URL=http://127.0.0.1:8000/v1", script_text)
        self.assertIn("LOCAL_API_KEY=<optional api key>", script_text)
        self.assertIn("exit 1", script_text)


if __name__ == "__main__":
    unittest.main()
