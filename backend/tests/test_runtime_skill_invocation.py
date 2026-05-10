from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill
from app.skills import runtime as skill_runtime
from app.skills.runtime import ScriptSkillRunner


class RuntimeSkillInvocationTests(unittest.TestCase):
    def test_callable_accepts_keyword_detects_named_and_var_keyword_parameters(self) -> None:
        def accepts_named(*, on_delta=None):
            return on_delta

        def accepts_kwargs(**kwargs):
            return kwargs

        def rejects_keyword(value):
            return value

        self.assertTrue(callable_accepts_keyword(accepts_named, "on_delta"))
        self.assertTrue(callable_accepts_keyword(accepts_kwargs, "state_schema"))
        self.assertFalse(callable_accepts_keyword(rejects_keyword, "on_delta"))

    def test_invoke_skill_supports_context_and_input_signature(self) -> None:
        calls = []

        def skill(context, inputs):
            calls.append((context, inputs))
            return {"ok": inputs["question"]}

        result = invoke_skill(skill, {"question": "q"})

        self.assertEqual(result, {"ok": "q"})
        self.assertEqual(calls, [({}, {"question": "q"})])

    def test_invoke_skill_supports_keyword_input_signature(self) -> None:
        def skill(question):
            return {"ok": question}

        self.assertEqual(invoke_skill(skill, {"question": "q"}), {"ok": "q"})

    def test_script_skill_runner_invokes_entrypoint_inside_skill_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "echo"
            skill_dir.mkdir()
            entrypoint = skill_dir / "run.py"
            entrypoint.write_text(
                "\n".join(
                    [
                        "import json",
                        "import sys",
                        "payload = json.loads(sys.stdin.read() or '{}')",
                        "print(json.dumps({'status': 'succeeded', 'echo': payload['text']}))",
                    ]
                ),
                encoding="utf-8",
            )

            runner = ScriptSkillRunner(
                skill_key="echo",
                skill_dir=skill_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            self.assertEqual(invoke_skill(runner, {"text": "hello"}), {"status": "succeeded", "echo": "hello"})

    def test_script_skill_runner_passes_artifact_context_as_environment_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "artifact_echo"
            artifact_dir = Path(temp_dir) / "artifacts" / "run_1" / "writer" / "web_search" / "invocation_001"
            skill_dir.mkdir()
            entrypoint = skill_dir / "run.py"
            entrypoint.write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "import sys",
                        "payload = json.loads(sys.stdin.read() or '{}')",
                        "print(json.dumps({",
                        "  'status': 'succeeded',",
                        "  'payload_keys': sorted(payload.keys()),",
                        "  'artifact_dir': os.environ.get('GRAPHITE_SKILL_ARTIFACT_DIR'),",
                        "  'artifact_relative_dir': os.environ.get('GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR'),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )

            runner = ScriptSkillRunner(
                skill_key="artifact_echo",
                skill_dir=skill_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            result = invoke_skill(
                runner,
                {"text": "hello"},
                context={
                    "artifact_dir": str(artifact_dir),
                    "artifact_relative_dir": "run_1/writer/web_search/invocation_001",
                },
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["payload_keys"], ["text"])
        self.assertEqual(result["artifact_dir"], str(artifact_dir))
        self.assertEqual(result["artifact_relative_dir"], "run_1/writer/web_search/invocation_001")

    def test_script_skill_runner_uses_current_python_when_requirements_are_satisfied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "current_env"
            skill_dir.mkdir()
            (skill_dir / "requirements.txt").write_text("pytest>=8,<10\n", encoding="utf-8")
            (skill_dir / "run.py").write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "import sys",
                        "print(json.dumps({",
                        "  'status': 'succeeded',",
                        "  'python': sys.executable,",
                        "  'venv': os.environ.get('GRAPHITE_SKILL_VENV', ''),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )

            runner = ScriptSkillRunner(
                skill_key="current_env",
                skill_dir=skill_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            result = invoke_skill(runner, {})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["python"], sys.executable)
        self.assertEqual(result["venv"], "")

    def test_script_skill_runner_uses_managed_venv_when_requirements_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_dir = temp_path / "managed_env"
            skill_dir.mkdir()
            (skill_dir / "requirements.txt").write_text("missing_graphiteui_dependency>=1\n", encoding="utf-8")
            (skill_dir / "run.py").write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "print(json.dumps({",
                        "  'status': 'succeeded',",
                        "  'venv': os.environ.get('GRAPHITE_SKILL_VENV'),",
                        "  'requirements': os.environ.get('GRAPHITE_SKILL_REQUIREMENTS'),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )
            fake_venv_dir = temp_path / "envs" / "managed_env"
            fake_environment = skill_runtime.SkillPythonEnvironment(
                python_executable=sys.executable,
                venv_dir=fake_venv_dir,
                requirements_path=skill_dir / "requirements.txt",
            )

            runner = ScriptSkillRunner(
                skill_key="managed_env",
                skill_dir=skill_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            with (
                patch("app.skills.runtime.current_python_satisfies_requirements", return_value=False) as satisfied,
                patch("app.skills.runtime.ensure_skill_python_environment", return_value=fake_environment) as ensure,
            ):
                result = invoke_skill(runner, {})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["venv"], str(fake_venv_dir))
        self.assertEqual(result["requirements"], str(skill_dir / "requirements.txt"))
        satisfied.assert_called_once_with(skill_dir / "requirements.txt")
        ensure.assert_called_once()

    def test_ensure_skill_python_environment_prefers_uv_and_reuses_hashed_env(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_dir = temp_path / "needs_uv_env"
            env_root = temp_path / "envs"
            skill_dir.mkdir()
            requirements_path = skill_dir / "requirements.txt"
            requirements_path.write_text("example-package>=1\n", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append([str(item) for item in command])
                if command[:2] == ["uv", "venv"]:
                    python_path = skill_runtime.venv_python_path(Path(command[2]))
                    python_path.parent.mkdir(parents=True, exist_ok=True)
                    python_path.write_text("", encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

            with (
                patch("app.skills.runtime.shutil.which", return_value="/usr/bin/uv"),
                patch("app.skills.runtime.subprocess.run", side_effect=fake_run),
            ):
                environment = skill_runtime.ensure_skill_python_environment(
                    skill_key="needs_uv_env",
                    skill_dir=skill_dir,
                    requirements_path=requirements_path,
                    env_root=env_root,
                )
                reused_environment = skill_runtime.ensure_skill_python_environment(
                    skill_key="needs_uv_env",
                    skill_dir=skill_dir,
                    requirements_path=requirements_path,
                    env_root=env_root,
                )

        self.assertEqual(environment, reused_environment)
        self.assertTrue(environment.venv_dir.is_relative_to(env_root))
        self.assertEqual(calls[0][:2], ["uv", "venv"])
        self.assertEqual(calls[1][:4], ["uv", "pip", "install", "--python"])
        self.assertEqual(len(calls), 2)

    def test_current_python_requirement_check_handles_comments_and_markers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            requirements_path = Path(temp_dir) / "requirements.txt"
            requirements_path.write_text(
                "\n".join(
                    [
                        "pytest>=8,<10  # already installed test runner",
                        "missing-graphiteui-dependency>=1; python_version < '0'",
                    ]
                ),
                encoding="utf-8",
            )
            impossible_requirements_path = Path(temp_dir) / "impossible.txt"
            impossible_requirements_path.write_text("pytest>=999\n", encoding="utf-8")

            self.assertTrue(skill_runtime.current_python_satisfies_requirements(requirements_path))
            self.assertFalse(skill_runtime.current_python_satisfies_requirements(impossible_requirements_path))

    def test_script_skill_runner_rejects_entrypoints_outside_skill_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "unsafe"
            skill_dir.mkdir()

            with self.assertRaisesRegex(ValueError, "inside the skill folder"):
                ScriptSkillRunner(
                    skill_key="unsafe",
                    skill_dir=skill_dir,
                    runtime_type="python",
                    entrypoint="../outside.py",
                )


if __name__ == "__main__":
    unittest.main()
