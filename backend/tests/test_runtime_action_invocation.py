from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.action_invocation import callable_accepts_keyword, invoke_action
from app.actions import runtime as action_runtime
from app.actions.runtime import ScriptActionRunner


class RuntimeActionInvocationTests(unittest.TestCase):
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

    def test_invoke_action_supports_context_and_input_signature(self) -> None:
        calls = []

        def action(context, inputs):
            calls.append((context, inputs))
            return {"ok": inputs["question"]}

        result = invoke_action(action, {"question": "q"})

        self.assertEqual(result, {"ok": "q"})
        self.assertEqual(calls, [({}, {"question": "q"})])

    def test_invoke_action_supports_keyword_input_signature(self) -> None:
        def action(question):
            return {"ok": question}

        self.assertEqual(invoke_action(action, {"question": "q"}), {"ok": "q"})

    def test_script_action_runner_invokes_entrypoint_inside_action_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            action_dir = Path(temp_dir) / "echo"
            action_dir.mkdir()
            entrypoint = action_dir / "run.py"
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

            runner = ScriptActionRunner(
                action_key="echo",
                action_dir=action_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            self.assertEqual(invoke_action(runner, {"text": "hello"}), {"status": "succeeded", "echo": "hello"})

    def test_script_action_runner_passes_artifact_context_as_environment_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            action_dir = Path(temp_dir) / "artifact_echo"
            artifact_dir = Path(temp_dir) / "artifacts" / "run_1" / "writer" / "web_search" / "invocation_001"
            action_dir.mkdir()
            entrypoint = action_dir / "run.py"
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
                        "  'artifact_dir': os.environ.get('TOOGRAPH_ACTION_ARTIFACT_DIR'),",
                        "  'artifact_relative_dir': os.environ.get('TOOGRAPH_ACTION_ARTIFACT_RELATIVE_DIR'),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )

            runner = ScriptActionRunner(
                action_key="artifact_echo",
                action_dir=action_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            result = invoke_action(
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

    def test_script_action_runner_spools_large_runtime_context_to_file_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            action_dir = Path(temp_dir) / "runtime_context_echo"
            action_dir.mkdir()
            entrypoint = action_dir / "run.py"
            entrypoint.write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "from pathlib import Path",
                        "runtime_context_path = os.environ.get('TOOGRAPH_ACTION_RUNTIME_CONTEXT_FILE', '')",
                        "inline_context = os.environ.get('TOOGRAPH_ACTION_RUNTIME_CONTEXT', '')",
                        "if not runtime_context_path:",
                        "    print(json.dumps({",
                        "      'status': 'failed',",
                        "      'error': 'missing runtime context file',",
                        "      'inline_context_length': len(inline_context),",
                        "    }))",
                        "else:",
                        "    runtime_context = json.loads(Path(runtime_context_path).read_text(encoding='utf-8'))",
                        "    print(json.dumps({",
                        "      'status': 'succeeded',",
                        "      'runtime_context_file': runtime_context_path,",
                        "      'inline_context_present': bool(inline_context),",
                        "      'marker': runtime_context.get('marker'),",
                        "    }))",
                    ]
                ),
                encoding="utf-8",
            )
            large_runtime_context = {
                "marker": "large-context",
                "page_snapshot": {
                    "affordances": [
                        {"id": f"target-{index}", "label": "x" * 1000}
                        for index in range(180)
                    ]
                },
            }
            runner = ScriptActionRunner(
                action_key="runtime_context_echo",
                action_dir=action_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            result = invoke_action(
                runner,
                {},
                context={"action_runtime_context": large_runtime_context},
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["marker"], "large-context")
        self.assertFalse(result["inline_context_present"])
        self.assertFalse(Path(result["runtime_context_file"]).exists())

    def test_script_action_runner_uses_current_python_when_requirements_are_satisfied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            action_dir = Path(temp_dir) / "current_env"
            action_dir.mkdir()
            (action_dir / "requirements.txt").write_text("pytest>=8,<10\n", encoding="utf-8")
            (action_dir / "run.py").write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "import sys",
                        "print(json.dumps({",
                        "  'status': 'succeeded',",
                        "  'python': sys.executable,",
                        "  'venv': os.environ.get('TOOGRAPH_ACTION_VENV', ''),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )

            runner = ScriptActionRunner(
                action_key="current_env",
                action_dir=action_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            result = invoke_action(runner, {})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["python"], sys.executable)
        self.assertEqual(result["venv"], "")

    def test_script_action_runner_uses_managed_venv_when_requirements_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            action_dir = temp_path / "managed_env"
            action_dir.mkdir()
            (action_dir / "requirements.txt").write_text("missing_toograph_dependency>=1\n", encoding="utf-8")
            (action_dir / "run.py").write_text(
                "\n".join(
                    [
                        "import json",
                        "import os",
                        "print(json.dumps({",
                        "  'status': 'succeeded',",
                        "  'venv': os.environ.get('TOOGRAPH_ACTION_VENV'),",
                        "  'requirements': os.environ.get('TOOGRAPH_ACTION_REQUIREMENTS'),",
                        "}))",
                    ]
                ),
                encoding="utf-8",
            )
            fake_venv_dir = temp_path / "envs" / "managed_env"
            fake_environment = action_runtime.ActionPythonEnvironment(
                python_executable=sys.executable,
                venv_dir=fake_venv_dir,
                requirements_path=action_dir / "requirements.txt",
            )

            runner = ScriptActionRunner(
                action_key="managed_env",
                action_dir=action_dir,
                runtime_type="python",
                entrypoint="run.py",
            )

            with (
                patch("app.actions.runtime.current_python_satisfies_requirements", return_value=False) as satisfied,
                patch("app.actions.runtime.ensure_action_python_environment", return_value=fake_environment) as ensure,
            ):
                result = invoke_action(runner, {})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["venv"], str(fake_venv_dir))
        self.assertEqual(result["requirements"], str(action_dir / "requirements.txt"))
        satisfied.assert_called_once_with(action_dir / "requirements.txt")
        ensure.assert_called_once()

    def test_ensure_action_python_environment_prefers_uv_and_reuses_hashed_env(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            action_dir = temp_path / "needs_uv_env"
            env_root = temp_path / "envs"
            action_dir.mkdir()
            requirements_path = action_dir / "requirements.txt"
            requirements_path.write_text("example-package>=1\n", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append([str(item) for item in command])
                if command[:2] == ["uv", "venv"]:
                    python_path = action_runtime.venv_python_path(Path(command[2]))
                    python_path.parent.mkdir(parents=True, exist_ok=True)
                    python_path.write_text("", encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

            with (
                patch("app.actions.runtime.shutil.which", return_value="/usr/bin/uv"),
                patch("app.actions.runtime.subprocess.run", side_effect=fake_run),
            ):
                environment = action_runtime.ensure_action_python_environment(
                    action_key="needs_uv_env",
                    action_dir=action_dir,
                    requirements_path=requirements_path,
                    env_root=env_root,
                )
                reused_environment = action_runtime.ensure_action_python_environment(
                    action_key="needs_uv_env",
                    action_dir=action_dir,
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
                        "missing-toograph-dependency>=1; python_version < '0'",
                    ]
                ),
                encoding="utf-8",
            )
            impossible_requirements_path = Path(temp_dir) / "impossible.txt"
            impossible_requirements_path.write_text("pytest>=999\n", encoding="utf-8")

            self.assertTrue(action_runtime.current_python_satisfies_requirements(requirements_path))
            self.assertFalse(action_runtime.current_python_satisfies_requirements(impossible_requirements_path))

    def test_script_action_runner_rejects_entrypoints_outside_action_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            action_dir = Path(temp_dir) / "unsafe"
            action_dir.mkdir()

            with self.assertRaisesRegex(ValueError, "inside the action folder"):
                ScriptActionRunner(
                    action_key="unsafe",
                    action_dir=action_dir,
                    runtime_type="python",
                    entrypoint="../outside.py",
                )


if __name__ == "__main__":
    unittest.main()
