from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.execution_graph import (
    CycleDetector,
    ExecutionEdge,
    build_conditional_edge_id,
    build_execution_edges,
    build_regular_edge_id,
    select_active_outgoing_edges,
)
from app.core.schemas.node_system import NodeSystemGraphDocument


class ExecutionGraphRuntimeTests(unittest.TestCase):
    def test_execution_edges_include_regular_and_conditional_edges_in_graph_order(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "Execution Graph",
                "state_schema": {},
                "nodes": {
                    "start": {"kind": "input", "ui": {"position": {"x": 0, "y": 0}}},
                    "judge": {
                        "kind": "condition",
                        "ui": {"position": {"x": 160, "y": 0}},
                        "config": {
                            "branches": ["true", "false", "exhausted"],
                            "loopLimit": 5,
                            "branchMapping": {"true": "true", "false": "false"},
                            "rule": {"source": "result", "operator": "exists", "value": None},
                        },
                    },
                    "yes": {"kind": "output", "ui": {"position": {"x": 320, "y": -80}}},
                    "no": {"kind": "output", "ui": {"position": {"x": 320, "y": 80}}},
                    "done": {"kind": "output", "ui": {"position": {"x": 320, "y": 160}}},
                },
                "edges": [{"source": "start", "target": "judge"}],
                "conditional_edges": [
                    {"source": "judge", "branches": {"true": "yes", "false": "no", "exhausted": "done"}},
                ],
            }
        )

        edges = build_execution_edges(graph)

        self.assertEqual(
            [edge.id for edge in edges],
            [
                build_regular_edge_id("start", "judge"),
                build_conditional_edge_id("judge", "true", "yes"),
                build_conditional_edge_id("judge", "false", "no"),
                build_conditional_edge_id("judge", "exhausted", "done"),
            ],
        )
        self.assertEqual(edges[1].branch, "true")
        self.assertEqual(edges[2].kind, "conditional")

    def test_cycle_detector_reports_back_edges(self) -> None:
        edges = [
            ExecutionEdge(id="a-b", source="a", target="b", kind="edge"),
            ExecutionEdge(id="b-c", source="b", target="c", kind="edge"),
            ExecutionEdge(id="c-a", source="c", target="a", kind="edge"),
        ]

        has_cycle, back_edges = CycleDetector(edges).detect()

        self.assertTrue(has_cycle)
        self.assertEqual([edge.id for edge in back_edges], ["c-a"])

    def test_select_active_outgoing_edges_filters_non_selected_conditional_branches(self) -> None:
        outgoing_edges = [
            ExecutionEdge(id="regular", source="start", target="judge", kind="edge"),
            ExecutionEdge(id="true-edge", source="judge", target="yes", kind="conditional", branch="true"),
            ExecutionEdge(id="false-edge", source="judge", target="no", kind="conditional", branch="false"),
        ]

        selected = select_active_outgoing_edges(outgoing_edges, {"selected_branch": "true"})

        self.assertEqual(selected, {"regular", "true-edge"})


if __name__ == "__main__":
    unittest.main()
