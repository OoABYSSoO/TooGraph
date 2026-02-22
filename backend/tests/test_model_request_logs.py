from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class ModelRequestLogTests(unittest.TestCase):
    def test_appends_sanitized_model_request_log_and_lists_newest_first(self) -> None:
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "model_requests.jsonl"
            with patch("app.core.storage.model_log_store.MODEL_REQUEST_LOG_PATH", log_path):
                append_model_request_log(
                    provider_id="local",
                    transport="openai-compatible",
                    model="gemma",
                    path="/v1/chat/completions",
                    request_raw={
                        "model": "gemma",
                        "messages": [
                            {"role": "system", "content": "sys"},
                            {
                                "role": "user",
                                "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,abcd"}}],
                            },
                        ],
                    },
                    response_raw={
                        "id": "chatcmpl_1",
                        "choices": [{"message": {"reasoning_content": "think", "content": "hello"}}],
                    },
                    duration_ms=1234,
                    status_code=200,
                )

                payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 1)
        entry = payload["entries"][0]
        self.assertEqual(entry["provider_id"], "local")
        self.assertEqual(entry["transport"], "openai-compatible")
        self.assertEqual(entry["model"], "gemma")
        self.assertEqual(entry["path"], "/v1/chat/completions")
        self.assertEqual(entry["request_kind"], "chat")
        self.assertEqual(entry["duration_ms"], 1234)
        self.assertEqual(entry["status_code"], 200)
        self.assertEqual(entry["messages"][0], {"role": "system", "body": "sys"})
        self.assertEqual(entry["reasoning"], "think")
        self.assertEqual(entry["content"], "hello")
        self.assertEqual(
            entry["request_raw"]["messages"][1]["content"][0]["image_url"]["url"],
            "<data-url mime=image/png chars=26>",
        )

    def test_model_logs_route_returns_paginated_payload(self) -> None:
        with patch(
            "app.api.routes_model_logs.list_model_request_logs",
            return_value={"entries": [], "total": 0, "page": 2, "size": 5, "pages": 0},
        ) as list_logs:
            with TestClient(app) as client:
                response = client.get("/api/model-logs?page=2&size=5&q=gemma")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["page"], 2)
        list_logs.assert_called_once_with(page=2, size=5, query="gemma")

    def test_provider_chat_records_raw_request_and_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        def fake_streaming_request(**kwargs):
            return (
                {"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]},
                kwargs["stream_payload"],
                None,
                True,
            )

        with patch("app.tools.model_provider_client.post_streaming_json_with_fallback", side_effect=fake_streaming_request):
            with patch("app.tools.model_provider_client.append_model_request_log") as append_log:
                content, _meta = chat_with_model_provider(
                    provider_id="openai",
                    transport="openai-compatible",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-test",
                    model="gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "openai")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["messages"][0], {"role": "system", "content": "sys"})
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_1")

    def test_local_chat_records_raw_request_and_response(self) -> None:
        from app.tools.local_llm import _chat_with_local_model_with_meta

        with patch(
            "app.tools.local_llm._request_local_chat_completion",
            return_value={"id": "chatcmpl_local", "model": "gemma", "choices": [{"message": {"content": "hello"}}]},
        ):
            with patch("app.tools.local_llm.append_model_request_log") as append_log:
                content, _meta = _chat_with_local_model_with_meta(
                    system_prompt="sys",
                    user_prompt="user",
                    model="gemma",
                    provider_id="local",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "local")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["model"], "gemma")
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_local")


if __name__ == "__main__":
    unittest.main()
