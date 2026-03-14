from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.execution_graph import build_conditional_edge_id, build_regular_edge_id
from app.core.runtime.output_artifacts import (
    apply_loop_limit_exhausted_output_message,
    format_loop_limit_exhausted_output_value,
    resolve_active_output_nodes,
)
from app.core.schemas.node_system import NodeSystemGraphDocument


class RuntimeOutputArtifactTests(unittest.TestCase):
    def test_format_loop_limit_message_preserves_text_and_serializes_structured_values(self) -> None:
        self.assertEqual(
            format_loop_limit_exhausted_output_value("done"),
            "循环已达上限，最新的结果是：done",
        )
        self.assertEqual(
            format_loop_limit_exhausted_output_value({"items": [1]}),
            '循环已达上限，最新的结果是：{"items": [1]}',
        )
        self.assertEqual(
            format_loop_limit_exhausted_output_value(None),
            "循环已达上限，最新的结果是：",
        )

    def test_apply_loop_limit_message_wraps_output_previews_and_final_result(self) -> None:
        body = {
            "output_previews": [
                {"node_id": "out", "display_mode": "markdown", "value": {"items": [1]}},
            ],
            "final_result": "fallback",
        }

        wrapped = apply_loop_limit_exhausted_output_message(body)

        self.assertEqual(wrapped["final_result"], '循环已达上限，最新的结果是：{"items": [1]}')
        self.assertEqual(wrapped["output_previews"][0]["display_mode"], "text")
        self.assertEqual(wrapped["output_previews"][0]["value"], wrapped["final_result"])
        self.assertEqual(body["output_previews"][0]["display_mode"], "markdown")

    def test_resolve_active_output_nodes_matches_regular_and_conditional_edge_ids(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "Output Graph",
                "state_schema": {"answer": {"name": "Answer", "type": "text", "value": ""}},
                "nodes": {
                    "agent": {
                        "kind": "agent",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "answer"}],
                    },
                    "judge": {
                        "kind": "condition",
                        "ui": {"position": {"x": 160, "y": 0}},
                        "config": {
                            "branches": ["true", "false"],
                            "branchMapping": {"true": "true", "false": "false"},
                            "rule": {"source": "answer", "operator": "exists", "value": None},
                        },
                    },
                    "regular_out": {
                        "kind": "output",
                        "ui": {"position": {"x": 320, "y": -80}},
                        "reads": [{"state": "answer"}],
                    },
                    "true_out": {
                        "kind": "output",
                        "ui": {"position": {"x": 320, "y": 0}},
                        "reads": [{"state": "answer"}],
                    },
                    "false_out": {
                        "kind": "output",
                        "ui": {"position": {"x": 320, "y": 80}},
                        "reads": [{"state": "answer"}],
                    },
                },
                "edges": [{"source": "agent", "target": "regular_out"}],
                "conditional_edges": [
                    {"source": "judge", "branches": {"true": "true_out", "false": "false_out"}},
                ],
            }
        )

        active_nodes = resolve_active_output_nodes(
            graph,
            {
                build_regular_edge_id("agent", "regular_out"),
                build_conditional_edge_id("judge", "true", "true_out"),
            },
        )

        self.assertEqual(active_nodes, {"regular_out", "true_out"})
        self.assertEqual(resolve_active_output_nodes(graph, set()), set())


if __name__ == "__main__":
    unittest.main()
