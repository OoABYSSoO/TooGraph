from __future__ import annotations

import copy
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.schemas.node_system import NodeSystemGraphDocument


class LangGraphRuntimeProgressEventTests(unittest.TestCase):
    def test_langgraph_runtime_persists_running_execution_before_node_finishes(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_running_timing",
                "name": "Running Timing Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "Abyss"},
                    "answer": {"name": "Answer", "type": "text"},
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
                        "reads": [{"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"taskInstruction": "Say hello.", "skillKey": ""},
                    },
                    "output_answer": {
                        "kind": "output",
                        "ui": {"position": {"x": 480, "y": 0}},
                        "reads": [{"state": "answer"}],
                    },
                },
                "edges": [
                    {"source": "input_question", "target": "agent_answer"},
                    {"source": "agent_answer", "target": "output_answer"},
                ],
                "conditional_edges": [],
            }
        )
        saved_states: list[dict] = []

        def capture_save(run: dict) -> None:
            saved_states.append(copy.deepcopy(run))

        with patch("app.core.runtime.node_system_executor.save_run", side_effect=capture_save), patch(
            "app.core.langgraph.runtime.save_run", side_effect=capture_save
        ), patch("app.core.runtime.node_system_executor.chat_with_model_ref_with_meta") as chat, patch(
            "app.core.runtime.node_system_executor._chat_with_local_model_with_meta"
        ) as local_chat:
            chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
            local_chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
            execute_node_system_graph_langgraph(
                graph,
                {"run_id": "run_running_timing", "status": "running"},
                persist_progress=True,
            )

        running_snapshot = next(
            snapshot
            for snapshot in saved_states
            if any(
                execution.get("node_id") == "agent_answer" and execution.get("status") == "running"
                for execution in snapshot.get("node_executions", [])
            )
        )
        running_execution = next(
            execution
            for execution in running_snapshot["node_executions"]
            if execution["node_id"] == "agent_answer" and execution["status"] == "running"
        )
        self.assertIsNotNone(running_execution["started_at"])
        self.assertIsNone(running_execution["finished_at"])
        self.assertEqual(running_execution["duration_ms"], 0)

        final_execution = [
            execution
            for execution in saved_states[-1]["node_executions"]
            if execution.get("node_id") == "agent_answer"
        ][-1]
        self.assertEqual(final_execution["status"], "success")
        self.assertIsNotNone(final_execution["finished_at"])
        self.assertEqual(final_execution["started_at"], running_execution["started_at"])
        self.assertGreaterEqual(
            datetime.fromisoformat(final_execution["finished_at"]),
            datetime.fromisoformat(final_execution["started_at"]),
        )

    def test_langgraph_runtime_publishes_node_and_state_activity_events(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_1",
                "name": "Activity Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "Abyss"},
                    "answer": {"name": "Answer", "type": "text"},
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
                        "reads": [{"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"taskInstruction": "Say hello.", "skillKey": ""},
                    },
                    "output_answer": {
                        "kind": "output",
                        "ui": {"position": {"x": 480, "y": 0}},
                        "reads": [{"state": "answer"}],
                    },
                },
                "edges": [
                    {"source": "input_question", "target": "agent_answer"},
                    {"source": "agent_answer", "target": "output_answer"},
                ],
                "conditional_edges": [],
            }
        )
        events: list[tuple[str, str, dict]] = []

        with patch("app.core.langgraph.runtime.publish_run_event") as publish, patch(
            "app.core.runtime.node_system_executor.chat_with_model_ref_with_meta"
        ) as chat, patch("app.core.runtime.node_system_executor._chat_with_local_model_with_meta") as local_chat, patch(
            "app.core.langgraph.runtime.save_run"
        ):
            publish.side_effect = lambda run_id, event_type, payload=None: events.append((run_id, event_type, payload or {}))
            chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
            local_chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
            execute_node_system_graph_langgraph(
                graph,
                {"run_id": "run_1", "status": "running"},
                persist_progress=False,
            )

        event_types = [event_type for _run_id, event_type, _payload in events]
        self.assertIn("node.started", event_types)
        self.assertIn("state.updated", event_types)
        self.assertIn("node.completed", event_types)
        state_event = next(
            payload for _run_id, event_type, payload in events if event_type == "state.updated" and payload["state_key"] == "answer"
        )
        self.assertEqual(state_event["node_id"], "agent_answer")
        self.assertEqual(state_event["value"], "Hello, Abyss!")
        self.assertEqual(state_event["sequence"], 1)

    def test_langgraph_runtime_publishes_condition_duration(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_condition",
                "name": "Condition Duration Graph",
                "state_schema": {
                    "answer": {"name": "Answer", "type": "text", "value": "ok"},
                },
                "nodes": {
                    "input_answer": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "answer"}],
                    },
                    "judge_answer": {
                        "kind": "condition",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "config": {
                            "branches": ["true", "false", "exhausted"],
                            "branchMapping": {"true": "true", "false": "false"},
                            "rule": {"source": "$state.answer", "operator": "==", "value": "ok"},
                        },
                    },
                    "output_yes": {
                        "kind": "output",
                        "ui": {"position": {"x": 480, "y": 0}},
                        "reads": [{"state": "answer"}],
                    },
                    "output_no": {
                        "kind": "output",
                        "ui": {"position": {"x": 480, "y": 160}},
                        "reads": [{"state": "answer"}],
                    },
                    "output_done": {
                        "kind": "output",
                        "ui": {"position": {"x": 480, "y": 320}},
                        "reads": [{"state": "answer"}],
                    },
                },
                "edges": [{"source": "input_answer", "target": "judge_answer"}],
                "conditional_edges": [
                    {
                        "source": "judge_answer",
                        "branches": {"true": "output_yes", "false": "output_no", "exhausted": "output_done"},
                    },
                ],
            }
        )
        events: list[tuple[str, str, dict]] = []

        with patch("app.core.langgraph.runtime.publish_run_event") as publish, patch(
            "app.core.langgraph.runtime.save_run"
        ):
            publish.side_effect = lambda run_id, event_type, payload=None: events.append((run_id, event_type, payload or {}))
            result = execute_node_system_graph_langgraph(
                graph,
                {"run_id": "run_condition", "status": "running"},
                persist_progress=False,
            )

        condition_event = next(
            payload
            for _run_id, event_type, payload in events
            if event_type == "node.completed" and payload.get("node_id") == "judge_answer"
        )
        self.assertEqual(condition_event["selected_branch"], "true")
        self.assertIsInstance(condition_event["duration_ms"], int)
        self.assertGreaterEqual(condition_event["duration_ms"], 0)
        condition_execution = next(
            execution
            for execution in result["node_executions"]
            if execution["node_id"] == "judge_answer"
        )
        self.assertEqual(condition_execution["node_type"], "condition")
        self.assertEqual(condition_execution["status"], "success")
        self.assertEqual(condition_execution["artifacts"]["selected_branch"], "true")
        self.assertIsNotNone(condition_execution["started_at"])
        self.assertIsNotNone(condition_execution["finished_at"])


if __name__ == "__main__":
    unittest.main()
