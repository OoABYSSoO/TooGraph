from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph.checkpoint_runtime import build_checkpoint_runtime, sync_checkpoint_metadata


class LangGraphCheckpointRuntimeTests(unittest.TestCase):
    def test_build_checkpoint_runtime_initializes_metadata_from_run_id(self) -> None:
        state = {"run_id": "run-1"}
        saver, runtime_config, lookup_config = build_checkpoint_runtime(state=state, checkpoint_saver_factory=lambda: "saver")

        self.assertEqual(saver, "saver")
        self.assertEqual(runtime_config, {"configurable": {"thread_id": "run-1", "checkpoint_ns": ""}})
        self.assertEqual(lookup_config, {"configurable": {"thread_id": "run-1", "checkpoint_ns": ""}})
        self.assertEqual(
            state["checkpoint_metadata"],
            {
                "available": False,
                "checkpoint_id": None,
                "thread_id": "run-1",
                "checkpoint_ns": "",
                "saver": "json_checkpoint_saver",
            },
        )

    def test_build_checkpoint_runtime_preserves_existing_checkpoint_id_for_resume(self) -> None:
        state = {
            "run_id": "fallback",
            "checkpoint_metadata": {
                "thread_id": "thread-1",
                "checkpoint_ns": "ns",
                "checkpoint_id": "checkpoint-1",
            },
        }

        _, runtime_config, lookup_config = build_checkpoint_runtime(state=state, checkpoint_saver_factory=lambda: "saver")

        self.assertEqual(
            runtime_config,
            {"configurable": {"thread_id": "thread-1", "checkpoint_ns": "ns", "checkpoint_id": "checkpoint-1"}},
        )
        self.assertEqual(lookup_config, {"configurable": {"thread_id": "thread-1", "checkpoint_ns": "ns"}})
        self.assertTrue(state["checkpoint_metadata"]["available"])
        self.assertEqual(state["checkpoint_metadata"]["checkpoint_id"], "checkpoint-1")

    def test_build_checkpoint_runtime_requires_thread_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "checkpoint_metadata.thread_id"):
            build_checkpoint_runtime(state={}, checkpoint_saver_factory=lambda: "saver")

    def test_sync_checkpoint_metadata_updates_availability_and_checkpoint_id(self) -> None:
        lookup_config = {"configurable": {"thread_id": "thread-1", "checkpoint_ns": "ns"}}
        state: dict[str, object] = {}

        sync_checkpoint_metadata(
            state,
            checkpoint_saver=SimpleNamespace(get_tuple=lambda config: None),
            checkpoint_lookup_config=lookup_config,
        )
        self.assertEqual(
            state["checkpoint_metadata"],
            {
                "thread_id": "thread-1",
                "checkpoint_ns": "ns",
                "saver": "json_checkpoint_saver",
                "available": False,
                "checkpoint_id": None,
            },
        )

        sync_checkpoint_metadata(
            state,
            checkpoint_saver=SimpleNamespace(
                get_tuple=lambda config: SimpleNamespace(
                    config={"configurable": {"checkpoint_id": "checkpoint-2"}}
                )
            ),
            checkpoint_lookup_config=lookup_config,
        )
        self.assertTrue(state["checkpoint_metadata"]["available"])
        self.assertEqual(state["checkpoint_metadata"]["checkpoint_id"], "checkpoint-2")


if __name__ == "__main__":
    unittest.main()
