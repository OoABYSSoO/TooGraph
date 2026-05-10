from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

PROXY_ENV = {
    "HTTPS_PROXY": "http://127.0.0.1:7897",
    "HTTP_PROXY": "http://127.0.0.1:7897",
    "ALL_PROXY": "socks://127.0.0.1:7897/",
}


class FakeResponse:
    def __init__(
        self,
        payload: dict[str, Any] | None,
        status_code: int = 200,
        text: str = "",
        headers: dict[str, str] | None = None,
        json_error: Exception | None = None,
    ) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = text or json.dumps(payload or {}, ensure_ascii=False)
        self.headers = headers or {}
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
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
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


class OpenAICodexProviderTests(unittest.TestCase):
    def test_codex_browser_auth_start_builds_pkce_authorize_url(self) -> None:
        from app.tools.openai_codex_client import poll_codex_browser_login, start_codex_browser_login

        with tempfile.TemporaryDirectory() as temp_dir:
            auth_path = Path(temp_dir) / "openai_codex_auth.json"
            with patch("app.tools.openai_codex_client.CODEX_AUTH_PATH", auth_path):
                with patch("app.tools.openai_codex_client._start_codex_browser_callback_server") as callback_server:
                    session = start_codex_browser_login()
                    pending = poll_codex_browser_login(state=session["state"])

        callback_server.assert_called_once()
        self.assertEqual(session["callback_url"], "http://localhost:1455/auth/callback")
        self.assertGreaterEqual(session["expires_in"], 300)
        self.assertGreaterEqual(session["interval"], 2)
        parsed = urlparse(session["authorization_url"])
        query = parse_qs(parsed.query)
        self.assertEqual(f"{parsed.scheme}://{parsed.netloc}{parsed.path}", "https://auth.openai.com/oauth/authorize")
        self.assertEqual(query["response_type"], ["code"])
        self.assertEqual(query["client_id"], ["app_EMoamEEZ73f0CkXaXp7hrann"])
        self.assertEqual(query["redirect_uri"], ["http://localhost:1455/auth/callback"])
        self.assertEqual(query["scope"], ["openid profile email offline_access"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["state"], [session["state"]])
        self.assertEqual(query["id_token_add_organizations"], ["true"])
        self.assertEqual(query["codex_cli_simplified_flow"], ["true"])
        self.assertEqual(query["originator"], ["toograph"])
        self.assertEqual(pending["status"], "pending")
        self.assertFalse(pending["authenticated"])

    def test_codex_browser_callback_exchanges_code_and_stores_token(self) -> None:
        from app.tools.openai_codex_client import complete_codex_browser_login_callback, start_codex_browser_login

        fake_client = FakeHttpClient(
            [
                FakeResponse(
                    {
                        "access_token": "access-token",
                        "refresh_token": "refresh-token",
                        "expires_in": 3600,
                    }
                )
            ]
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            auth_path = Path(temp_dir) / "openai_codex_auth.json"
            with patch("app.tools.openai_codex_client.CODEX_AUTH_PATH", auth_path):
                with patch("app.tools.openai_codex_client._start_codex_browser_callback_server"):
                    session = start_codex_browser_login()
                with patch.dict(os.environ, PROXY_ENV, clear=False):
                    with patch("app.tools.openai_codex_client.httpx.Client", return_value=fake_client) as client_factory:
                        status = complete_codex_browser_login_callback(state=session["state"], code="auth-code")

                stored = json.loads(auth_path.read_text(encoding="utf-8"))

        self.assertEqual(status["status"], "authenticated")
        self.assertTrue(status["authenticated"])
        self.assertEqual(status["source"], "browser-oauth")
        self.assertEqual(stored["source"], "browser-oauth")
        self.assertEqual(stored["tokens"]["access_token"], "access-token")
        self.assertEqual(stored["tokens"]["refresh_token"], "refresh-token")
        self.assertEqual(client_factory.call_args.kwargs.get("proxy"), "http://127.0.0.1:7897")
        self.assertEqual(fake_client.post_calls[0]["url"], "https://auth.openai.com/oauth/token")
        self.assertEqual(fake_client.post_calls[0]["data"]["grant_type"], "authorization_code")
        self.assertEqual(fake_client.post_calls[0]["data"]["code"], "auth-code")
        self.assertEqual(fake_client.post_calls[0]["data"]["redirect_uri"], "http://localhost:1455/auth/callback")

    def test_codex_cli_auth_import_copies_existing_codex_login(self) -> None:
        from app.tools.openai_codex_client import import_codex_cli_auth_state

        with tempfile.TemporaryDirectory() as temp_dir:
            auth_path = Path(temp_dir) / "openai_codex_auth.json"
            cli_auth_path = Path(temp_dir) / "codex_auth.json"
            cli_auth_path.write_text(
                json.dumps(
                    {
                        "auth_mode": "chatgpt",
                        "tokens": {
                            "access_token": "cli-access-token",
                            "refresh_token": "cli-refresh-token",
                            "account_id": "acct-1",
                        },
                    }
                ),
                encoding="utf-8",
            )

            with patch("app.tools.openai_codex_client.CODEX_AUTH_PATH", auth_path):
                status = import_codex_cli_auth_state(auth_path=cli_auth_path)
                stored = json.loads(auth_path.read_text(encoding="utf-8"))

        self.assertEqual(status["status"], "authenticated")
        self.assertTrue(status["authenticated"])
        self.assertEqual(status["source"], "codex-cli")
        self.assertNotIn(str(cli_auth_path), str(status))
        self.assertEqual(stored["source"], "codex-cli")
        self.assertEqual(stored["tokens"]["access_token"], "cli-access-token")
        self.assertEqual(stored["tokens"]["refresh_token"], "cli-refresh-token")

    def test_codex_auth_start_honors_environment_proxy_settings(self) -> None:
        from app.tools.openai_codex_client import start_codex_device_login

        fake_client = FakeHttpClient(
            [
                FakeResponse(
                    {
                        "device_auth_id": "device-1",
                        "user_code": "ABCD-EFGH",
                        "interval": "5",
                    }
                )
            ]
        )
        with patch.dict(os.environ, PROXY_ENV, clear=False):
            with patch("app.tools.openai_codex_client.httpx.Client", return_value=fake_client) as client_factory:
                session = start_codex_device_login()

        self.assertEqual(session["device_auth_id"], "device-1")
        self.assertEqual(session["user_code"], "ABCD-EFGH")
        self.assertEqual(client_factory.call_args.kwargs.get("proxy"), "http://127.0.0.1:7897")
        self.assertIs(client_factory.call_args.kwargs.get("trust_env"), False)

    def test_codex_auth_poll_and_exchange_honor_environment_proxy_settings(self) -> None:
        from app.tools.openai_codex_client import poll_codex_device_login

        fake_client = FakeHttpClient(
            [
                FakeResponse({"authorization_code": "code-1", "code_verifier": "verifier-1"}),
                FakeResponse({"access_token": "access-token", "refresh_token": "refresh-token"}),
            ]
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            auth_path = Path(temp_dir) / "openai_codex_auth.json"
            with patch("app.tools.openai_codex_client.CODEX_AUTH_PATH", auth_path):
                with patch.dict(os.environ, PROXY_ENV, clear=False):
                    with patch("app.tools.openai_codex_client.httpx.Client", return_value=fake_client) as client_factory:
                        status = poll_codex_device_login(device_auth_id="device-1", user_code="ABCD-EFGH")

        self.assertEqual(status["status"], "authenticated")
        self.assertTrue(status["authenticated"])
        self.assertEqual([call.kwargs.get("proxy") for call in client_factory.call_args_list], ["http://127.0.0.1:7897", "http://127.0.0.1:7897"])
        self.assertEqual([call.kwargs.get("trust_env") for call in client_factory.call_args_list], [False, False])

    def test_codex_auth_status_masks_stored_tokens(self) -> None:
        from app.tools.openai_codex_client import get_codex_auth_status, save_codex_auth_state

        with tempfile.TemporaryDirectory() as temp_dir:
            auth_path = Path(temp_dir) / "openai_codex_auth.json"
            with patch("app.tools.openai_codex_client.CODEX_AUTH_PATH", auth_path):
                save_codex_auth_state(
                    {
                        "tokens": {
                            "access_token": "access-secret",
                            "refresh_token": "refresh-secret",
                        },
                        "last_refresh": "2026-04-26T00:00:00Z",
                        "auth_mode": "chatgpt",
                        "source": "device-code",
                    }
                )

                status = get_codex_auth_status()

        self.assertTrue(status["authenticated"])
        self.assertTrue(status["configured"])
        self.assertEqual(status["auth_mode"], "chatgpt")
        self.assertNotIn("access-secret", str(status))
        self.assertNotIn("refresh-secret", str(status))

    def test_codex_auth_routes_start_poll_status_and_logout(self) -> None:
        with patch(
            "app.api.routes_settings.start_codex_device_login",
            return_value={
                "verification_url": "https://auth.openai.com/codex/device",
                "user_code": "ABCD-EFGH",
                "device_auth_id": "device-1",
                "expires_in": 900,
                "interval": 5,
            },
        ) as start_login:
            with patch(
                "app.api.routes_settings.poll_codex_device_login",
                return_value={"authenticated": True, "status": "authenticated"},
            ) as poll_login:
                with patch(
                    "app.api.routes_settings.get_codex_auth_status",
                    return_value={"configured": True, "authenticated": True, "auth_mode": "chatgpt"},
                ):
                    with patch("app.api.routes_settings.clear_codex_auth_state") as clear_auth:
                        with TestClient(app) as client:
                            start_response = client.post("/api/settings/model-providers/openai-codex/auth/start")
                            poll_response = client.post(
                                "/api/settings/model-providers/openai-codex/auth/poll",
                                json={"device_auth_id": "device-1", "user_code": "ABCD-EFGH"},
                            )
                            status_response = client.get("/api/settings/model-providers/openai-codex/auth/status")
                            logout_response = client.post("/api/settings/model-providers/openai-codex/auth/logout")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(start_response.json()["user_code"], "ABCD-EFGH")
        self.assertEqual(poll_response.status_code, 200)
        self.assertEqual(poll_response.json()["authenticated"], True)
        self.assertEqual(status_response.json()["auth_mode"], "chatgpt")
        self.assertEqual(logout_response.json(), {"configured": False, "authenticated": False})
        start_login.assert_called_once_with()
        poll_login.assert_called_once_with(device_auth_id="device-1", user_code="ABCD-EFGH")
        clear_auth.assert_called_once_with()

    def test_codex_browser_auth_routes_start_poll_and_import_cli(self) -> None:
        with patch(
            "app.api.routes_settings.start_codex_browser_login",
            return_value={
                "authorization_url": "https://auth.openai.com/oauth/authorize?state=state-1",
                "callback_url": "http://localhost:1455/auth/callback",
                "state": "state-1",
                "expires_in": 600,
                "interval": 2,
            },
        ) as start_login:
            with patch(
                "app.api.routes_settings.poll_codex_browser_login",
                return_value={"authenticated": True, "status": "authenticated", "source": "browser-oauth"},
            ) as poll_login:
                with patch(
                    "app.api.routes_settings.import_codex_cli_auth_state",
                    return_value={"authenticated": True, "status": "authenticated", "source": "codex-cli"},
                ) as import_cli:
                    with TestClient(app) as client:
                        start_response = client.post("/api/settings/model-providers/openai-codex/auth/browser/start")
                        poll_response = client.post(
                            "/api/settings/model-providers/openai-codex/auth/browser/poll",
                            json={"state": "state-1"},
                        )
                        import_response = client.post("/api/settings/model-providers/openai-codex/auth/codex-cli/import")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(start_response.json()["state"], "state-1")
        self.assertEqual(poll_response.status_code, 200)
        self.assertEqual(poll_response.json()["source"], "browser-oauth")
        self.assertEqual(import_response.status_code, 200)
        self.assertEqual(import_response.json()["source"], "codex-cli")
        start_login.assert_called_once_with()
        poll_login.assert_called_once_with(state="state-1")
        import_cli.assert_called_once_with()

    def test_discovers_codex_models_with_stored_chatgpt_token(self) -> None:
        from app.tools.model_provider_client import discover_provider_models

        fake_client = FakeHttpClient(
            [
                FakeResponse(
                    {
                        "models": [
                            {"slug": "gpt-5.5", "priority": 1},
                            {"slug": "hidden-model", "visibility": "hidden", "priority": 2},
                            {"slug": "api-disabled", "supported_in_api": False, "priority": 3},
                        ]
                    }
                )
            ]
        )
        with patch("app.tools.model_provider_client.resolve_codex_access_token", return_value="codex-access-token"):
            with patch.dict(os.environ, PROXY_ENV, clear=False):
                with patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client) as client_factory:
                    models = discover_provider_models(
                        provider_id="openai-codex",
                        transport="codex-responses",
                        base_url="https://chatgpt.com/backend-api/codex",
                    )

        self.assertEqual(models, ["gpt-5.5"])
        self.assertEqual(client_factory.call_args.kwargs.get("proxy"), "http://127.0.0.1:7897")
        self.assertIs(client_factory.call_args.kwargs.get("trust_env"), False)
        request = fake_client.get_calls[0]
        self.assertEqual(
            request["url"],
            "https://chatgpt.com/backend-api/codex/models",
        )
        self.assertEqual(request["params"], {"client_version": "1.0.0"})
        self.assertEqual(request["headers"]["Authorization"], "Bearer codex-access-token")

    def test_chat_codex_responses_posts_streaming_responses_payload(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client = FakeHttpClient(
            [
                FakeResponse(
                    None,
                    text=(
                        'event: response.created\n'
                        'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.5"}}\n\n'
                        'event: response.output_text.delta\n'
                        'data: {"type":"response.output_text.delta","delta":"hello from "}\n\n'
                        'event: response.output_text.delta\n'
                        'data: {"type":"response.output_text.delta","delta":"codex"}\n\n'
                        'event: response.output_item.done\n'
                        'data: {"type":"response.output_item.done","item":{"type":"message","content":[{"type":"output_text","text":"hello from codex"}]}}\n\n'
                        'event: response.completed\n'
                        'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","usage":{"input_tokens":4,"output_tokens":3}}}\n\n'
                    ),
                    headers={"content-type": "text/event-stream"},
                    json_error=ValueError("stream"),
                )
            ]
        )
        with patch("app.tools.model_provider_client.resolve_codex_access_token", return_value="codex-access-token"):
            with patch.dict(os.environ, PROXY_ENV, clear=False):
                with patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client) as client_factory:
                    with patch("app.tools.model_provider_client.append_model_request_log") as append_log:
                        content, meta = chat_with_model_provider(
                            provider_id="openai-codex",
                            transport="codex-responses",
                            base_url="https://chatgpt.com/backend-api/codex",
                            api_key="",
                            model="gpt-5.5",
                            system_prompt="You are helpful.",
                            user_prompt="Say hello",
                            temperature=0.2,
                            max_tokens=64,
                        )

        request = fake_client.post_calls[0]
        self.assertEqual(content, "hello from codex")
        self.assertEqual(client_factory.call_args.kwargs.get("proxy"), "http://127.0.0.1:7897")
        self.assertIs(client_factory.call_args.kwargs.get("trust_env"), False)
        self.assertEqual(meta["response_id"], "resp_1")
        self.assertEqual(meta["usage"], {"input_tokens": 4, "output_tokens": 3})
        self.assertEqual(request["url"], "https://chatgpt.com/backend-api/codex/responses")
        self.assertEqual(request["headers"]["Authorization"], "Bearer codex-access-token")
        self.assertEqual(request["json"]["model"], "gpt-5.5")
        self.assertEqual(request["json"]["instructions"], "You are helpful.")
        self.assertEqual(request["json"]["input"], [{"role": "user", "content": "Say hello"}])
        self.assertEqual(request["json"]["store"], False)
        self.assertEqual(request["json"]["stream"], True)
        self.assertNotIn("temperature", request["json"])
        self.assertNotIn("max_output_tokens", request["json"])
        logged_response = append_log.call_args.kwargs["response_raw"]
        self.assertEqual(logged_response["output_text"], "hello from codex")
        self.assertEqual(logged_response["_stream"]["event_count"], 5)
        self.assertEqual(logged_response["_stream"]["output_chunks"], ["hello from ", "codex"])
        self.assertIn("event: response.output_text.delta", logged_response["_stream"]["raw_text"])

    def test_chat_codex_responses_requests_reasoning_effort_without_summary(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client = FakeHttpClient(
            [
                FakeResponse(
                    None,
                    text=(
                        'event: response.created\n'
                        'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.5"}}\n\n'
                        'event: response.output_text.delta\n'
                        'data: {"type":"response.output_text.delta","delta":"hello"}\n\n'
                        'event: response.completed\n'
                        'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","usage":{"input_tokens":4,"output_tokens":3}}}\n\n'
                    ),
                    headers={"content-type": "text/event-stream"},
                    json_error=ValueError("stream"),
                )
            ]
        )
        with patch("app.tools.model_provider_client.resolve_codex_access_token", return_value="codex-access-token"):
            with patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client):
                with patch("app.tools.model_provider_client.append_model_request_log") as append_log:
                    content, meta = chat_with_model_provider(
                        provider_id="openai-codex",
                        transport="codex-responses",
                        base_url="https://chatgpt.com/backend-api/codex",
                        api_key="",
                        model="gpt-5.5",
                        system_prompt="You are helpful.",
                        user_prompt="Say hello",
                        temperature=0.2,
                        max_tokens=64,
                        thinking_level="medium",
                    )

        request = fake_client.post_calls[0]
        self.assertEqual(content, "hello")
        self.assertEqual(request["json"]["reasoning"], {"effort": "medium"})
        self.assertNotIn("summary", request["json"]["reasoning"])
        self.assertEqual(meta["reasoning"], "")
        self.assertEqual(meta["reasoning_format"], "responses-reasoning")
        logged_response = append_log.call_args.kwargs["response_raw"]
        self.assertNotIn("reasoning", logged_response)
        self.assertEqual(logged_response["_stream"]["reasoning_chunks"], [])

    def test_chat_codex_responses_refreshes_once_after_unauthorized(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        fake_client = FakeHttpClient(
            [
                FakeResponse({"error": "expired"}, status_code=401, text="expired"),
                FakeResponse({"id": "resp_2", "model": "gpt-5.5", "output_text": "retried"}),
            ]
        )
        with patch("app.tools.model_provider_client.resolve_codex_access_token", return_value="old-token"):
            with patch("app.tools.model_provider_client.refresh_codex_access_token", return_value="new-token") as refresh:
                with patch("app.tools.model_provider_client.httpx.Client", return_value=fake_client):
                    with patch("app.tools.model_provider_client.append_model_request_log"):
                        content, _meta = chat_with_model_provider(
                            provider_id="openai-codex",
                            transport="codex-responses",
                            base_url="https://chatgpt.com/backend-api/codex",
                            api_key="",
                            model="gpt-5.5",
                            system_prompt="sys",
                            user_prompt="user",
                            temperature=0.2,
                        )

        self.assertEqual(content, "retried")
        self.assertEqual(len(fake_client.post_calls), 2)
        self.assertEqual(fake_client.post_calls[0]["headers"]["Authorization"], "Bearer old-token")
        self.assertEqual(fake_client.post_calls[1]["headers"]["Authorization"], "Bearer new-token")
        refresh.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
