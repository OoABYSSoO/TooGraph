from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes_graphs import _build_runtime_graph_document
from app.core.schemas.node_system import NodeSystemGraphPayload


def _manual_graph_with_crossed_answer_writes() -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(
        {
            "name": "联网研究循环",
            "state_schema": {
                "state_1": {"name": "request", "type": "text", "value": "帮我查询 GPT-5.5 的发布日期和模型亮点"},
                "state_4": {"name": "research_notes", "type": "markdown", "value": ""},
                "state_5": {"name": "needs_more_search", "type": "boolean", "value": False},
                "state_6": {"name": "final_answer", "type": "markdown", "value": ""},
                "state_7": {"name": "exhausted_answer", "type": "markdown", "value": ""},
            },
            "nodes": {
                "need_more_search_check": {
                    "kind": "condition",
                    "name": "need_more_search_check",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "state_5", "required": True}],
                    "config": {
                        "branches": ["true", "false", "exhausted"],
                        "loopLimit": 3,
                        "branchMapping": {"true": "true", "false": "false"},
                        "rule": {"source": "state_5", "operator": "==", "value": True},
                    },
                },
                "web_search_agent": {
                    "kind": "agent",
                    "name": "web_search_agent",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "state_1", "required": True}],
                    "writes": [{"state": "state_4", "mode": "replace"}],
                },
                "final_answer_writer": {
                    "kind": "agent",
                    "name": "final_answer_writer",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [
                        {"state": "state_1", "required": True},
                        {"state": "state_4", "required": True},
                    ],
                    "writes": [{"state": "state_7", "mode": "replace"}],
                    "config": {
                        "taskInstruction": "严格返回 JSON，字段 final_answer 为 Markdown 字符串。",
                    },
                },
                "exhausted_answer_writer": {
                    "kind": "agent",
                    "name": "exhausted_answer_writer",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [
                        {"state": "state_1", "required": True},
                        {"state": "state_4", "required": True},
                    ],
                    "writes": [{"state": "state_6", "mode": "replace"}],
                    "config": {
                        "taskInstruction": "严格返回 JSON，字段 exhausted_answer 为 Markdown 字符串。",
                    },
                },
                "output_final_answer": {
                    "kind": "output",
                    "name": "output_final_answer",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "state_6", "required": True}],
                    "config": {"displayMode": "markdown"},
                },
                "output_exhausted_answer": {
                    "kind": "output",
                    "name": "output_exhausted_answer",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "state_7", "required": True}],
                    "config": {"displayMode": "markdown"},
                },
            },
            "edges": [
                {"source": "final_answer_writer", "target": "output_final_answer"},
                {"source": "exhausted_answer_writer", "target": "output_exhausted_answer"},
            ],
            "conditional_edges": [
                {
                    "source": "need_more_search_check",
                    "branches": {
                        "true": "web_search_agent",
                        "false": "final_answer_writer",
                        "exhausted": "exhausted_answer_writer",
                    },
                }
            ],
            "metadata": {},
        }
    )


class GraphRuntimeCompatTests(unittest.TestCase):
    def test_runtime_graph_preserves_submitted_writes_without_legacy_repairs(self):
        runtime_graph = _build_runtime_graph_document(_manual_graph_with_crossed_answer_writes())

        self.assertEqual(runtime_graph.nodes["final_answer_writer"].writes[0].state, "state_7")
        self.assertEqual(runtime_graph.nodes["exhausted_answer_writer"].writes[0].state, "state_6")


if __name__ == "__main__":
    unittest.main()
