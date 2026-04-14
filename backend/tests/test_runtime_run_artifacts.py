from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.run_artifacts import (
    append_run_snapshot,
    refresh_run_artifacts,
)


class RuntimeRunArtifactsTests(unittest.TestCase):
    def test_refresh_run_artifacts_builds_exported_outputs_and_state_snapshot(self) -> None:
        state = {
            "saved_outputs": [{"node_id": "out", "source_key": "answer", "path": "answer.txt"}],
            "output_previews": [
                {
                    "node_id": "out",
                    "label": "Answer",
                    "source_kind": "state",
                    "source_key": "answer",
                    "display_mode": "text",
                    "persist_enabled": True,
                    "persist_format": "txt",
                    "value": "done",
                }
            ],
            "state_values": {"answer": "done"},
            "state_events": [{"state_key": "answer"}],
            "activity_events": [{"kind": "skill_invocation", "summary": "Skill ran"}],
            "state_last_writers": {"answer": {"node_id": "agent"}},
            "streaming_outputs": {"agent": {"text": "done"}},
            "cycle_iterations": [{"iteration": 1}],
            "cycle_summary": {"has_cycle": False},
            "skill_outputs": [{"skill_key": "web_search", "outputs": {"results": []}}],
        }

        refresh_run_artifacts(
            state,
            {"agent": {"answer": "done"}},
            {"edge:b", "edge:a"},
            started_perf=time.perf_counter(),
        )

        self.assertGreaterEqual(state["duration_ms"], 0)
        self.assertEqual(state["artifacts"]["active_edge_ids"], ["edge:a", "edge:b"])
        self.assertEqual(state["artifacts"]["node_outputs"], {"agent": {"answer": "done"}})
        self.assertEqual(state["artifacts"]["activity_events"], [{"kind": "skill_invocation", "summary": "Skill ran"}])
        self.assertEqual(state["artifacts"]["exported_outputs"][0]["saved_file"]["path"], "answer.txt")
        self.assertEqual(state["state_snapshot"], {"values": {"answer": "done"}, "last_writers": {"answer": {"node_id": "agent"}}})
        self.assertNotIn("knowledge_summary", state)

    def test_append_run_snapshot_deep_copies_current_run_state(self) -> None:
        state = {
            "status": "paused",
            "current_node_id": "agent",
            "checkpoint_metadata": {"available": True},
            "state_snapshot": {"values": {"answer": "draft"}},
            "graph_snapshot": {"nodes": {"agent": {}}},
            "artifacts": {"active_edge_ids": ["edge:a"]},
            "node_status_map": {"agent": "success"},
            "output_previews": [{"node_id": "out", "value": "draft"}],
            "final_result": "draft",
        }

        append_run_snapshot(state, snapshot_id="pause_1", kind="pause", label="Paused at agent")
        state["state_snapshot"]["values"]["answer"] = "mutated"

        snapshot = state["run_snapshots"][0]
        self.assertEqual(snapshot["snapshot_id"], "pause_1")
        self.assertEqual(snapshot["kind"], "pause")
        self.assertEqual(snapshot["state_snapshot"]["values"]["answer"], "draft")
        self.assertEqual(snapshot["final_result"], "draft")
        self.assertIn("created_at", snapshot)

if __name__ == "__main__":
    unittest.main()
