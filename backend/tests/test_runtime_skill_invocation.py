from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill


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


if __name__ == "__main__":
    unittest.main()
