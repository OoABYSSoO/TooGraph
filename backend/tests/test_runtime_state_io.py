from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.state_io import (
    apply_state_writes,
    collect_node_inputs,
    initialize_graph_state,
)
from app.core.schemas.node_system import NodeSystemGraphDocument


class RuntimeStateIoTests(unittest.TestCase):
    def test_initialize_graph_state_deep_copies_defaults_and_preserves_existing_values(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "State Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "seed"},
                    "payload": {"name": "Payload", "type": "object", "value": {"items": [1]}},
                },
                "nodes": {},
                "edges": [],
                "conditional_edges": [],
            }
        )
        state = {
            "state_values": {"question": "existing"},
            "state_last_writers": {"question": {"node_id": "input"}},
            "state_events": [{"state_key": "question"}],
        }

        initialize_graph_state(graph, state)

        self.assertEqual(state["state_values"]["question"], "existing")
        self.assertEqual(state["state_values"]["payload"], {"items": [1]})
        self.assertEqual(state["state_snapshot"]["values"], state["state_values"])
        self.assertEqual(state["state_snapshot"]["last_writers"], {"question": {"node_id": "input"}})
        state["state_values"]["payload"]["items"].append(2)
        self.assertEqual(graph.state_schema["payload"].value, {"items": [1]})

    def test_collect_node_inputs_returns_copied_state_values_and_read_records(self) -> None:
        node = SimpleNamespace(reads=[SimpleNamespace(state="payload")])
        state = {"state_values": {"payload": {"items": [1]}}}

        resolved_inputs, read_records = collect_node_inputs(node, state)

        self.assertEqual(resolved_inputs, {"payload": {"items": [1]}})
        self.assertEqual(read_records, [{"state_key": "payload", "input_key": "payload", "value": {"items": [1]}}])
        resolved_inputs["payload"]["items"].append(2)
        self.assertEqual(state["state_values"]["payload"], {"items": [1]})

    def test_apply_state_writes_updates_values_writers_events_and_change_records(self) -> None:
        mode = SimpleNamespace(value="replace")
        write_bindings = [
            SimpleNamespace(state="answer", mode=mode),
            SimpleNamespace(state="payload", mode=mode),
        ]
        output_values = {"answer": "new", "payload": {"items": [1]}}
        state = {"state_values": {"answer": "old"}}

        write_records = apply_state_writes("agent_1", write_bindings, output_values, state)

        self.assertEqual(
            write_records,
            [
                {"state_key": "answer", "output_key": "answer", "mode": "replace", "value": "new", "changed": True},
                {
                    "state_key": "payload",
                    "output_key": "payload",
                    "mode": "replace",
                    "value": {"items": [1]},
                    "changed": True,
                },
            ],
        )
        self.assertEqual(state["state_values"]["answer"], "new")
        self.assertEqual(state["state_last_writers"]["answer"]["node_id"], "agent_1")
        self.assertEqual(state["state_events"][0]["state_key"], "answer")
        self.assertIn("created_at", state["state_events"][0])
        output_values["payload"]["items"].append(2)
        self.assertEqual(state["state_values"]["payload"], {"items": [1]})


if __name__ == "__main__":
    unittest.main()
