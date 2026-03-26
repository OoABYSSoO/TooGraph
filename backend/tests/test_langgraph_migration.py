from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.compiler import compile_graph_to_langgraph_plan, get_langgraph_runtime_unsupported_reasons
from app.core.schemas.node_system import NodeSystemGraphPayload


def _manual_graph() -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(
        {
            "name": "Manual Graph",
            "state_schema": {
                "question": {"name": "Question", "type": "text", "value": "Hello"},
                "answer": {"name": "Answer", "type": "markdown", "value": ""},
            },
            "nodes": {
                "input_question": {
                    "kind": "input",
                    "name": "input_question",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "question"}],
                    "config": {"value": "Hello"},
                },
                "answer_agent": {
                    "kind": "agent",
                    "name": "answer_agent",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "question"}],
                    "writes": [{"state": "answer"}],
                    "config": {"taskInstruction": "Answer briefly."},
                },
                "output_answer": {
                    "kind": "output",
                    "name": "output_answer",
                    "ui": {"position": {"x": 480, "y": 0}},
                    "reads": [{"state": "answer"}],
                },
            },
            "edges": [
                {"source": "input_question", "target": "answer_agent"},
                {"source": "answer_agent", "target": "output_answer"},
            ],
            "conditional_edges": [],
            "metadata": {},
        }
    )


class LangGraphMigrationTests(unittest.TestCase):
    def test_manual_graph_validates_and_builds_runtime_plan_without_builtin_templates(self) -> None:
        graph = _manual_graph()

        unsupported_reasons = get_langgraph_runtime_unsupported_reasons(graph)
        plan = compile_graph_to_langgraph_plan(graph)

        self.assertEqual(unsupported_reasons, [])
        self.assertEqual(list(plan.nodes), ["input_question", "answer_agent", "output_answer"])
        self.assertEqual([(edge.source, edge.target) for edge in plan.edges], [("input_question", "answer_agent"), ("answer_agent", "output_answer")])


if __name__ == "__main__":
    unittest.main()
