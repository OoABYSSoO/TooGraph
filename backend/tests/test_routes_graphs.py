from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes_graphs
from app.core.runtime.run_cancellation import get_run_cancellation_token


class GraphRoutesWorkerTests(unittest.TestCase):
    def test_run_graph_worker_registers_cancellation_token_during_execution(self) -> None:
        run_state = {"run_id": "run_worker_cancel_token", "metadata": {}}
        observed_tokens: list[bool] = []

        def execute_graph(_graph, state, *, persist_progress):
            self.assertTrue(persist_progress)
            observed_tokens.append(get_run_cancellation_token(str(state["run_id"])) is not None)
            state["status"] = "completed"

        with patch("app.api.routes_graphs.execute_node_system_graph_langgraph", side_effect=execute_graph), patch(
            "app.api.routes_graphs._sync_improvement_candidate_validation_run"
        ):
            routes_graphs._run_graph_worker(object(), run_state)

        self.assertEqual(observed_tokens, [True])
        self.assertIsNone(get_run_cancellation_token(str(run_state["run_id"])))

    def test_run_graph_worker_triggers_knowledge_embedding_drain_after_completed_ingestion_run(self) -> None:
        run_state = {
            "run_id": "run_knowledge",
            "metadata": {
                "knowledge_collection_id": "xian_policy",
                "knowledge_operation_id": "kop_policy",
                "template_id": "knowledge_folder_retrieval_ingestion",
            },
        }

        def execute_graph(_graph, state, *, persist_progress):
            self.assertTrue(persist_progress)
            state["status"] = "completed"

        with (
            patch("app.api.routes_graphs.execute_node_system_graph_langgraph", side_effect=execute_graph),
            patch("app.api.routes_graphs._sync_improvement_candidate_validation_run"),
            patch(
                "app.api.routes_graphs.mark_knowledge_ingestion_run_completed",
                return_value={
                    "collection_id": "xian_policy",
                    "template_id": "knowledge_folder_retrieval_ingestion",
                },
            ) as mark_completed,
            patch("app.api.routes_graphs.scheduler_runner.run_event_scheduled_graph_jobs_inline") as run_event_jobs,
        ):
            routes_graphs._run_graph_worker(object(), run_state)

        mark_completed.assert_called_once_with(
            "xian_policy",
            run_id="run_knowledge",
            operation_id="kop_policy",
            template_id="knowledge_folder_retrieval_ingestion",
        )
        run_event_jobs.assert_called_once_with(
            "knowledge.ingestion.completed",
            event={
                "collection_id": "xian_policy",
                "operation_id": "kop_policy",
                "run_id": "run_knowledge",
                "template_id": "knowledge_folder_retrieval_ingestion",
            },
            requested_by="knowledge_ingestion_completed",
        )


if __name__ == "__main__":
    unittest.main()
