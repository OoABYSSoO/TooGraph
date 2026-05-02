from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill
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
