from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
EXECUTOR_SKILL_DIR = REPO_ROOT / "skill" / "official" / "local_workspace_executor"
EXECUTOR_MANIFEST_PATH = EXECUTOR_SKILL_DIR / "skill.json"
EXECUTOR_BEFORE_LLM_PATH = EXECUTOR_SKILL_DIR / "before_llm.py"
EXECUTOR_AFTER_LLM_PATH = EXECUTOR_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object], *, repo_root: Path) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        env={**os.environ, "TOOGRAPH_REPO_ROOT": str(repo_root)},
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class LocalWorkspaceExecutorSkillTests(unittest.TestCase):
    def test_manifest_exposes_workspace_executor_contract(self) -> None:
        definition = _parse_native_skill_manifest(EXECUTOR_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "local_workspace_executor")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertEqual(definition.permissions, ["file_read", "file_write", "subprocess"])
        self.assertFalse(definition.capability_policy.default.requires_approval)
        self.assertEqual(
            [field.key for field in definition.input_schema],
            ["path", "operation", "content", "query"],
        )
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["success", "result"],
        )

    def test_before_llm_injects_policy_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = _run_skill_script(EXECUTOR_BEFORE_LLM_PATH, {}, repo_root=Path(temp_dir))

        context = str(payload.get("context") or "")
        self.assertIn("backend/data", context)
        self.assertIn("write", context)
        self.assertIn("execute", context)

    def test_before_llm_reads_existing_repository_file_context(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            target = repo_root / "docs" / "note.md"
            target.parent.mkdir(parents=True)
            target.write_text("existing context", encoding="utf-8")
            payload = _run_skill_script(
                EXECUTOR_BEFORE_LLM_PATH,
                {
                    "graph_state": {
                        "target_path": "docs/note.md",
                        "operation": "write",
                    }
                },
                repo_root=repo_root,
            )

        context = str(payload.get("context") or "")
        self.assertIn("docs/note.md", context)
        self.assertIn("existing context", context)

    def test_before_llm_reports_missing_path_as_write_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            payload = _run_skill_script(
                EXECUTOR_BEFORE_LLM_PATH,
                {
                    "graph_state": {
                        "target_path": "backend/data/tmp/new.txt",
                        "operation": "execute",
                    }
                },
                repo_root=repo_root,
            )

        context = str(payload.get("context") or "")
        self.assertIn("backend/data/tmp/new.txt", context)
        self.assertIn("only write can create it", context)

    def test_write_and_read_use_success_result_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "backend" / "data").mkdir(parents=True)
            write_result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "backend/data/tmp/note.txt",
                    "operation": "write",
                    "content": "hello workspace",
                },
                repo_root=repo_root,
            )
            read_result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "backend/data/tmp/note.txt",
                    "operation": "read",
                },
                repo_root=repo_root,
            )

        self.assertEqual(write_result["success"], True)
        self.assertEqual(write_result["result"], "Wrote `backend/data/tmp/note.txt` (15 characters).")
        self.assertEqual(write_result["activity_events"][0]["kind"], "file_write")
        self.assertEqual(write_result["activity_events"][0]["summary"], "Editing backend/data/tmp/note.txt +1 -0")
        self.assertEqual(write_result["activity_events"][0]["detail"]["path"], "backend/data/tmp/note.txt")
        self.assertTrue(read_result["success"])
        self.assertIn("hello workspace", str(read_result["result"]))
        self.assertEqual(read_result["activity_events"][0]["kind"], "file_read")
        self.assertEqual(read_result["activity_events"][0]["detail"]["characters"], len("hello workspace"))

    def test_list_directory_returns_file_list_activity_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            docs = repo_root / "docs"
            nested = docs / "notes"
            nested.mkdir(parents=True)
            (docs / "README.md").write_text("root doc", encoding="utf-8")
            (nested / "MEMORY.md").write_text("nested doc", encoding="utf-8")
            (repo_root / ".git").mkdir()
            (repo_root / ".git" / "config").write_text("secret", encoding="utf-8")

            result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "docs",
                    "operation": "list",
                },
                repo_root=repo_root,
            )

        self.assertEqual(result["success"], True)
        self.assertIn("docs/README.md", str(result["result"]))
        self.assertIn("docs/notes/MEMORY.md", str(result["result"]))
        self.assertNotIn(".git/config", str(result["result"]))
        event = result["activity_events"][0]
        self.assertEqual(event["kind"], "file_list")
        self.assertEqual(event["summary"], "Listed docs (2 entries, skipped 0).")
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["detail"]["path"], "docs")
        self.assertEqual(event["detail"]["entry_count"], 2)
        self.assertEqual(event["detail"]["skipped_count"], 0)

    def test_search_directory_returns_file_search_activity_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            docs = repo_root / "docs"
            docs.mkdir(parents=True)
            (docs / "alpha.md").write_text("needle one\nsecond line\n", encoding="utf-8")
            (docs / "beta.md").write_text("no match\n", encoding="utf-8")
            (docs / "binary.bin").write_bytes(b"\x00\x01\x02")

            result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "docs",
                    "operation": "search",
                    "query": "needle",
                },
                repo_root=repo_root,
            )

        self.assertEqual(result["success"], True)
        self.assertIn("docs/alpha.md:1", str(result["result"]))
        self.assertNotIn("docs/beta.md", str(result["result"]))
        event = result["activity_events"][0]
        self.assertEqual(event["kind"], "file_search")
        self.assertEqual(event["summary"], "Searched docs for `needle` (1 match, skipped 1).")
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["detail"]["path"], "docs")
        self.assertEqual(event["detail"]["query"], "needle")
        self.assertEqual(event["detail"]["match_count"], 1)
        self.assertEqual(event["detail"]["skipped_count"], 1)

    def test_write_outside_backend_data_is_denied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "docs").mkdir(parents=True)
            result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "docs/unsafe.md",
                    "operation": "write",
                    "content": "nope",
                },
                repo_root=repo_root,
            )

        self.assertEqual(result["success"], False)
        self.assertIn("permission_denied", str(result["result"]))
        self.assertFalse((repo_root / "docs" / "unsafe.md").exists())

    def test_execute_script_is_allowed_under_backend_data_tmp(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            script_path = repo_root / "backend" / "data" / "tmp" / "hello.py"
            script_path.parent.mkdir(parents=True)
            script_path.write_text(
                "print('hello workspace')\n",
                encoding="utf-8",
            )
            result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "backend/data/tmp/hello.py",
                    "operation": "execute",
                },
                repo_root=repo_root,
            )

        self.assertEqual(result["success"], True)
        self.assertIn("exit code 0", str(result["result"]))
        self.assertIn("hello workspace", str(result["result"]))
        self.assertEqual(result["activity_events"][0]["kind"], "command")
        self.assertEqual(result["activity_events"][0]["status"], "succeeded")
        self.assertEqual(result["activity_events"][0]["detail"]["exit_code"], 0)

    def test_execute_outside_execute_roots_is_denied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            script_path = repo_root / "docs" / "tool.py"
            script_path.parent.mkdir(parents=True)
            script_path.write_text("print('nope')\n", encoding="utf-8")
            result = _run_skill_script(
                EXECUTOR_AFTER_LLM_PATH,
                {
                    "path": "docs/tool.py",
                    "operation": "execute",
                },
                repo_root=repo_root,
            )

        self.assertEqual(result["success"], False)
        self.assertIn("permission_denied", str(result["result"]))


if __name__ == "__main__":
    unittest.main()
