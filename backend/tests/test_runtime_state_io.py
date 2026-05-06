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
    def test_initialize_graph_state_clears_non_input_values_for_fresh_runs(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "State Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "fresh question"},
                    "answer": {"name": "Answer", "type": "markdown", "value": "stale schema answer"},
                    "count": {"name": "Count", "type": "number", "value": 9},
                    "ready": {"name": "Ready", "type": "boolean", "value": True},
                    "payload": {"name": "Payload", "type": "json", "value": {"items": [1]}},
                    "files": {"name": "Files", "type": "file", "value": ["old.txt"]},
                    "allowed_skills": {
                        "name": "Allowed Skills",
                        "type": "skill",
                        "value": [{"skillKey": "web_search"}],
                    },
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "question"}],
                    },
                    "agent_answer": {
                        "kind": "agent",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "writes": [
                            {"state": "answer"},
                            {"state": "count"},
                            {"state": "ready"},
                            {"state": "payload"},
                            {"state": "files"},
                            {"state": "allowed_skills"},
                        ],
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )
        state = {
            "state_values": {
                "question": "previous question",
                "answer": "previous answer",
                "count": 99,
                "ready": True,
                "payload": {"previous": True},
                "files": ["previous.txt"],
                "allowed_skills": [{"skillKey": "previous"}],
                "obsolete": "remove me",
            },
            "state_last_writers": {"question": {"node_id": "input"}},
            "state_events": [{"state_key": "question"}],
        }

        initialize_graph_state(graph, state)

        self.assertEqual(
            state["state_values"],
            {
                "question": "fresh question",
                "answer": "",
                "count": 0,
                "ready": False,
                "payload": {},
                "files": "",
                "allowed_skills": [],
            },
        )
        self.assertEqual(state["state_snapshot"]["values"], state["state_values"])
        self.assertEqual(state["state_last_writers"], {})
        self.assertEqual(state["state_events"], [])
        self.assertEqual(state["state_snapshot"]["last_writers"], {})

    def test_initialize_graph_state_preserves_existing_values_for_resume(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "State Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "seed"},
                    "payload": {"name": "Payload", "type": "json", "value": {"items": [1]}},
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "question"}],
                    },
                    "agent_payload": {
                        "kind": "agent",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "writes": [{"state": "payload"}],
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )
        state = {
            "state_values": {"question": "existing", "payload": {"items": [2]}},
            "state_last_writers": {"question": {"node_id": "input"}},
            "state_events": [{"state_key": "question"}],
        }

        initialize_graph_state(graph, state, preserve_existing_values=True)

        self.assertEqual(state["state_values"]["question"], "existing")
        self.assertEqual(state["state_values"]["payload"], {"items": [2]})
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
            [
                {
                    "state_key": record["state_key"],
                    "output_key": record["output_key"],
                    "mode": record["mode"],
                    "previous_value": record["previous_value"],
                    "value": record["value"],
                    "sequence": record["sequence"],
                    "changed": record["changed"],
                }
                for record in write_records
            ],
            [
                {
                    "state_key": "answer",
                    "output_key": "answer",
                    "mode": "replace",
                    "previous_value": "old",
                    "value": "new",
                    "sequence": 1,
                    "changed": True,
                },
                {
                    "state_key": "payload",
                    "output_key": "payload",
                    "mode": "replace",
                    "previous_value": None,
                    "value": {"items": [1]},
                    "sequence": 2,
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

    def test_apply_state_writes_appends_list_outputs_without_replacing_previous_values(self) -> None:
        mode = SimpleNamespace(value="append")
        write_bindings = [
            SimpleNamespace(state="evidence_links", mode=mode),
            SimpleNamespace(state="source_documents", mode=mode),
        ]
        output_values = {
            "evidence_links": [{"title": "Second", "url": "https://example.com/2"}],
            "source_documents": {"local_path": "run_1/doc_002.md"},
        }
        state = {
            "state_values": {
                "evidence_links": [{"title": "First", "url": "https://example.com/1"}],
                "source_documents": [],
            }
        }

        write_records = apply_state_writes("web_search_agent", write_bindings, output_values, state)

        self.assertEqual(
            state["state_values"]["evidence_links"],
            [
                {"title": "First", "url": "https://example.com/1"},
                {"title": "Second", "url": "https://example.com/2"},
            ],
        )
        self.assertEqual(state["state_values"]["source_documents"], [{"local_path": "run_1/doc_002.md"}])
        self.assertEqual(write_records[0]["mode"], "append")
        self.assertTrue(write_records[0]["changed"])

    def test_apply_state_writes_reindexes_appended_source_reference_lists(self) -> None:
        mode = SimpleNamespace(value="append")
        write_bindings = [SimpleNamespace(state="evidence_links", mode=mode)]
        output_values = {
            "evidence_links": [
                {"index": 1, "title": "Third", "url": "https://example.com/3"},
                {"index": 2, "title": "Fourth", "url": "https://example.com/4"},
            ]
        }
        state = {
            "state_values": {
                "evidence_links": [
                    {"index": 1, "title": "First", "url": "https://example.com/1"},
                    {"index": 2, "title": "Second", "url": "https://example.com/2"},
                ]
            }
        }

        apply_state_writes("web_search_agent", write_bindings, output_values, state)

        self.assertEqual(
            [item["index"] for item in state["state_values"]["evidence_links"]],
            [1, 2, 3, 4],
        )
        self.assertEqual(
            [item["title"] for item in state["state_values"]["evidence_links"]],
            ["First", "Second", "Third", "Fourth"],
        )

    def test_apply_state_writes_records_previous_value_and_sequence_for_activity_feed(self) -> None:
        mode = SimpleNamespace(value="replace")
        write_bindings = [SimpleNamespace(state="answer", mode=mode)]
        state = {
            "state_values": {"answer": "old"},
            "state_events": [{"sequence": 1, "state_key": "question"}],
        }

        records = apply_state_writes(
            "agent_writer",
            write_bindings,
            {"answer": "new"},
            state,
        )

        self.assertEqual(records[0]["previous_value"], "old")
        self.assertEqual(records[0]["value"], "new")
        self.assertEqual(records[0]["sequence"], 2)
        self.assertEqual(state["state_events"][-1]["previous_value"], "old")
        self.assertEqual(state["state_events"][-1]["value"], "new")
        self.assertEqual(state["state_events"][-1]["sequence"], 2)


if __name__ == "__main__":
    unittest.main()
