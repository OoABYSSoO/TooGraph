from __future__ import annotations

import json
import importlib.util
import sys
import tempfile
import threading
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

    def test_openai_compatible_embedding_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_embedding")
        self.assertIsNotNone(spec, "OpenAI-compatible embedding transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_embedding", client_source)
        self.assertIn("def _embed_openai_compatible(", client_source)
        self.assertNotIn("def _extract_openai_embedding_vector(", client_source)

    def test_openai_compatible_rerank_transport_is_isolated_from_provider_client(self) -> None:
        spec = importlib.util.find_spec("app.tools.model_provider_rerank")
        self.assertIsNotNone(spec, "OpenAI-compatible rerank transport should live in a dedicated module")

        from app.tools import model_provider_client

        client_source = Path(model_provider_client.__file__ or "").read_text(encoding="utf-8")
        self.assertIn("model_provider_rerank", client_source)
        self.assertIn("def _rerank_openai_compatible(", client_source)
        self.assertNotIn("def _extract_openai_rerank_results(", client_source)

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

    def test_chat_openai_compatible_uses_request_timeout_profile(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        captured_client_kwargs: list[dict[str, Any]] = []
        fake_client = FakeHttpClient(
            FakeResponse({"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]})
        )

        def client_factory(**kwargs: Any) -> FakeHttpClient:
            captured_client_kwargs.append(kwargs)
            return fake_client

        with patch("app.tools.model_provider_client.httpx.Client", side_effect=client_factory):
            with patch("app.tools.model_provider_client.append_model_request_log"):
                content, meta = chat_with_model_provider(
                    provider_id="openai",
                    transport="openai-compatible",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-openai",
                    model="gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    request_timeout_seconds=12.5,
                )

        self.assertEqual(content, "hello")
        self.assertEqual(captured_client_kwargs[0]["timeout"], 12.5)
        self.assertEqual(meta["request_timeout_seconds"], 12.5)

    def test_chat_with_model_ref_passes_saved_request_timeout_profile(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-openai",
                    "request_timeout_seconds": 37.0,
                    "models": [{"model": "gpt-4.1", "capabilities": {"chat": True}}],
                }
            }
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            self.assertEqual(kwargs["request_timeout_seconds"], 37.0)
            return "hello", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        self.assertEqual(meta["provider_id"], "openai")

    def test_chat_with_model_ref_explicit_request_timeout_overrides_saved_profile(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-openai",
                    "request_timeout_seconds": 37.0,
                    "models": [{"model": "gpt-4.1", "capabilities": {"chat": True}}],
                }
            }
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            self.assertEqual(kwargs["request_timeout_seconds"], 12.5)
            return "hello", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    request_timeout_seconds=12.5,
                )

        self.assertEqual(content, "hello")
        self.assertEqual(meta["provider_id"], "openai")

    def test_embed_text_with_model_provider_posts_openai_compatible_embeddings(self) -> None:
        from app.tools.model_provider_client import embed_text_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "id": "emb_1",
                    "model": "text-embedding-3-small",
                    "data": [{"index": 0, "embedding": [0.1, 0.2, 0.3]}],
                    "usage": {"prompt_tokens": 2, "total_tokens": 2},
                }
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            vector, meta = embed_text_with_model_provider(
                provider_id="openai",
                transport="openai-compatible",
                base_url="https://api.openai.com/v1",
                api_key="sk-openai",
                model="text-embedding-3-small",
                text="memory recall",
                dimensions=3,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(vector, [0.1, 0.2, 0.3])
        self.assertEqual(meta["model"], "text-embedding-3-small")
        self.assertEqual(meta["usage"], {"prompt_tokens": 2, "total_tokens": 2})
        self.assertEqual(requested["url"], "https://api.openai.com/v1/embeddings")
        self.assertEqual(requested["headers"]["Authorization"], "Bearer sk-openai")
        self.assertEqual(requested["json"], {"model": "text-embedding-3-small", "input": "memory recall"})

    def test_rerank_documents_with_model_provider_posts_openai_compatible_rerank(self) -> None:
        from app.tools.model_provider_client import rerank_documents_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "id": "rerank_1",
                    "model": "bge-reranker-v2",
                    "results": [
                        {"index": 1, "relevance_score": 0.92},
                        {"index": 0, "relevance_score": 0.34},
                    ],
                    "usage": {"total_tokens": 16},
                }
            )
        )
        with client_patch, patch("app.tools.model_provider_client.append_model_request_log"):
            results, meta = rerank_documents_with_model_provider(
                provider_id="local-rerank",
                transport="openai-compatible",
                base_url="http://127.0.0.1:8888/v1",
                api_key="",
                model="bge-reranker-v2",
                query="memory recall",
                documents=["old answer", "fresh matching answer"],
                top_n=2,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(results[0]["index"], 1)
        self.assertEqual(results[0]["score"], 0.92)
        self.assertEqual(results[0]["document"], "fresh matching answer")
        self.assertEqual(meta["model"], "bge-reranker-v2")
        self.assertEqual(meta["usage"], {"total_tokens": 16})
        self.assertEqual(requested["url"], "http://127.0.0.1:8888/v1/rerank")
        self.assertEqual(
            requested["json"],
            {
                "model": "bge-reranker-v2",
                "query": "memory recall",
                "documents": ["old answer", "fresh matching answer"],
                "top_n": 2,
                "return_documents": False,
            },
        )

    def test_embed_text_with_model_ref_falls_back_to_compatible_provider_after_primary_failure(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import embed_text_with_model_ref

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-primary",
                    "models": [
                        {
                            "model": "text-embedding-primary",
                            "capabilities": {"embedding": True},
                            "permissions": ["embedding"],
                        }
                    ],
                },
                "fallback-embed": {
                    "transport": "openai-compatible",
                    "base_url": "https://fallback.test/v1",
                    "api_key": "sk-fallback",
                    "models": [
                        {
                            "model": "text-embedding-fallback",
                            "capabilities": {"embedding": True},
                            "permissions": ["embedding"],
                        }
                    ],
                },
                "web-embed": {
                    "transport": "openai-compatible",
                    "base_url": "https://web.test/v1",
                    "api_key": "sk-web",
                    "models": [
                        {
                            "model": "text-embedding-web",
                            "capabilities": {"embedding": True},
                            "permissions": ["embedding", "network_access"],
                        }
                    ],
                },
            }
        }
        attempted: list[str] = []

        def fake_embed_with_provider(**kwargs: Any) -> tuple[list[float], dict[str, Any]]:
            model_ref = f"{kwargs['provider_id']}/{kwargs['model']}"
            attempted.append(model_ref)
            if model_ref == "openai/text-embedding-primary":
                raise RuntimeError("embedding upstream timed out")
            self.assertEqual(kwargs["dimensions"], 3)
            return [0.1, 0.2, 0.3], {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "dimensions": 3,
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "embed_text_with_model_provider", side_effect=fake_embed_with_provider):
                vector, meta = embed_text_with_model_ref(
                    model_ref="openai/text-embedding-primary",
                    text="memory recall",
                    dimensions=3,
                )

        self.assertEqual(vector, [0.1, 0.2, 0.3])
        self.assertEqual(attempted, ["openai/text-embedding-primary", "fallback-embed/text-embedding-fallback"])
        self.assertEqual(meta["provider_id"], "fallback-embed")
        self.assertEqual(meta["model"], "text-embedding-fallback")
        self.assertTrue(meta["provider_fallback_used"])
        self.assertEqual(meta["requested_model_ref"], "openai/text-embedding-primary")
        trace = meta["provider_fallback_trace"]
        self.assertEqual(trace["decision"], "fallback_selected")
        self.assertEqual(trace["selected"]["model_ref"], "fallback-embed/text-embedding-fallback")
        self.assertEqual(trace["required_capabilities"], ["embedding"])
        self.assertEqual(trace["required_permissions"], ["embedding"])
        self.assertEqual(trace["failed_candidates"][0]["error_type"], "provider_timeout")
        self.assertEqual(trace["rejected_candidates"][0]["model_ref"], "web-embed/text-embedding-web")
        self.assertEqual(trace["rejected_candidates"][0]["reason"], "permission_scope_expanded")

    def test_rerank_documents_with_model_ref_falls_back_to_compatible_provider_after_primary_failure(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import rerank_documents_with_model_ref

        saved_settings = {
            "model_providers": {
                "primary-rerank": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-primary",
                    "models": [
                        {
                            "model": "rerank-primary",
                            "capabilities": {"rerank": True},
                            "permissions": ["rerank"],
                        }
                    ],
                },
                "fallback-rerank": {
                    "transport": "openai-compatible",
                    "base_url": "https://fallback.test/v1",
                    "api_key": "sk-fallback",
                    "models": [
                        {
                            "model": "rerank-fallback",
                            "capabilities": {"rerank": True},
                            "permissions": ["rerank"],
                        }
                    ],
                },
                "web-rerank": {
                    "transport": "openai-compatible",
                    "base_url": "https://web.test/v1",
                    "api_key": "sk-web",
                    "models": [
                        {
                            "model": "rerank-web",
                            "capabilities": {"rerank": True},
                            "permissions": ["rerank", "network_access"],
                        }
                    ],
                },
            }
        }
        attempted: list[str] = []

        def fake_rerank_with_provider(**kwargs: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
            model_ref = f"{kwargs['provider_id']}/{kwargs['model']}"
            attempted.append(model_ref)
            if model_ref == "primary-rerank/rerank-primary":
                raise RuntimeError("rerank upstream timed out")
            return [{"index": 1, "score": 0.9, "document": kwargs["documents"][1]}], {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "rerank_documents_with_model_provider", side_effect=fake_rerank_with_provider):
                results, meta = rerank_documents_with_model_ref(
                    model_ref="primary-rerank/rerank-primary",
                    query="memory recall",
                    documents=["old answer", "fresh matching answer"],
                    top_n=1,
                )

        self.assertEqual(results[0]["index"], 1)
        self.assertEqual(attempted, ["primary-rerank/rerank-primary", "fallback-rerank/rerank-fallback"])
        self.assertEqual(meta["provider_id"], "fallback-rerank")
        self.assertEqual(meta["model"], "rerank-fallback")
        self.assertTrue(meta["provider_fallback_used"])
        self.assertEqual(meta["requested_model_ref"], "primary-rerank/rerank-primary")
        trace = meta["provider_fallback_trace"]
        self.assertEqual(trace["decision"], "fallback_selected")
        self.assertEqual(trace["selected"]["model_ref"], "fallback-rerank/rerank-fallback")
        self.assertEqual(trace["required_capabilities"], ["rerank"])
        self.assertEqual(trace["required_permissions"], ["rerank"])
        self.assertEqual(trace["failed_candidates"][0]["error_type"], "provider_timeout")
        self.assertEqual(trace["rejected_candidates"][0]["model_ref"], "web-rerank/rerank-web")
        self.assertEqual(trace["rejected_candidates"][0]["reason"], "permission_scope_expanded")

    def test_chat_openai_compatible_posts_structured_response_format(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        schema = {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": False,
        }
        fake_client, client_patch = self._patched_client(
            FakeResponse({"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": '{"answer":"hello"}'}}]})
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
                structured_output_schema=schema,
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, '{"answer":"hello"}')
        self.assertEqual(meta["structured_output_strategy"], "json_schema")
        self.assertEqual(
            requested["json"]["response_format"],
            {
                "type": "json_schema",
                "json_schema": {
                    "name": "toograph_structured_output",
                    "schema": schema,
                    "strict": False,
                },
            },
        )

    def test_chat_openai_compatible_retries_without_structured_format_when_unsupported(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        schema = {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": False,
        }
        fake_client, client_patch = self._patched_client(
            [
                FakeResponse({"error": "unsupported"}, status_code=400, text="response_format unsupported"),
                FakeResponse({"error": "unsupported"}, status_code=400, text="json_schema unsupported"),
                FakeResponse({"id": "chatcmpl_retry", "model": "gpt-4.1", "choices": [{"message": {"content": '{"answer":"hello"}'}}]}),
            ]
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
                structured_output_schema=schema,
            )

        self.assertEqual(content, '{"answer":"hello"}')
        self.assertEqual(meta["structured_output_strategy"], "prompt_validation")
        self.assertEqual(len(fake_client.post_calls), 3)
        self.assertIn("response_format", fake_client.post_calls[0]["json"])
        self.assertIn("response_format", fake_client.post_calls[1]["json"])
        self.assertNotIn("response_format", fake_client.post_calls[2]["json"])
        self.assertTrue(any("JSON Schema response_format" in warning for warning in meta["warnings"]))

    def test_chat_with_model_ref_falls_back_to_compatible_provider_after_primary_failure(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        schema = {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": False,
        }
        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-primary",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
                "anthropic": {
                    "base_url": "https://fallback.test/v1",
                    "api_key": "sk-fallback",
                    "models": [
                        {
                            "model": "claude-fallback",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
                "web-gateway": {
                    "transport": "openai-compatible",
                    "base_url": "https://web.test/v1",
                    "api_key": "sk-web",
                    "models": [
                        {
                            "model": "browsing-model",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation", "network_access"],
                        }
                    ],
                },
            }
        }
        attempted: list[str] = []

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            model_ref = f"{kwargs['provider_id']}/{kwargs['model']}"
            attempted.append(model_ref)
            if model_ref == "openai/gpt-primary":
                raise RuntimeError("upstream timed out")
            return '{"answer":"fallback"}', {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "warnings": [],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-primary",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    structured_output_schema=schema,
                )

        self.assertEqual(content, '{"answer":"fallback"}')
        self.assertEqual(attempted, ["openai/gpt-primary", "anthropic/claude-fallback"])
        self.assertEqual(meta["provider_id"], "anthropic")
        self.assertEqual(meta["model"], "claude-fallback")
        self.assertTrue(meta["provider_fallback_used"])
        self.assertEqual(meta["requested_model_ref"], "openai/gpt-primary")
        trace = meta["provider_fallback_trace"]
        self.assertEqual(trace["kind"], "provider_fallback_trace")
        self.assertEqual(trace["decision"], "fallback_selected")
        self.assertEqual(trace["selected"]["model_ref"], "anthropic/claude-fallback")
        self.assertEqual(trace["failed_candidates"][0]["model_ref"], "openai/gpt-primary")
        self.assertEqual(trace["failed_candidates"][0]["error_type"], "provider_timeout")
        self.assertEqual(trace["rejected_candidates"][0]["model_ref"], "web-gateway/browsing-model")
        self.assertEqual(trace["rejected_candidates"][0]["reason"], "permission_scope_expanded")
        self.assertTrue(any("fallback" in warning.lower() for warning in meta["warnings"]))

    def test_chat_with_model_ref_selects_active_credential_from_pool(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-provider-default",
                    "credential_pool": [
                        {
                            "credential_id": "cooling",
                            "api_key": "sk-cooling",
                            "status": "cooling_down",
                            "cooldown_until": "2999-01-01T00:00:00Z",
                            "failure_count": 2,
                        },
                        {
                            "credential_id": "disabled",
                            "api_key": "sk-disabled",
                            "status": "disabled",
                        },
                        {
                            "credential_id": "primary",
                            "api_key": "sk-primary",
                            "status": "active",
                            "failure_count": 1,
                        },
                    ],
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        captured: dict[str, Any] = {}

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            captured.update(kwargs)
            return "ok", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "warnings": [],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-primary",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "ok")
        self.assertEqual(captured["api_key"], "sk-primary")
        self.assertEqual(
            meta["provider_credential"],
            {
                "credential_id": "primary",
                "status": "active",
                "source": "credential_pool",
            },
        )

    def test_chat_with_model_ref_updates_selected_credential_cooldown_after_provider_failure(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "",
                    "credential_pool": [
                        {
                            "credential_id": "primary",
                            "api_key": "sk-primary",
                            "status": "active",
                            "cooldown_until": None,
                            "failure_count": 1,
                        },
                    ],
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        saved_payload: dict[str, Any] = {}

        def fake_chat_with_provider(**_kwargs: Any) -> tuple[str, dict[str, Any]]:
            raise httpx.TimeoutException("provider timed out")

        def capture_save(payload: dict[str, Any]) -> dict[str, Any]:
            saved_payload.update(payload)
            return payload

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "save_app_settings", side_effect=capture_save):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    with self.assertRaises(httpx.TimeoutException):
                        chat_with_model_ref_with_meta(
                            model_ref="openai/gpt-primary",
                            system_prompt="sys",
                            user_prompt="user",
                            temperature=0.2,
                        )

        credential = saved_payload["model_providers"]["openai"]["credential_pool"][0]
        self.assertEqual(credential["credential_id"], "primary")
        self.assertEqual(credential["api_key"], "sk-primary")
        self.assertEqual(credential["status"], "cooling_down")
        self.assertEqual(credential["failure_count"], 2)
        self.assertIsInstance(credential["cooldown_until"], str)

    def test_chat_with_model_ref_clears_selected_credential_failure_state_after_success(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "",
                    "credential_pool": [
                        {
                            "credential_id": "primary",
                            "api_key": "sk-primary",
                            "status": "active",
                            "cooldown_until": None,
                            "failure_count": 2,
                        },
                    ],
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        saved_payload: dict[str, Any] = {}

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            return "ok", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "warnings": [],
            }

        def capture_save(payload: dict[str, Any]) -> dict[str, Any]:
            saved_payload.update(payload)
            return payload

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "save_app_settings", side_effect=capture_save):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    _content, meta = chat_with_model_ref_with_meta(
                        model_ref="openai/gpt-primary",
                        system_prompt="sys",
                        user_prompt="user",
                        temperature=0.2,
                    )

        self.assertEqual(meta["provider_credential"]["credential_id"], "primary")
        self.assertEqual(
            saved_payload["model_providers"]["openai"]["credential_pool"],
            [
                {
                    "credential_id": "primary",
                    "status": "active",
                    "cooldown_until": None,
                    "failure_count": 0,
                    "api_key": "sk-primary",
                },
            ],
        )

    def test_chat_with_model_ref_blocks_provider_call_when_cost_budget_preflight_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        provider_calls: list[dict[str, Any]] = []
        preflight_decision = {
            "kind": "provider_cost_budget_preflight",
            "version": 1,
            "mode": "enforce_existing_window",
            "currency": "USD",
            "status": "blocked",
            "reason": "provider_cost_budget_already_exhausted",
            "budget_limit_usd": 0.005,
            "budget_window": "run",
            "previous_window_cost_usd": 0.006,
            "budget_window_scope": {"window": "run", "root_run_id": "run_budget_guard"},
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "evaluate_provider_cost_budget_preflight", return_value=preflight_decision):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    with use_model_call_context(run_id="run_budget_guard", root_run_id="run_budget_guard", node_id="agent"):
                        with self.assertRaisesRegex(RuntimeError, "provider_cost_budget_already_exhausted"):
                            chat_with_model_ref_with_meta(
                                model_ref="openai/gpt-primary",
                                system_prompt="sys",
                                user_prompt="user",
                                temperature=0.2,
                                provider_cost_budget={"limit_usd": 0.005, "window": "run"},
                            )

        self.assertEqual(provider_calls, [])

    def test_chat_with_model_ref_blocks_provider_call_when_rate_profile_preflight_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        provider_calls: list[dict[str, Any]] = []
        preflight_decision = {
            "kind": "provider_rate_profile_preflight",
            "version": 1,
            "mode": "enforce_recent_window",
            "status": "blocked",
            "reason": "provider_rate_profile_already_exhausted",
            "requests_per_minute": 1,
            "observed_requests": 1,
            "limit_exceeded": ["requests_per_minute"],
            "scope": {"provider_id": "openai"},
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", return_value=preflight_decision):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    with use_model_call_context(run_id="run_rate_guard", root_run_id="run_rate_guard", node_id="agent"):
                        with self.assertRaisesRegex(RuntimeError, "provider_rate_profile_already_exhausted"):
                            chat_with_model_ref_with_meta(
                                model_ref="openai/gpt-primary",
                                system_prompt="sys",
                                user_prompt="user",
                                temperature=0.2,
                                provider_rate_profile={"requests_per_minute": 1},
                            )

        self.assertEqual(provider_calls, [])

    def test_chat_with_model_ref_blocks_second_call_when_rate_profile_concurrency_is_exhausted(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        first_call_entered = threading.Event()
        release_first_call = threading.Event()
        provider_calls: list[dict[str, Any]] = []
        first_result: list[tuple[str, dict[str, Any]]] = []
        first_errors: list[Exception] = []

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            if len(provider_calls) == 1:
                first_call_entered.set()
                release_first_call.wait(timeout=2)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        def run_first_call() -> None:
            try:
                with use_model_call_context(run_id="run_rate_concurrency_a", root_run_id="run_rate_concurrency_a", node_id="agent"):
                    first_result.append(
                        chat_with_model_ref_with_meta(
                            model_ref="openai/gpt-primary",
                            system_prompt="sys",
                            user_prompt="user",
                            temperature=0.2,
                            provider_rate_profile={"concurrency": 1},
                        )
                    )
            except Exception as exc:
                first_errors.append(exc)

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", return_value={"status": "within_profile"}):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    thread = threading.Thread(target=run_first_call)
                    thread.start()
                    try:
                        self.assertTrue(first_call_entered.wait(timeout=2))
                        with use_model_call_context(
                            run_id="run_rate_concurrency_b",
                            root_run_id="run_rate_concurrency_b",
                            node_id="agent",
                        ):
                            with self.assertRaisesRegex(RuntimeError, "provider_rate_profile_concurrency_exhausted"):
                                chat_with_model_ref_with_meta(
                                    model_ref="openai/gpt-primary",
                                    system_prompt="sys",
                                    user_prompt="user",
                                    temperature=0.2,
                                    provider_rate_profile={"concurrency": 1},
                                )
                        self.assertEqual(len(provider_calls), 1)
                    finally:
                        release_first_call.set()
                        thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual(first_errors, [])
        self.assertEqual(first_result[0][0], "ok")

    def test_chat_with_model_ref_blocks_provider_call_when_estimated_request_tokens_exceed_rate_profile(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        preflight_calls: list[dict[str, Any]] = []
        provider_calls: list[dict[str, Any]] = []

        def fake_rate_preflight(*args: Any, **kwargs: Any) -> dict[str, Any]:
            preflight_calls.append({"args": args, "kwargs": kwargs})
            return {
                "kind": "provider_rate_profile_preflight",
                "version": 1,
                "mode": "enforce_recent_window",
                "status": "blocked",
                "reason": "provider_rate_profile_projected_window_exhausted",
                "tokens_per_minute": 5,
                "observed_total_tokens": 0,
                "estimated_request_tokens": kwargs["estimated_request_tokens"],
                "projected_total_tokens": kwargs["estimated_request_tokens"],
                "limit_exceeded": ["tokens_per_minute"],
                "scope": {"provider_id": "openai"},
            }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", side_effect=fake_rate_preflight):
                with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                    with use_model_call_context(run_id="run_rate_projection", root_run_id="run_rate_projection", node_id="agent"):
                        with self.assertRaisesRegex(RuntimeError, "provider_rate_profile_projected_window_exhausted"):
                            chat_with_model_ref_with_meta(
                                model_ref="openai/gpt-primary",
                                system_prompt="system prompt",
                                user_prompt="user prompt with enough content",
                                temperature=0.2,
                                provider_rate_profile={"tokens_per_minute": 5},
                            )

        self.assertEqual(provider_calls, [])
        self.assertGreaterEqual(preflight_calls[0]["kwargs"]["estimated_request_tokens"], 6)

    def test_chat_with_model_ref_waits_and_retries_rate_profile_preflight_when_configured(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.storage import database
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        preflight_decisions = [
            {
                "kind": "provider_rate_profile_preflight",
                "version": 1,
                "mode": "enforce_recent_window",
                "status": "blocked",
                "reason": "provider_rate_profile_already_exhausted",
                "requests_per_minute": 1,
                "observed_requests": 1,
                "retry_after_seconds": 0.25,
                "limit_exceeded": ["requests_per_minute"],
                "scope": {"provider_id": "openai"},
            },
            {"kind": "provider_rate_profile_preflight", "status": "within_profile"},
        ]
        provider_calls: list[dict[str, Any]] = []
        slept: list[float] = []

        def fake_rate_preflight(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
            return preflight_decisions.pop(0)

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
                        with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", side_effect=fake_rate_preflight):
                            with patch.object(model_provider_client, "reserve_provider_rate_profile_capacity", return_value={}):
                                with patch.object(model_provider_client, "_sleep", side_effect=lambda seconds: slept.append(seconds)):
                                    with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                                        with use_model_call_context(run_id="run_rate_wait", root_run_id="run_rate_wait", node_id="agent"):
                                            content, meta = chat_with_model_ref_with_meta(
                                                model_ref="openai/gpt-primary",
                                                system_prompt="sys",
                                                user_prompt="user",
                                                temperature=0.2,
                                                provider_rate_profile={
                                                    "requests_per_minute": 1,
                                                    "wait_strategy": "wait",
                                                    "max_wait_seconds": 1,
                                                },
                                            )
                    with database.get_connection() as connection:
                        queue_statuses = [
                            row["status"]
                            for row in connection.execute(
                                "SELECT status FROM provider_rate_wait_queue ORDER BY enqueued_at ASC"
                            ).fetchall()
                        ]

        self.assertEqual(content, "ok")
        self.assertEqual(meta["provider_id"], "openai")
        self.assertEqual(len(provider_calls), 1)
        self.assertEqual(slept, [0.25])
        self.assertEqual(preflight_decisions, [])
        self.assertEqual(queue_statuses, ["released"])

    def test_chat_with_model_ref_waits_multiple_rate_profile_windows_within_budget(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.storage import database
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        preflight_decisions = [
            {
                "kind": "provider_rate_profile_preflight",
                "version": 1,
                "mode": "enforce_recent_window",
                "status": "blocked",
                "reason": "provider_rate_profile_already_exhausted",
                "requests_per_minute": 1,
                "observed_requests": 1,
                "retry_after_seconds": 0.2,
                "limit_exceeded": ["requests_per_minute"],
                "scope": {"provider_id": "openai"},
            },
            {
                "kind": "provider_rate_profile_preflight",
                "version": 1,
                "mode": "enforce_recent_window",
                "status": "blocked",
                "reason": "provider_rate_profile_already_exhausted",
                "requests_per_minute": 1,
                "observed_requests": 1,
                "retry_after_seconds": 0.3,
                "limit_exceeded": ["requests_per_minute"],
                "scope": {"provider_id": "openai"},
            },
            {"kind": "provider_rate_profile_preflight", "status": "within_profile"},
        ]
        provider_calls: list[dict[str, Any]] = []
        slept: list[float] = []

        def fake_rate_preflight(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
            return preflight_decisions.pop(0)

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            provider_calls.append(kwargs)
            return "ok", {"provider_id": kwargs["provider_id"], "model": kwargs["model"], "warnings": []}

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
                        with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", side_effect=fake_rate_preflight):
                            with patch.object(model_provider_client, "reserve_provider_rate_profile_capacity", return_value={}):
                                with patch.object(model_provider_client, "_sleep", side_effect=lambda seconds: slept.append(seconds)):
                                    with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                                        with use_model_call_context(run_id="run_rate_wait_chain", root_run_id="run_rate_wait_chain", node_id="agent"):
                                            content, meta = chat_with_model_ref_with_meta(
                                                model_ref="openai/gpt-primary",
                                                system_prompt="sys",
                                                user_prompt="user",
                                                temperature=0.2,
                                                provider_rate_profile={
                                                    "requests_per_minute": 1,
                                                    "wait_strategy": "wait",
                                                    "max_wait_seconds": 1,
                                                },
                                            )
                    with database.get_connection() as connection:
                        queue_statuses = [
                            row["status"]
                            for row in connection.execute(
                                "SELECT status FROM provider_rate_wait_queue ORDER BY enqueued_at ASC"
                            ).fetchall()
                        ]

        self.assertEqual(content, "ok")
        self.assertEqual(meta["provider_id"], "openai")
        self.assertEqual(len(provider_calls), 1)
        self.assertEqual(slept, [0.2, 0.3])
        self.assertEqual(preflight_decisions, [])
        self.assertEqual(queue_statuses, ["released"])

    def test_rate_profile_wait_preflight_uses_fifo_queue_for_same_provider(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.storage import database
        from app.tools import model_provider_client

        first_sleep_entered = threading.Event()
        release_first_sleep = threading.Event()
        second_preflight_seen = threading.Event()
        lock = threading.Lock()
        preflight_counts: dict[str, int] = {}
        sleep_order: list[str] = []
        errors: list[tuple[str, BaseException]] = []
        results: list[str] = []
        rate_profile = {
            "requests_per_minute": 1,
            "wait_strategy": "wait",
            "max_wait_seconds": 1,
        }

        def fake_rate_preflight(call_context: dict[str, Any], *_args: Any, **_kwargs: Any) -> dict[str, Any]:
            run_id = str(call_context.get("run_id") or "")
            with lock:
                count = preflight_counts.get(run_id, 0)
                preflight_counts[run_id] = count + 1
            if run_id == "run_rate_wait_queue_b" and count == 0:
                second_preflight_seen.set()
            if count == 0:
                return {
                    "kind": "provider_rate_profile_preflight",
                    "version": 1,
                    "mode": "enforce_recent_window",
                    "status": "blocked",
                    "reason": "provider_rate_profile_already_exhausted",
                    "requests_per_minute": 1,
                    "observed_requests": 1,
                    "retry_after_seconds": 0.1,
                    "limit_exceeded": ["requests_per_minute"],
                    "scope": {"provider_id": "openai"},
                }
            return {"kind": "provider_rate_profile_preflight", "status": "within_profile"}

        def fake_sleep(seconds: float) -> None:
            thread_name = threading.current_thread().name
            with lock:
                sleep_order.append(thread_name)
            if thread_name == "rate-wait-a":
                first_sleep_entered.set()
                if not release_first_sleep.wait(timeout=2):
                    raise AssertionError("first rate waiter was not released")
            elif thread_name == "rate-wait-b" and not release_first_sleep.is_set():
                raise AssertionError("second rate waiter slept before first waiter released")

        def run_waiter(run_id: str) -> None:
            try:
                with use_model_call_context(run_id=run_id, root_run_id=run_id, node_id="agent"):
                    model_provider_client._enforce_provider_rate_profile_preflight(
                        {"provider_id": "openai", "model": "gpt-primary"},
                        rate_profile,
                        estimated_request_tokens=1,
                    )
                results.append(run_id)
            except BaseException as exc:  # pragma: no cover - asserted below
                errors.append((run_id, exc))

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    with patch.object(model_provider_client, "evaluate_provider_rate_profile_preflight", side_effect=fake_rate_preflight):
                        with patch.object(model_provider_client, "reserve_provider_rate_profile_capacity", return_value={}):
                            with patch.object(model_provider_client, "_sleep", side_effect=fake_sleep):
                                first = threading.Thread(target=run_waiter, args=("run_rate_wait_queue_a",), name="rate-wait-a")
                                second = threading.Thread(target=run_waiter, args=("run_rate_wait_queue_b",), name="rate-wait-b")
                                first.start()
                                self.assertTrue(first_sleep_entered.wait(timeout=2))
                                second.start()
                                self.assertTrue(second_preflight_seen.wait(timeout=2))
                                release_first_sleep.set()
                                first.join(timeout=2)
                                second.join(timeout=2)
                    with database.get_connection() as connection:
                        queue_rows = connection.execute(
                            """
                            SELECT run_id, status
                            FROM provider_rate_wait_queue
                            ORDER BY enqueued_at ASC
                            """
                        ).fetchall()

        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(sleep_order, ["rate-wait-a", "rate-wait-b"])
        self.assertCountEqual(results, ["run_rate_wait_queue_a", "run_rate_wait_queue_b"])
        self.assertEqual([row["run_id"] for row in queue_rows], ["run_rate_wait_queue_a", "run_rate_wait_queue_b"])
        self.assertEqual([row["status"] for row in queue_rows], ["released", "released"])

    def test_chat_with_model_ref_holds_rate_reservation_during_provider_call(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        active_during_call: list[dict[str, Any]] = []

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            with database.get_connection() as connection:
                rows = connection.execute(
                    """
                    SELECT provider, status, estimated_request_tokens
                    FROM provider_rate_reservations
                    WHERE provider = ?
                    """,
                    (kwargs["provider_id"],),
                ).fetchall()
            active_during_call.extend(dict(row) for row in rows)
            return "ok", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "warnings": [],
                "usage": {"input_tokens": 3, "output_tokens": 2},
            }

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_rate_reservation_client"
                    run["root_run_id"] = "run_rate_reservation_client"
                    run["run_path"] = ["run_rate_reservation_client"]
                    run_store.save_run(run)

                    with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
                        with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                            with use_model_call_context(
                                run_id="run_rate_reservation_client",
                                root_run_id="run_rate_reservation_client",
                                node_id="agent",
                            ):
                                content, meta = chat_with_model_ref_with_meta(
                                    model_ref="openai/gpt-primary",
                                    system_prompt="sys",
                                    user_prompt="user",
                                    temperature=0.2,
                                    provider_rate_profile={"requests_per_minute": 2, "tokens_per_minute": 100},
                                )

                    with database.get_connection() as connection:
                        reservation_rows = connection.execute(
                            """
                            SELECT status
                            FROM provider_rate_reservations
                            WHERE provider = 'openai'
                            """
                        ).fetchall()

        self.assertEqual(content, "ok")
        self.assertEqual(len(active_during_call), 1)
        self.assertEqual(active_during_call[0]["provider"], "openai")
        self.assertEqual(active_during_call[0]["status"], "active")
        self.assertGreaterEqual(active_during_call[0]["estimated_request_tokens"], 1)
        self.assertEqual([row["status"] for row in reservation_rows], ["released"])
        self.assertEqual(meta["provider_rate_reservation"]["kind"], "provider_rate_reservation")
        self.assertEqual(meta["provider_rate_reservation"]["status"], "released")
        self.assertEqual(meta["provider_rate_reservation"]["provider_id"], "openai")
        self.assertGreaterEqual(meta["provider_rate_reservation"]["estimated_request_tokens"], 1)
        self.assertTrue(str(meta["provider_rate_reservation"].get("released_at") or ""))

    def test_chat_with_model_ref_estimates_provider_cost_from_model_pricing(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                            "pricing": {
                                "input_per_million_usd": 2.0,
                                "output_per_million_usd": 8.0,
                            },
                        }
                    ],
                },
            }
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            return "ok", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "usage": {"input_tokens": 1000, "output_tokens": 500},
                "warnings": [],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                _content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-primary",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    provider_cost_budget={"limit_usd": 0.005, "window": "run"},
                )

        self.assertEqual(
            meta["provider_cost_estimate"],
            {
                "kind": "provider_cost_estimate",
                "version": 1,
                "currency": "USD",
                "status": "estimated",
                "input_tokens": 1000,
                "output_tokens": 500,
                "total_tokens": 1500,
                "input_cost_usd": 0.002,
                "output_cost_usd": 0.004,
                "estimated_cost_usd": 0.006,
                "pricing": {
                    "input_per_million_usd": 2.0,
                    "output_per_million_usd": 8.0,
                },
                "budget_limit_usd": 0.005,
                "budget_window": "run",
                "budget_status": "over_budget",
            },
        )

    def test_chat_with_model_ref_records_provider_rate_decision_from_profile(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-openai",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            return "ok", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "usage": {"input_tokens": 900, "output_tokens": 500},
                "warnings": [],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                _content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-primary",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    provider_rate_profile={
                        "requests_per_minute": 30,
                        "tokens_per_minute": 1200,
                        "concurrency": 2,
                    },
                )

        self.assertEqual(
            meta["provider_rate_decision"],
            {
                "kind": "provider_rate_decision",
                "version": 1,
                "mode": "audit_only",
                "scope": "single_call",
                "status": "over_limit",
                "requests_per_minute": 30,
                "tokens_per_minute": 1200,
                "concurrency": 2,
                "observed_requests": 1,
                "observed_total_tokens": 1400,
                "limit_exceeded": ["tokens_per_minute"],
                "reason": "single_call_tokens_exceed_profile",
            },
        )

    def test_chat_with_model_ref_continues_to_next_fallback_when_first_fallback_fails(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        saved_settings = {
            "model_providers": {
                "openai": {
                    "enabled": True,
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-primary",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
                "fallback-a": {
                    "transport": "openai-compatible",
                    "base_url": "https://fallback-a.test/v1",
                    "api_key": "sk-a",
                    "models": [
                        {
                            "model": "gpt-fallback-a",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
                "fallback-b": {
                    "transport": "openai-compatible",
                    "base_url": "https://fallback-b.test/v1",
                    "api_key": "sk-b",
                    "models": [
                        {
                            "model": "gpt-fallback-b",
                            "capabilities": {"chat": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            }
        }
        attempted: list[str] = []

        def fake_chat_with_provider(**kwargs: Any) -> tuple[str, dict[str, Any]]:
            model_ref = f"{kwargs['provider_id']}/{kwargs['model']}"
            attempted.append(model_ref)
            if model_ref in {"openai/gpt-primary", "fallback-a/gpt-fallback-a"}:
                raise RuntimeError(f"{model_ref} timed out")
            return "fallback b answer", {
                "provider_id": kwargs["provider_id"],
                "model": kwargs["model"],
                "warnings": [],
            }

        with patch.object(model_provider_client, "load_app_settings", return_value=saved_settings):
            with patch.object(model_provider_client, "chat_with_model_provider", side_effect=fake_chat_with_provider):
                content, meta = chat_with_model_ref_with_meta(
                    model_ref="openai/gpt-primary",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "fallback b answer")
        self.assertEqual(attempted, ["openai/gpt-primary", "fallback-a/gpt-fallback-a", "fallback-b/gpt-fallback-b"])
        trace = meta["provider_fallback_trace"]
        self.assertEqual(trace["selected"]["model_ref"], "fallback-b/gpt-fallback-b")
        self.assertEqual(
            [(attempt["model_ref"], attempt["status"]) for attempt in trace["attempts"]],
            [
                ("openai/gpt-primary", "failed"),
                ("fallback-a/gpt-fallback-a", "failed"),
                ("fallback-b/gpt-fallback-b", "selected"),
            ],
        )
        self.assertEqual(trace["failed_candidates"][1]["model_ref"], "fallback-a/gpt-fallback-a")
        self.assertEqual(trace["failed_candidates"][1]["reason"], "fallback_provider_failed")
        self.assertTrue(any("fallback-a/gpt-fallback-a" in warning for warning in trace["warnings"]))

    def test_chat_with_model_ref_uses_eval_runtime_fixture_for_fallback(self) -> None:
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        fixture = {
            "model_providers": {
                "eval-primary": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:9999/v1",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
                "eval-fallback": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:9998/v1",
                    "models": [
                        {
                            "model": "gpt-fallback",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                },
            },
            "failures": {
                "eval-primary/gpt-primary": {
                    "error_type": "provider_timeout",
                    "message": "eval injected timeout",
                }
            },
            "responses": {
                "eval-fallback/gpt-fallback": {
                    "content": '{"answer":"fallback answer"}',
                    "meta": {"response_id": "fixture-response-1"},
                }
            },
        }

        content, meta = chat_with_model_ref_with_meta(
            model_ref="eval-primary/gpt-primary",
            system_prompt="sys",
            user_prompt="user",
            temperature=0.2,
            structured_output_schema={
                "type": "object",
                "properties": {"answer": {"type": "string"}},
                "required": ["answer"],
                "additionalProperties": False,
            },
            model_runtime_fixture=fixture,
        )

        self.assertEqual(content, '{"answer":"fallback answer"}')
        self.assertEqual(meta["provider_id"], "eval-fallback")
        self.assertEqual(meta["model"], "gpt-fallback")
        self.assertEqual(meta["response_id"], "fixture-response-1")
        self.assertTrue(meta["provider_fallback_used"])
        trace = meta["provider_fallback_trace"]
        self.assertEqual(trace["requested"]["model_ref"], "eval-primary/gpt-primary")
        self.assertEqual(trace["selected"]["model_ref"], "eval-fallback/gpt-fallback")
        self.assertEqual(trace["failed_candidates"][0]["model_ref"], "eval-primary/gpt-primary")
        self.assertEqual(trace["failed_candidates"][0]["error_type"], "provider_timeout")

    def test_chat_with_model_ref_fixture_response_list_can_match_prompt_terms(self) -> None:
        from app.tools.model_provider_client import chat_with_model_ref_with_meta

        fixture = {
            "model_providers": {
                "eval-primary": {
                    "enabled": True,
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:9999/v1",
                    "models": [
                        {
                            "model": "gpt-primary",
                            "capabilities": {"chat": True, "structured_output": True},
                            "permissions": ["text_generation"],
                        }
                    ],
                }
            },
            "responses": [
                {
                    "model_ref": "eval-primary/gpt-primary",
                    "user_contains": ["eval injected primary timeout"],
                    "content": '{"answer":"fallback after failure"}',
                    "meta": {"response_id": "fixture-after-failure"},
                },
                {
                    "model_ref": "eval-primary/gpt-primary",
                    "content": '{"answer":"initial selection"}',
                    "meta": {"response_id": "fixture-initial"},
                },
            ],
        }

        initial_content, initial_meta = chat_with_model_ref_with_meta(
            model_ref="eval-primary/gpt-primary",
            system_prompt="sys",
            user_prompt="ordinary prompt",
            temperature=0.2,
            model_runtime_fixture=fixture,
        )
        failure_content, failure_meta = chat_with_model_ref_with_meta(
            model_ref="eval-primary/gpt-primary",
            system_prompt="sys",
            user_prompt="capability_result error: eval injected primary timeout",
            temperature=0.2,
            model_runtime_fixture=fixture,
        )

        self.assertEqual(initial_content, '{"answer":"initial selection"}')
        self.assertEqual(initial_meta["response_id"], "fixture-initial")
        self.assertEqual(failure_content, '{"answer":"fallback after failure"}')
        self.assertEqual(failure_meta["response_id"], "fixture-after-failure")

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
                        "file_url": "file:///tmp/reference.png",
                    }
                ],
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(
            requested["json"]["messages"][1]["content"],
            [
                {"type": "text", "text": "user"},
                {"type": "image_url", "image_url": {"url": "file:///tmp/reference.png"}},
            ],
        )

    def test_chat_openai_compatible_inlines_local_image_attachments_as_data_urls(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "reference.jpg"
            image_path.write_bytes(b"fake-jpeg")
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
                            "name": "reference.jpg",
                            "mime_type": "image/jpeg",
                            "filesystem_path": str(image_path),
                            "file_url": image_path.resolve().as_uri(),
                        }
                    ],
                )

        requested = fake_client.post_calls[0]
        image_url = requested["json"]["messages"][1]["content"][1]["image_url"]["url"]
        self.assertEqual(content, "hello")
        self.assertTrue(str(image_url).startswith("data:image/jpeg;base64,"))

    def test_chat_codex_responses_inlines_local_image_attachments_as_data_urls(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_provider

        calls: list[list[dict[str, Any]]] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "reference.jpg"
            image_path.write_bytes(b"fake-jpeg")

            def fake_codex_chat(**kwargs: Any) -> tuple[str, dict[str, Any]]:
                calls.append(kwargs["input_attachments"])
                return "hello", {"model": "gpt-5.5", "provider_id": "openai-codex", "temperature": 0.2}

            with patch.object(model_provider_client, "_chat_codex_responses", side_effect=fake_codex_chat):
                content, _meta = chat_with_model_provider(
                    provider_id="openai-codex",
                    transport="codex-responses",
                    base_url="https://chatgpt.com/backend-api/codex",
                    api_key="",
                    model="gpt-5.5",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                    input_attachments=[
                        {
                            "type": "image",
                            "state_key": "reference_image",
                            "name": "reference.jpg",
                            "mime_type": "image/jpeg",
                            "filesystem_path": str(image_path),
                            "file_url": image_path.resolve().as_uri(),
                        }
                    ],
                )

        self.assertEqual(content, "hello")
        self.assertTrue(str(calls[0][0].get("data_url")).startswith("data:image/jpeg;base64,"))

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
                        "file_url": "file:///tmp/clip.mp4",
                    }
                ],
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(
            requested["json"]["messages"][1]["content"],
            [
                {"type": "text", "text": "user"},
                {"type": "video_url", "video_url": {"url": "file:///tmp/clip.mp4"}},
            ],
        )

    def test_chat_provider_falls_back_from_native_video_to_extracted_frames(self) -> None:
        from app.tools import model_provider_client
        from app.tools.model_provider_client import chat_with_model_provider

        calls: list[list[dict[str, Any]]] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            frame_path = Path(temp_dir) / "clip_frame_001.jpg"
            frame_path.write_bytes(b"fake-frame")
            frame_attachments = [
                {
                    "type": "image",
                    "state_key": "clip#frame_001",
                    "name": "clip_frame_001.jpg",
                    "mime_type": "image/jpeg",
                    "filesystem_path": str(frame_path),
                    "file_url": frame_path.resolve().as_uri(),
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
                                "file_url": "file:///tmp/clip.mp4",
                            }
                        ],
                    )

        self.assertEqual(content, "hello")
        self.assertEqual(calls[0][0]["type"], "video")
        self.assertEqual(calls[1][0]["type"], "image")
        self.assertTrue(str(calls[1][0].get("data_url")).startswith("data:image/jpeg;base64,"))
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

    def test_chat_anthropic_applies_preferred_prompt_cache_control(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client, client_patch = self._patched_client(
            FakeResponse(
                {
                    "id": "msg_cache",
                    "model": "claude-sonnet-4-5",
                    "content": [{"type": "text", "text": "hello"}],
                    "usage": {
                        "input_tokens": 5,
                        "cache_creation_input_tokens": 20,
                        "cache_read_input_tokens": 0,
                        "output_tokens": 1,
                    },
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
                system_prompt="stable system",
                user_prompt="dynamic user",
                temperature=0.2,
                max_tokens=128,
                prompt_cache_policy={
                    "kind": "prompt_cache_policy",
                    "requested_policy": "prefer",
                    "eligible": True,
                    "stable_prefix_hash": "sha256:stable",
                },
            )

        requested = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(
            requested["json"]["system"],
            [
                {
                    "type": "text",
                    "text": "stable system",
                    "cache_control": {"type": "ephemeral"},
                }
            ],
        )
        self.assertEqual(meta["provider_prompt_cache_result"]["mode"], "provider_applied")
        self.assertEqual(meta["provider_prompt_cache_result"]["provider_cache_control"], "anthropic_cache_control")
        self.assertEqual(meta["provider_prompt_cache_result"]["usage"]["cache_creation_input_tokens"], 20)

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
