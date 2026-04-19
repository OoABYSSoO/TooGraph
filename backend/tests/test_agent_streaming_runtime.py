from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_streaming import build_agent_stream_delta_callback, finalize_agent_stream_delta


class AgentStreamingRuntimeTests(unittest.TestCase):
    def test_build_agent_stream_delta_callback_returns_none_without_run_id(self) -> None:
        callback = build_agent_stream_delta_callback(
            state={},
            node_name="agent",
            output_keys=["answer"],
        )

        self.assertIsNone(callback)

    def test_stream_delta_callback_accumulates_text_and_publishes_delta_events(self) -> None:
        state = {"run_id": "run_1"}

        with patch("app.core.runtime.agent_streaming.publish_run_event") as publish:
            callback = build_agent_stream_delta_callback(
                state=state,
                node_name="agent",
                output_keys=["answer"],
            )
            self.assertIsNotNone(callback)
            callback("hello")
            callback("")
            callback(" world")

        stream_record = state["streaming_outputs"]["agent"]
        self.assertEqual(stream_record["text"], "hello world")
        self.assertEqual(stream_record["chunk_count"], 2)
        self.assertEqual(stream_record["output_keys"], ["answer"])
        self.assertFalse(stream_record["completed"])
        self.assertEqual(publish.call_count, 2)
        self.assertEqual(publish.call_args_list[0].args[0], "run_1")
        self.assertEqual(publish.call_args_list[0].args[1], "node.output.delta")
        self.assertEqual(publish.call_args_list[0].args[2]["delta"], "hello")
        self.assertEqual(publish.call_args_list[1].args[2]["chunk_index"], 2)

    def test_stream_delta_callback_accepts_state_stream_metadata(self) -> None:
        state = {"run_id": "run_1"}

        with patch("app.core.runtime.agent_streaming.publish_run_event") as publish:
            callback = build_agent_stream_delta_callback(
                state=state,
                node_name="agent",
                output_keys=["greeting_zh", "greeting_en"],
                stream_state_keys=["greeting_zh", "greeting_en"],
            )
            self.assertIsNotNone(callback)
            callback('{"greeting_zh":"你好')

        payload = publish.call_args.args[2]
        self.assertEqual(payload["output_keys"], ["greeting_zh", "greeting_en"])
        self.assertEqual(payload["stream_state_keys"], ["greeting_zh", "greeting_en"])
        self.assertEqual(payload["text"], '{"greeting_zh":"你好')

    def test_stream_delta_callback_records_completed_state_stream_events_once(self) -> None:
        state = {"run_id": "run_1"}

        with patch("app.core.runtime.agent_streaming.publish_run_event") as publish:
            callback = build_agent_stream_delta_callback(
                state=state,
                node_name="agent",
                output_keys=["ja", "en"],
                stream_state_keys=["ja", "en"],
            )
            self.assertIsNotNone(callback)
            callback('{"ja":"こんにちは","en":"Hel')
            callback('lo"}')

        self.assertEqual(
            [(event["state_key"], event["chunk_count"]) for event in state["state_stream_events"]],
            [("ja", 1), ("en", 2)],
        )
        self.assertTrue(all(event["status"] == "completed" for event in state["state_stream_events"]))
        self.assertTrue(all(event["node_id"] == "agent" for event in state["state_stream_events"]))
        self.assertTrue(all(event["source"] == "node.output.delta" for event in state["state_stream_events"]))
        completed_events = [
            call.args[2]
            for call in publish.call_args_list
            if call.args[1] == "state.stream.completed"
        ]
        self.assertEqual([event["state_key"] for event in completed_events], ["ja", "en"])
        self.assertTrue(all("created_at" in event for event in completed_events))

    def test_finalize_agent_stream_delta_marks_record_completed_and_publishes_outputs(self) -> None:
        state = {
            "run_id": "run_1",
            "streaming_outputs": {
                "agent": {
                    "node_id": "agent",
                    "output_keys": ["answer"],
                    "text": "hello",
                    "chunk_count": 1,
                    "completed": False,
                }
            },
        }
        output_values = {"answer": {"text": "hello"}}

        with patch("app.core.runtime.agent_streaming.publish_run_event") as publish:
            finalize_agent_stream_delta(
                state=state,
                node_name="agent",
                output_values=output_values,
            )

        output_values["answer"]["text"] = "mutated"
        stream_record = state["streaming_outputs"]["agent"]
        self.assertTrue(stream_record["completed"])
        self.assertEqual(stream_record["output_values"], {"answer": {"text": "hello"}})
        publish.assert_called_once()
        self.assertEqual(publish.call_args.args[0], "run_1")
        self.assertEqual(publish.call_args.args[1], "node.output.completed")
        self.assertEqual(publish.call_args.args[2]["output_values"], {"answer": {"text": "hello"}})

    def test_finalize_agent_stream_delta_publishes_reasoning_summary_when_available(self) -> None:
        state = {
            "run_id": "run_1",
            "streaming_outputs": {
                "agent": {
                    "node_id": "agent",
                    "output_keys": ["answer"],
                    "text": '{"answer":"ok"}',
                    "chunk_count": 1,
                    "completed": False,
                }
            },
        }

        with patch("app.core.runtime.agent_streaming.publish_run_event") as publish:
            finalize_agent_stream_delta(
                state=state,
                node_name="agent",
                output_values={"answer": "ok"},
                reasoning="Checked the input and selected a greeting.",
            )

        self.assertEqual(publish.call_args_list[-1].args[1], "node.reasoning.completed")
        self.assertEqual(publish.call_args_list[-1].args[2]["reasoning"], "Checked the input and selected a greeting.")


if __name__ == "__main__":
    unittest.main()
