from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.reference_resolution import read_path, resolve_condition_source, resolve_reference


class RuntimeReferenceResolutionTests(unittest.TestCase):
    def test_read_path_resolves_nested_dict_values_and_missing_paths(self) -> None:
        payload = {"a": {"b": {"c": 3}}}

        self.assertEqual(read_path(payload, "a.b.c"), 3)
        self.assertIsNone(read_path(payload, "a.missing.c"))
        self.assertIsNone(read_path({"a": 1}, "a.b"))

    def test_resolve_reference_reads_known_runtime_namespaces(self) -> None:
        resolved = {
            "inputs": resolve_reference(
                "$inputs.question",
                inputs={"question": "q"},
                response={},
                skills={},
                context={},
                graph={},
                state_values={},
            ),
            "response": resolve_reference(
                "$response.answer",
                inputs={},
                response={"answer": "a"},
                skills={},
                context={},
                graph={},
                state_values={},
            ),
            "skills": resolve_reference(
                "$skills.search.context",
                inputs={},
                response={},
                skills={"search": {"context": "ctx"}},
                context={},
                graph={},
                state_values={},
            ),
            "context": resolve_reference(
                "$context.metadata.id",
                inputs={},
                response={},
                skills={},
                context={"metadata": {"id": "meta"}},
                graph={},
                state_values={},
            ),
            "state": resolve_reference(
                "$state.answer",
                inputs={},
                response={},
                skills={},
                context={},
                graph={},
                state_values={"answer": "state-answer"},
            ),
            "graph": resolve_reference(
                "$graph.metadata.name",
                inputs={},
                response={},
                skills={},
                context={},
                graph={"metadata": {"name": "graph"}},
                state_values={},
            ),
            "literal": resolve_reference(
                "plain",
                inputs={},
                response={},
                skills={},
                context={},
                graph={},
                state_values={},
            ),
        }

        self.assertEqual(
            resolved,
            {
                "inputs": "q",
                "response": "a",
                "skills": "ctx",
                "context": "meta",
                "state": "state-answer",
                "graph": "graph",
                "literal": "plain",
            },
        )

    def test_resolve_condition_source_prefers_references_inputs_state_then_literal(self) -> None:
        self.assertEqual(
            resolve_condition_source(
                "$state.answer",
                inputs={"answer": "input"},
                graph={"state": {"answer": "graph-state"}},
                state_values={"answer": "state"},
            ),
            "state",
        )
        self.assertEqual(
            resolve_condition_source(
                "answer",
                inputs={"answer": "input"},
                graph={},
                state_values={"answer": "state"},
            ),
            "input",
        )
        self.assertEqual(
            resolve_condition_source(
                "answer",
                inputs={},
                graph={},
                state_values={"answer": "state"},
            ),
            "state",
        )
        self.assertEqual(
            resolve_condition_source(
                "literal",
                inputs={},
                graph={},
                state_values={},
            ),
            "literal",
        )


if __name__ == "__main__":
    unittest.main()
