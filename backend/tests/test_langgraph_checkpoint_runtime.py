from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.langgraph import checkpoints as checkpoints_module
from app.core.langgraph.checkpoint_runtime import build_checkpoint_runtime, sync_checkpoint_metadata
from app.core.langgraph.checkpoints import JsonCheckpointSaver


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
                    config={"configurable": {"checkpoint_id": "checkpoint-2"}},
                    checkpoint={"id": "checkpoint-2"},
                )
            ),
            checkpoint_lookup_config=lookup_config,
        )
        self.assertTrue(state["checkpoint_metadata"]["available"])
        self.assertEqual(state["checkpoint_metadata"]["checkpoint_id"], "checkpoint-2")

    def test_sync_checkpoint_metadata_prefers_persisted_checkpoint_payload_id(self) -> None:
        lookup_config = {"configurable": {"thread_id": "thread-1", "checkpoint_ns": "ns"}}
        state: dict[str, object] = {}

        sync_checkpoint_metadata(
            state,
            checkpoint_saver=SimpleNamespace(
                get_tuple=lambda config: SimpleNamespace(
                    config={"configurable": {"checkpoint_id": "next-checkpoint-id"}},
                    checkpoint={"id": "persisted-checkpoint-id"},
                )
            ),
            checkpoint_lookup_config=lookup_config,
        )

        self.assertTrue(state["checkpoint_metadata"]["available"])
        self.assertEqual(state["checkpoint_metadata"]["checkpoint_id"], "persisted-checkpoint-id")

    def test_json_checkpoint_saver_keeps_newer_checkpoint_when_file_writes_overlap(self) -> None:
        first_payload_ready = threading.Event()
        release_first_write = threading.Event()
        second_write_started = threading.Event()
        write_lock = threading.Lock()
        write_count = 0
        original_write_json_file = checkpoints_module.write_json_file

        def checkpoint(checkpoint_id: str) -> dict[str, object]:
            return {
                "id": checkpoint_id,
                "channel_values": {},
                "channel_versions": {},
                "versions_seen": {},
                "pending_sends": [],
            }

        def delayed_write_json_file(path: Path, payload: object) -> None:
            nonlocal write_count
            with write_lock:
                write_count += 1
                is_first_write = write_count == 1
            if is_first_write:
                first_payload_ready.set()
                self.assertTrue(release_first_write.wait(timeout=2))
            else:
                second_write_started.set()
            original_write_json_file(path, payload)

        with TemporaryDirectory() as temp_dir:
            checkpoint_dir = Path(temp_dir)
            with (
                patch.object(checkpoints_module, "CHECKPOINT_DATA_DIR", checkpoint_dir),
                patch.object(checkpoints_module, "write_json_file", delayed_write_json_file),
            ):
                saver = JsonCheckpointSaver()
                config = {"configurable": {"thread_id": "thread-race", "checkpoint_ns": ""}}
                errors: list[BaseException] = []

                def put_checkpoint(checkpoint_id: str, step: int) -> None:
                    try:
                        saver.put(
                            config,
                            checkpoint(checkpoint_id),
                            {"source": "loop", "step": step, "parents": {}},
                            {},
                        )
                    except BaseException as exc:  # pragma: no cover - re-raised below with thread context
                        errors.append(exc)

                first_thread = threading.Thread(target=put_checkpoint, args=("checkpoint-1", 0))
                first_thread.start()
                self.assertTrue(first_payload_ready.wait(timeout=2))

                second_thread = threading.Thread(target=put_checkpoint, args=("checkpoint-2", 1))
                second_thread.start()
                second_write_started.wait(timeout=0.25)
                release_first_write.set()
                first_thread.join(timeout=2)
                second_thread.join(timeout=2)

                self.assertFalse(first_thread.is_alive())
                self.assertFalse(second_thread.is_alive())
                if errors:
                    raise errors[0]

                reloaded = JsonCheckpointSaver()
                reloaded_checkpoint = reloaded.get_tuple(
                    {
                        "configurable": {
                            "thread_id": "thread-race",
                            "checkpoint_ns": "",
                            "checkpoint_id": "checkpoint-2",
                        }
                    }
                )

        self.assertIsNotNone(reloaded_checkpoint)


if __name__ == "__main__":
    unittest.main()
