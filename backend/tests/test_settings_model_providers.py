from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.api import routes_settings


class SettingsModelProviderTests(unittest.TestCase):
    def test_discovers_openai_compatible_models_from_base_url(self) -> None:
        with patch(
            "app.api.routes_settings.discover_provider_models",
            return_value=["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"],
        ) as discover:
            with TestClient(app) as client:
                response = client.post(
                    "/api/settings/model-providers/discover",
                    json={
                        "base_url": "http://127.0.0.1:8888/v1",
                        "api_key": "sk-local",
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "models": [
                    "gemma-4-26b-a4b-it",
                    "huihui-gemma-4-26b-a4b-it-abliterated",
                ]
            },
        )
        discover.assert_called_once_with(
            provider_id="custom",
            transport="openai-compatible",
            base_url="http://127.0.0.1:8888/v1",
            api_key="sk-local",
            auth_header="Authorization",
            auth_scheme="Bearer",
        )

    def test_discovery_endpoint_dispatches_anthropic_transport(self) -> None:
        with patch("app.api.routes_settings.discover_provider_models", return_value=["claude-sonnet-4-5"]) as discover:
            with TestClient(app) as client:
                response = client.post(
                    "/api/settings/model-providers/discover",
                    json={
                        "provider_id": "anthropic",
                        "transport": "anthropic-messages",
                        "base_url": "https://api.anthropic.com/v1",
                        "api_key": "sk-ant",
                        "auth_header": "x-api-key",
                        "auth_scheme": "",
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"models": ["claude-sonnet-4-5"]})
        discover.assert_called_once_with(
            provider_id="anthropic",
            transport="anthropic-messages",
            base_url="https://api.anthropic.com/v1",
            api_key="sk-ant",
            auth_header="x-api-key",
            auth_scheme="",
        )

    def test_update_settings_preserves_existing_api_key_when_blank(self) -> None:
        existing_settings = {
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-existing",
                    "enabled": True,
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [{"model": "gpt-4.1", "label": "GPT 4.1"}],
                }
            }
        }
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}) as build_payload:
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "openai/gpt-4.1",
                                    "video_model_ref": "openai/gpt-4.1",
                                },
                                "agent_runtime_defaults": {
                                    "model": "openai/gpt-4.1",
                                    "thinking_enabled": False,
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "openai": {
                                        "label": "OpenAI",
                                        "transport": "openai-compatible",
                                        "base_url": "https://api.openai.com/v1",
                                        "api_key": "",
                                        "enabled": True,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "models": [{"model": "gpt-4.1", "label": "GPT 4.1", "modalities": ["text"]}],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["model_providers"]["openai"]["api_key"], "sk-existing")
        self.assertTrue(saved_payload["model_providers"]["openai"]["enabled"])
        self.assertEqual(saved_payload["model_providers"]["openai"]["transport"], "openai-compatible")
        build_payload.assert_called_once_with(force_refresh_models=False)

    def test_build_settings_payload_refreshes_catalog_once(self) -> None:
        catalog = {
            "default_text_model_ref": "local/current-text",
            "default_video_model_ref": "local/current-video",
            "providers": [],
            "provider_templates": [],
        }

        with patch("app.api.routes_settings.build_model_catalog", return_value=catalog) as build_catalog:
            with patch("app.api.routes_settings.get_default_agent_thinking_level", return_value="medium"):
                with patch("app.api.routes_settings.get_default_agent_temperature", return_value=0.2):
                    with patch("app.api.routes_settings.get_tool_registry", return_value={}):
                        payload = routes_settings._build_settings_payload(force_refresh_models=True)

        build_catalog.assert_called_once_with(force_refresh=True)
        self.assertEqual(payload["model"]["text_model_ref"], "local/current-text")
        self.assertEqual(payload["model"]["video_model_ref"], "local/current-video")
        self.assertEqual(payload["agent_runtime_defaults"]["model"], "local/current-text")
        self.assertEqual(payload["agent_runtime_defaults"]["thinking_level"], "medium")

    def test_get_settings_uses_cached_catalog_for_fast_page_loads(self) -> None:
        with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}) as build_payload:
            with TestClient(app) as client:
                response = client.get("/api/settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        build_payload.assert_called_once_with(force_refresh_models=False)

    def test_catalog_keeps_local_discovered_models_out_of_enabled_models(self) -> None:
        saved_settings = {
            "text_model_ref": "openai-codex/gpt-5.5",
            "video_model_ref": "openai-codex/gpt-5.5",
            "model_providers": {
                "local": {
                    "label": "OpenAI-compatible Custom Provider",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:8888/v1",
                    "enabled": True,
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [],
                },
                "openai-codex": {
                    "label": "OpenAI Codex / ChatGPT Login",
                    "transport": "codex-responses",
                    "base_url": "https://chatgpt.com/backend-api/codex",
                    "enabled": True,
                    "auth_mode": "chatgpt",
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [{"model": "gpt-5.5", "label": "gpt-5.5"}],
                },
            },
        }

        from app.core import model_catalog

        with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=["lm-local"]):
                    with patch.object(
                        model_catalog,
                        "get_codex_auth_status",
                        return_value={"configured": True, "authenticated": True, "auth_mode": "chatgpt"},
                    ):
                        catalog = model_catalog.build_model_catalog(force_refresh=False)

        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")
        self.assertEqual(local_provider["models"], [])
        self.assertEqual([model["model"] for model in local_provider["discovered_models"]], ["lm-local"])
        self.assertEqual(catalog["default_text_model_ref"], "openai-codex/gpt-5.5")


if __name__ == "__main__":
    unittest.main()
