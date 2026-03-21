from __future__ import annotations

import json
import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeResponse:
    def __init__(
        self,
        payload: dict[str, Any] | None,
        status_code: int = 200,
        text: str = "",
        json_error: Exception | None = None,
    ) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = text or json.dumps(payload or {}, ensure_ascii=False)
        self._json_error = json_error
        self.request = httpx.Request("POST", "https://example.test")

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def iter_lines(self) -> list[str]:
        return self.text.splitlines()

    def json(self) -> dict[str, Any]:
        if self._json_error:
            raise self._json_error
        if self._payload is None:
            raise ValueError("invalid JSON")
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}",
                request=self.request,
                response=httpx.Response(self.status_code, text=self.text, request=self.request),
            )


class FakeHttpClient:
    def __init__(self, responses: FakeResponse | list[FakeResponse]) -> None:
        self.responses = responses if isinstance(responses, list) else [responses]
        self.get_calls: list[dict[str, Any]] = []
        self.post_calls: list[dict[str, Any]] = []

    def __enter__(self) -> "FakeHttpClient":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def _next(self) -> FakeResponse:
        if not self.responses:
            raise AssertionError("No fake response queued")
        return self.responses.pop(0)

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.get_calls.append({"url": url, **kwargs})
        return self._next()

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.post_calls.append({"url": url, **kwargs})
        return self._next()

    def stream(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.post_calls.append({"method": method, "url": url, **kwargs})
        return self._next()


class ModelProviderClientTests(unittest.TestCase):
    def _patched_client(self, response: FakeResponse):
        fake_client = FakeHttpClient(response)
        return fake_client, patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client)

    def test_http_request_helpers_are_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_http")
        self.assertIsNotNone(spec, "model provider HTTP helpers should live in a dedicated module")

        from app.tools import model_provider_client
        from app.tools import model_provider_http

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIs(model_provider_client._normalize_base_url, model_provider_http.normalize_base_url)
        self.assertIs(model_provider_client._build_auth_headers, model_provider_http.build_auth_headers)
        self.assertIs(model_provider_client.post_streaming_json_with_fallback, model_provider_http.post_streaming_json_with_fallback)
        self.assertNotIn("def _request_json(", client_source)
        self.assertNotIn("def post_streaming_json_with_fallback(", client_source)

    def test_model_discovery_helpers_are_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_discovery")
        self.assertIsNotNone(spec, "model discovery helpers should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_discovery", client_source)
        self.assertIn("def discover_provider_models(", client_source)
        self.assertNotIn("def _parse_data_model_ids(", client_source)
        self.assertNotIn("def _parse_gemini_model_ids(", client_source)
        self.assertNotIn("def _parse_codex_model_ids(", client_source)

    def test_openai_compatible_chat_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_openai")
        self.assertIsNotNone(spec, "OpenAI-compatible chat transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_openai", client_source)
        self.assertIn("def _chat_openai_compatible(", client_source)
        self.assertNotIn("def _extract_openai_chat_text(", client_source)
        self.assertNotIn("def _extract_openai_chat_stream_delta(", client_source)
        self.assertNotIn("def _coalesce_openai_chat_stream_response(", client_source)

    def test_anthropic_chat_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_anthropic")
        self.assertIsNotNone(spec, "Anthropic chat transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_anthropic", client_source)
        self.assertIn("def _chat_anthropic(", client_source)
        self.assertNotIn("def _extract_anthropic_text(", client_source)
        self.assertNotIn("def _extract_anthropic_stream_delta(", client_source)
        self.assertNotIn("def _coalesce_anthropic_stream_response(", client_source)

    def test_gemini_chat_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_gemini")
        self.assertIsNotNone(spec, "Gemini chat transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_gemini", client_source)
        self.assertIn("def _chat_gemini(", client_source)
        self.assertNotIn("def _extract_gemini_text(", client_source)
        self.assertNotIn("def _extract_gemini_stream_delta(", client_source)
        self.assertNotIn("def _coalesce_gemini_stream_response(", client_source)

    def test_codex_chat_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_codex")
        self.assertIsNotNone(spec, "Codex responses transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_codex", client_source)
        self.assertIn("def _chat_codex_responses(", client_source)
        self.assertNotIn("def _extract_codex_responses_text(", client_source)
        self.assertNotIn("def _coalesce_codex_stream_response(", client_source)
        self.assertNotIn("def _post_codex_responses_once(", client_source)

    def test_discovers_openai_compatible_models_with_bearer_header(self) -> None:
        from app.tools.model_provider_client import discover_provider_models

        fake_client, client_patch = self._patched_client(FakeResponse({"data": [{"id": "gpt-4.1"}, {"id": "gpt-4.1"}]}))
        with client_patch:
            models = discover_provider_models(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
            )

        self.assertEqual(models, ["gpt-4.1"])
        self.assertEqual(fake_client.get_calls[0]["url"], "https://api.openai.com/v1/models")
        self.assertEqual(fake_client.get_calls[0]["headers"]["Authorization"], "Bearer sk-openai")

    def test_discovers_anthropic_models_with_version_header(self) -> None:
        from app.tools.model_provider_client import discover_provider_models

        fake_client, client_patch = self._patched_client(FakeResponse({"data": [{"id": "claude-sonnet-4-5"}]}))
        with client_patch:
            models = discover_provider_models(
                provider_id="anthropic",
                transport="anthropic-messages",
                base_url="https://api.anthropic.com/v1",
                api_key="sk-ant",
                auth_header="x-api-key",
                auth_scheme="",
            )

        requested = fake_client.get_calls[0]
        self.assertEqual(models, ["claude-sonnet-4-5"])
        self.assertEqual(requested["url"], "https://api.anthropic.com/v1/models")
        self.assertEqual(requested["headers"]["x-api-key"], "sk-ant")
        self.assertEqual(requested["headers"]["anthropic-version"], "2023-06-01")

    def test_discovers_gemini_models_and_filters_generate_content(self) -> None:
        from app.tools.model_provider_client import discover_provider_models

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "models": [
                        {"name": "models/gemini-2.0-flash", "supportedGenerationMethods": ["generateContent"]},
                        {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
                    ]
                }
            )
        )
        with client_patch:
            models = discover_provider_models(
                provider_id="gemini",
                transport="gemini-generate-content",
                base_url="https://generativelanguage.googleapis.com/v1beta",
                api_key="gemini-key",
            )

        requested = fake_client.get_calls[0]
        self.assertEqual(models, ["gemini-2.0-flash"])
        self.assertEqual(requested["url"], "https://generativelanguage.googleapis.com/v1beta/models")
        self.assertEqual(requested["params"], {"key": "gemini-key"})

    def test_chat_openai_compatible_posts_chat_completions(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse({"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]})
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(meta["response_id"], "chatcmpl_1")
        self.assertEqual(requested["url"], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(requested["json"]["stream"], True)
        self.assertEqual(requested["json"]["messages"][0], {"role": "system", "content": "sys"})

    def test_chat_openai_compatible_sends_image_attachments_as_content_parts(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse({"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]})
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, _meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
                input_attachments=[
                    {
                        "type": "image",
                        "state_key": "reference_image",
                        "name": "reference.png",
                        "mime_type": "image/png",
                        "data_url": "data:image/png;base64,AAAABBBB",
                    }
                ],
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(
            requested["json"]["messages"][1]["content"],
            [
                {"type": "text", "text": "user"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAABBBB"}},
            ],
        )

    def test_chat_openai_compatible_sends_video_attachments_as_native_video_parts(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse({"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]})
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, _meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
                input_attachments=[
                    {
                        "type": "video",
                        "state_key": "clip",
                        "name": "clip.mp4",
                        "mime_type": "video/mp4",
                        "data_url": "data:video/mp4;base64,CCCCDDDD",
                    }
                ],
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(
            requested["json"]["messages"][1]["content"],
            [
                {"type": "text", "text": "user"},
                {"type": "video_url", "video_url": {"url": "data:video/mp4;base64,CCCCDDDD"}},
            ],
        )

    def test_chat_provider_falls_back_from_native_video_to_extracted_frames(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_provider

        calls: list[list[dict[str, Any]]] = []
        frame_attachments = [
            {
                "type": "image",
                "state_key": "clip#frame_001",
                "name": "clip_frame_001.jpg",
                "mime_type": "image/jpeg",
                "data_url": "data:image/jpeg;base64,FRAME",
            }
        ]

        def fake_openai_chat(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            calls.append(kwargs["input_attachments"])
            if len(calls) == 1:
                raise RuntimeError("openai request failed: unsupported video_url input")
            return "hello", {"model": "gpt-4.1", "provider_id": "openai", "temperature": 0.2}

        with patch.object(model_provider_client, "_chat_openai_compatible", side_effect=fake_openai_chat):
            with patch.object(
                model_provider_client,
                "build_video_frame_fallback_attachments",
                return_value=(frame_attachments, {"used": True, "frame_count": 1, "video_count": 1}),
            ):
                content, meta = chat_with_model_provider(
                    provider_id="openai",
                    transport="openai-compatible",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-openai",
                    model="gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    input_attachments=[
                        {
                            "type": "video",
                            "state_key": "clip",
                            "name": "clip.mp4",
                            "mime_type": "video/mp4",
                            "data_url": "data:video/mp4;base64,CCCCDDDD",
                        }
                    ],
                )

        self.assertEqual(content, "hello")
        self.assertEqual(calls[0][0]["type"], "video")
        self.assertEqual(calls[1], frame_attachments)
        self.assertEqual(meta["video_fallback"], {"used": True, "frame_count": 1, "video_count": 1})
        self.assertTrue(any("Native video request failed" in warning for warning in meta["warnings"]))

    def test_chat_openai_compatible_coalesces_streaming_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                None,
                text=(
                    'data: {"id":"chatcmpl_stream","model":"gpt-4.1","choices":[{"delta":{"content":"hello "}}]}\n\n'
                    'data: {"choices":[{"delta":{"content":"stream"}}]}\n\n'
                    'data: [DONE]\n\n'
                ),
                json_error=ValueError("stream"),
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log") as append_log:
            content, meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
            )

        requested = fake_client.post_calls[0]
        logged = append_log.call_args.kwargs
        self.assertEqual(content, "hello stream")
        self.assertEqual(meta["response_id"], "chatcmpl_stream")
        self.assertEqual(requested["json"]["stream"], True)
        self.assertEqual(logged["request_raw"]["stream"], True)
        self.assertEqual(logged["response_raw"]["_stream"]["output_chunks"], ["hello ", "stream"])

    def test_chat_openai_compatible_emits_stream_deltas_while_coalescing(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                None,
                text=(
                    'data: {"id":"chatcmpl_stream","model":"gpt-4.1","choices":[{"delta":{"content":"hello "}}]}\n\n'
                    'data: {"choices":[{"delta":{"content":"stream"}}]}\n\n'
                    'data: [DONE]\n\n'
                ),
                json_error=ValueError("stream"),
            )
        )
        emitted_chunks: list[str] = []
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
                on_delta=emitted_chunks.append,
            )

        self.assertEqual(content, "hello stream")
        self.assertEqual(meta["response_id"], "chatcmpl_stream")
        self.assertEqual(emitted_chunks, ["hello ", "stream"])

    def test_chat_openai_compatible_falls_back_to_non_streaming_request(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            [
                FakeResponse({"error": "unsupported"}, status_code=400, text="stream unsupported"),
                FakeResponse({"id": "chatcmpl_fallback", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]}),
            ]
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log") as append_log:
            content, meta = chat_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="gpt-4.1",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
            )

        self.assertEqual(content, "hello")
        self.assertEqual(meta["response_id"], "chatcmpl_fallback")
        self.assertEqual(len(fake_client.post_calls), 2)
        self.assertEqual(fake_client.post_calls[0]["json"]["stream"], True)
        self.assertEqual(fake_client.post_calls[1]["json"]["stream"], False)
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["request_raw"]["stream"], False)
        self.assertIn("stream unsupported", logged["response_raw"]["_stream_fallback"]["error"])

    def test_chat_anthropic_posts_messages_payload(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "id": "msg_1",
                    "model": "claude-sonnet-4-5",
                    "content": [{"type": "text", "text": "hello"}],
                    "usage": {"input_tokens": 5, "output_tokens": 1},
                }
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, meta = chat_with_model_provider(
                provider_id="anthropic",
                transport="anthropic-messages",
                base_url="https://api.anthropic.com/v1",
                api_key="sk-ant",
                auth_header="x-api-key",
                auth_scheme="",
                model="claude-sonnet-4-5",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
                max_tokens=128,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(meta["usage"], {"input_tokens": 5, "output_tokens": 1})
        self.assertEqual(requested["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(requested["headers"]["x-api-key"], "sk-ant")
        self.assertEqual(requested["headers"]["anthropic-version"], "2023-06-01")
        self.assertEqual(requested["json"]["stream"], True)
        self.assertEqual(requested["json"]["system"], "sys")
        self.assertEqual(requested["json"]["messages"], [{"role": "user", "content": "user"}])

    def test_chat_anthropic_coalesces_streaming_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                None,
                text=(
                    'event: message_start\n'
                    'data: {"type":"message_start","message":{"id":"msg_stream","model":"claude-sonnet-4-5","usage":{"input_tokens":5}}}\n\n'
                    'event: content_block_delta\n'
                    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello "}}\n\n'
                    'event: content_block_delta\n'
                    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"anthropic"}}\n\n'
                    'event: message_stop\n'
                    'data: {"type":"message_stop"}\n\n'
                ),
                json_error=ValueError("stream"),
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log") as append_log:
            content, meta = chat_with_model_provider(
                provider_id="anthropic",
                transport="anthropic-messages",
                base_url="https://api.anthropic.com/v1",
                api_key="sk-ant",
                auth_header="x-api-key",
                auth_scheme="",
                model="claude-sonnet-4-5",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
                max_tokens=128,
            )

        requested = fake_client.post_calls[0]
        logged = append_log.call_args.kwargs
        self.assertEqual(content, "hello anthropic")
        self.assertEqual(meta["response_id"], "msg_stream")
        self.assertEqual(requested["json"]["stream"], True)
        self.assertEqual(logged["response_raw"]["_stream"]["output_chunks"], ["hello ", "anthropic"])

    def test_chat_gemini_posts_generate_content_payload(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": "hello"}],
                            }
                        }
                    ],
                    "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 1},
                }
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            content, meta = chat_with_model_provider(
                provider_id="gemini",
                transport="gemini-generate-content",
                base_url="https://generativelanguage.googleapis.com/v1beta",
                api_key="gemini-key",
                model="gemini-2.0-flash",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(meta["usage"], {"promptTokenCount": 5, "candidatesTokenCount": 1})
        self.assertEqual(
            requested["url"],
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent",
        )
        self.assertEqual(requested["params"], {"key": "gemini-key", "alt": "sse"})
        self.assertEqual(requested["json"]["system_instruction"]["parts"]["text"], "sys")
        self.assertEqual(requested["json"]["contents"][0]["parts"][0]["text"], "user")

    def test_chat_gemini_coalesces_streaming_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                None,
                text=(
                    'data: {"candidates":[{"content":{"parts":[{"text":"hello "}]}}],"responseId":"gemini_stream"}\n\n'
                    'data: {"candidates":[{"content":{"parts":[{"text":"gemini"}]}}],"usageMetadata":{"promptTokenCount":5}}\n\n'
                ),
                json_error=ValueError("stream"),
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log") as append_log:
            content, meta = chat_with_model_provider(
                provider_id="gemini",
                transport="gemini-generate-content",
                base_url="https://generativelanguage.googleapis.com/v1beta",
                api_key="gemini-key",
                model="gemini-2.0-flash",
                system_prompt="sys",
                user_prompt="user",
                temperature=0.2,
            )

        requested = fake_client.post_calls[0]
        logged = append_log.call_args.kwargs
        self.assertEqual(content, "hello gemini")
        self.assertEqual(meta["response_id"], "gemini_stream")
        self.assertEqual(requested["url"], "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent")
        self.assertEqual(logged["response_raw"]["_stream"]["output_chunks"], ["hello ", "gemini"])


if __name__ == "__main__":
    unittest.main()
