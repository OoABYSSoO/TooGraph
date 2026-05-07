from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


LOCAL_EXECUTOR_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "local_workspace_executor" / "run.py"


def _load_local_executor_module():
    spec = importlib.util.spec_from_file_location("graphiteui_local_workspace_executor_test", LOCAL_EXECUTOR_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load local_workspace_executor skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LocalWorkspaceExecutorSkillTests(unittest.TestCase):
    def test_write_file_allows_backend_data_paths_and_reports_changed_path(self) -> None:
        local_executor = _load_local_executor_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = local_executor.local_workspace_executor(
                    action="write_file",
                    path="backend/data/tmp/generated.txt",
                    content="hello from executor",
                )

            self.assertEqual(result["status"], "succeeded")
            self.assertEqual(result["changed_paths"], ["backend/data/tmp/generated.txt"])
            self.assertEqual((repo_root / "backend/data/tmp/generated.txt").read_text(encoding="utf-8"), "hello from executor")

    def test_write_file_blocks_paths_outside_write_whitelist_with_policy_suggestion(self) -> None:
        local_executor = _load_local_executor_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = local_executor.local_workspace_executor(
                    action="write_file",
                    path="src/generated.txt",
                    content="blocked",
                )

            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["blocked_operation"], "write")
            self.assertEqual(result["blocked_path"], "src/generated.txt")
            self.assertEqual(result["suggested_policy_update"]["kind"], "write")
            self.assertEqual(result["suggested_policy_update"]["path"], "src")
            self.assertFalse((repo_root / "src/generated.txt").exists())

    def test_write_file_blocks_protected_policy_directory_even_inside_backend_data(self) -> None:
        local_executor = _load_local_executor_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = local_executor.local_workspace_executor(
                    action="write_file",
                    path="backend/data/settings/security/local_executor_policy.json",
                    content="{}",
                )

            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["blocked_operation"], "write")
            self.assertIn("protected", " ".join(result["errors"]))
            self.assertFalse((repo_root / "backend/data/settings/security/local_executor_policy.json").exists())

    def test_run_command_allows_python_in_backend_data_tmp(self) -> None:
        local_executor = _load_local_executor_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            script = repo_root / "backend/data/tmp/probe.py"
            script.parent.mkdir(parents=True)
            script.write_text("import json\nprint(json.dumps({'ok': True}))\n", encoding="utf-8")
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = local_executor.local_workspace_executor(
                    action="run_command",
                    cwd="backend/data/tmp",
                    command=[sys.executable, "probe.py"],
                    timeout_seconds=5,
                )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(json.loads(result["stdout"]), {"ok": True})
        self.assertTrue(result["warnings"])

    def test_run_command_blocks_inline_shell_execution(self) -> None:
        local_executor = _load_local_executor_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "backend/data/tmp").mkdir(parents=True)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = local_executor.local_workspace_executor(
                    action="run_command",
                    cwd="backend/data/tmp",
                    command=[sys.executable, "-c", "print('inline')"],
                    timeout_seconds=5,
                )

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["blocked_operation"], "execute")
        self.assertIn("Inline command execution", " ".join(result["errors"]))


if __name__ == "__main__":
    unittest.main()
