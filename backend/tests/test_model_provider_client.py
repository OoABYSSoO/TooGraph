from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200, text: str = "") -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = text

    def json(self) -> dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise AssertionError(f"unexpected fake HTTP error {self.status_code}")


class FakeHttpClient:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.get_calls: list[dict[str, Any]] = []
        self.post_calls: list[dict[str, Any]] = []

    def __enter__(self) -> "FakeHttpClient":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.get_calls.append({"url": url, **kwargs})
        return self.response

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.post_calls.append({"url": url, **kwargs})
        return self.response


class ModelProviderClientTests(unittest.TestCase):
    def _patched_client(self, response: FakeResponse):
        fake_client = FakeHttpClient(response)
        return fake_client, patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client)

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
        self.assertEqual(requested["json"]["messages"][0], {"role": "system", "content": "sys"})

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
        self.assertEqual(requested["json"]["system"], "sys")
        self.assertEqual(requested["json"]["messages"], [{"role": "user", "content": "user"}])

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
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        )
        self.assertEqual(requested["params"], {"key": "gemini-key"})
        self.assertEqual(requested["json"]["system_instruction"]["parts"]["text"], "sys")
        self.assertEqual(requested["json"]["contents"][0]["parts"][0]["text"], "user")


if __name__ == "__main__":
    unittest.main()
