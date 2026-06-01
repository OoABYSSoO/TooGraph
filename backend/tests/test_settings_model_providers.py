from __future__ import annotations

import json
import os
import sys
import tempfile
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
            "app.api.routes_settings.discover_provider_model_items",
            return_value=[
                {"model": "gemma-4-26b-a4b-it", "label": "gemma-4-26b-a4b-it", "modalities": ["text"]},
                {
                    "model": "huihui-gemma-4-26b-a4b-it-abliterated",
                    "label": "huihui-gemma-4-26b-a4b-it-abliterated",
                    "modalities": ["text"],
                },
            ],
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
                ],
                "model_items": [
                    {"model": "gemma-4-26b-a4b-it", "label": "gemma-4-26b-a4b-it", "modalities": ["text"]},
                    {
                        "model": "huihui-gemma-4-26b-a4b-it-abliterated",
                        "label": "huihui-gemma-4-26b-a4b-it-abliterated",
                        "modalities": ["text"],
                    },
                ],
            },
        )
        discover.assert_called_once_with(
            provider_id="custom",
            transport="openai-compatible",
            base_url="http://127.0.0.1:8888/v1",
            api_key="sk-local",
            auth_header="Authorization",
            auth_scheme="Bearer",
            timeout_sec=8.0,
        )

    def test_discovery_endpoint_dispatches_anthropic_transport(self) -> None:
        with patch(
            "app.api.routes_settings.discover_provider_model_items",
            return_value=[{"model": "claude-sonnet-4-5", "label": "claude-sonnet-4-5", "modalities": ["text"]}],
        ) as discover:
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
        self.assertEqual(
            response.json(),
            {
                "models": ["claude-sonnet-4-5"],
                "model_items": [{"model": "claude-sonnet-4-5", "label": "claude-sonnet-4-5", "modalities": ["text"]}],
            },
        )
        discover.assert_called_once_with(
            provider_id="anthropic",
            transport="anthropic-messages",
            base_url="https://api.anthropic.com/v1",
            api_key="sk-ant",
            auth_header="x-api-key",
            auth_scheme="",
            timeout_sec=8.0,
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

    def test_update_settings_removes_provider_omitted_from_full_provider_payload(self) -> None:
        existing_settings = {
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://primary.test/v1",
                    "api_key": "sk-test",
                    "enabled": True,
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [{"model": "gpt-primary", "label": "gpt-primary"}],
                },
                "local": {
                    "label": "Local",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:8888/v1",
                    "enabled": False,
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [],
                },
            }
        }
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "",
                                    "video_model_ref": "",
                                },
                                "agent_runtime_defaults": {
                                    "model": "",
                                    "thinking_enabled": False,
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "local": {
                                        "label": "Local",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:8888/v1",
                                        "enabled": False,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "models": [],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("openai", saved_payload["model_providers"])
        self.assertIn("local", saved_payload["model_providers"])

    def test_update_settings_persists_model_capabilities_and_permissions(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/rerank-test",
                                    "video_model_ref": "local/rerank-test",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/rerank-test",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "local": {
                                        "label": "Local",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:8888/v1",
                                        "api_key": "",
                                        "enabled": True,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "models": [
                                            {
                                                "model": "rerank-test",
                                                "label": "rerank-test",
                                                "modalities": ["text"],
                                                "capabilities": {
                                                    "chat": False,
                                                    "structured_output": False,
                                                    "embedding": False,
                                                    "rerank": True,
                                                    "prompt_cache": True,
                                                },
                                                "permissions": ["rerank"],
                                            },
                                            {
                                                "model": "text-embedding-qwen3-embedding-8b",
                                                "label": "text-embedding-qwen3-embedding-8b",
                                                "modalities": ["text"],
                                                "capabilities": {
                                                    "chat": False,
                                                    "embedding": True,
                                                    "rerank": False,
                                                },
                                                "embedding": {
                                                    "dimensions": 4096,
                                                    "use_for_memory": True,
                                                    "use_for_knowledge": False,
                                                },
                                            }
                                        ],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        saved_model = saved_payload["model_providers"]["local"]["models"][0]
        self.assertEqual(saved_model["capabilities"]["chat"], False)
        self.assertEqual(saved_model["capabilities"]["rerank"], True)
        self.assertEqual(saved_model["capabilities"]["prompt_cache"], True)
        saved_embedding_model = saved_payload["model_providers"]["local"]["models"][1]
        self.assertEqual(saved_embedding_model["capabilities"]["embedding"], True)
        self.assertEqual(
            saved_embedding_model["embedding"],
            {"dimensions": 4096, "use_for_memory": True, "use_for_knowledge": False},
        )
        self.assertEqual(saved_model["permissions"], ["rerank"])

    def test_update_settings_persists_model_context_budget(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/gemma",
                                    "video_model_ref": "local/gemma",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/gemma",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "local": {
                                        "label": "Local",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:8888/v1",
                                        "api_key": "",
                                        "enabled": True,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "models": [
                                            {
                                                "model": "gemma",
                                                "label": "Gemma",
                                                "modalities": ["text"],
                                                "context_window": 128000,
                                                "compression_threshold": 0.88,
                                            }
                                        ],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        saved_model = saved_payload["model_providers"]["local"]["models"][0]
        self.assertEqual(saved_model["context_window"], 128000)
        self.assertEqual(saved_model["compression_threshold"], 0.88)

    def test_update_settings_persists_provider_request_timeout_seconds(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/gemma",
                                    "video_model_ref": "local/gemma",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/gemma",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "local": {
                                        "label": "Local",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:8888/v1",
                                        "api_key": "",
                                        "enabled": True,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "request_timeout_seconds": 42.5,
                                        "models": [{"model": "gemma", "label": "Gemma", "modalities": ["text"]}],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["model_providers"]["local"]["request_timeout_seconds"], 42.5)

    def test_model_provider_defaults_structured_output_mode_to_validate_then_repair(self) -> None:
        from app.core import model_catalog

        with patch.object(model_catalog, "load_app_settings", return_value={"model_providers": {}}):
            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=[]):
                    with TestClient(app) as client:
                        response = client.get("/api/settings")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        provider = next(
            item
            for item in payload["model_catalog"]["provider_templates"]
            if item["provider_id"] == "lmstudio"
        )
        self.assertEqual(provider["structured_output_mode"], "validate_then_repair")

    def test_update_model_provider_persists_structured_output_mode(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={"model_providers": {}}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "lmstudio/qwen/qwen3.6-27b",
                                    "video_model_ref": "lmstudio/qwen/qwen3.6-27b",
                                },
                                "agent_runtime_defaults": {
                                    "model": "lmstudio/qwen/qwen3.6-27b",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "lmstudio": {
                                        "label": "LM Studio",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:1234/v1",
                                        "enabled": True,
                                        "structured_output_mode": "native_schema_first",
                                        "models": [
                                            {
                                                "model": "qwen/qwen3.6-27b",
                                                "capabilities": {"chat": True, "structured_output": True},
                                                "reasoning": True,
                                            }
                                        ],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            saved_payload["model_providers"]["lmstudio"]["structured_output_mode"],
            "native_schema_first",
        )

    def test_settings_payload_exposes_provider_structured_output_mode(self) -> None:
        from app.core import model_catalog

        saved_settings = {
            "text_model_ref": "lmstudio/qwen/qwen3.6-27b",
            "video_model_ref": "lmstudio/qwen/qwen3.6-27b",
            "model_providers": {
                "lmstudio": {
                    "label": "LM Studio",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:1234/v1",
                    "enabled": True,
                    "structured_output_mode": "native_schema_first",
                    "models": [{"model": "qwen/qwen3.6-27b", "capabilities": {"chat": True}}],
                }
            },
        }

        with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=[]):
                    with patch.object(routes_settings, "build_model_catalog", side_effect=model_catalog.build_model_catalog):
                        with TestClient(app) as client:
                            response = client.get("/api/settings")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        provider = next(
            item
            for item in payload["model_catalog"]["providers"]
            if item["provider_id"] == "lmstudio"
        )
        self.assertEqual(provider["structured_output_mode"], "native_schema_first")

    def test_update_model_provider_normalizes_invalid_structured_output_mode(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={"model_providers": {}}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "lmstudio/qwen/qwen3.6-27b",
                                    "video_model_ref": "lmstudio/qwen/qwen3.6-27b",
                                },
                                "agent_runtime_defaults": {
                                    "model": "lmstudio/qwen/qwen3.6-27b",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "lmstudio": {
                                        "label": "LM Studio",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:1234/v1",
                                        "enabled": True,
                                        "structured_output_mode": "bad-value",
                                        "models": [
                                            {
                                                "model": "qwen/qwen3.6-27b",
                                                "capabilities": {"chat": True},
                                            }
                                        ],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            saved_payload["model_providers"]["lmstudio"]["structured_output_mode"],
            "validate_then_repair",
        )

    def test_update_settings_persists_provider_credential_pool(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
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
                                    "thinking_level": "off",
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
                                        "credential_pool": [
                                            {
                                                "credential_id": " primary ",
                                                "status": "active",
                                                "cooldown_until": None,
                                                "failure_count": 0,
                                            },
                                            {
                                                "credential_id": "backup",
                                                "status": "cooling_down",
                                                "cooldown_until": "2026-06-01T12:00:00Z",
                                                "failure_count": 3,
                                            },
                                            {
                                                "credential_id": "primary",
                                                "status": "disabled",
                                                "failure_count": 8,
                                            },
                                        ],
                                        "models": [{"model": "gpt-4.1", "label": "GPT 4.1", "modalities": ["text"]}],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            saved_payload["model_providers"]["openai"]["credential_pool"],
            [
                {
                    "credential_id": "primary",
                    "status": "active",
                    "cooldown_until": None,
                    "failure_count": 0,
                },
                {
                    "credential_id": "backup",
                    "status": "cooling_down",
                    "cooldown_until": "2026-06-01T12:00:00Z",
                    "failure_count": 3,
                },
            ],
        )

    def test_update_settings_preserves_provider_credential_pool_api_keys_when_payload_omits_them(self) -> None:
        existing_settings = {
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://api.openai.com/v1",
                    "enabled": True,
                    "credential_pool": [
                        {
                            "credential_id": "primary",
                            "api_key": "sk-primary",
                            "status": "active",
                            "cooldown_until": None,
                            "failure_count": 0,
                        },
                        {
                            "credential_id": "backup",
                            "api_key": "sk-backup",
                            "status": "cooling_down",
                            "cooldown_until": "2026-06-01T12:00:00Z",
                            "failure_count": 2,
                        },
                    ],
                    "models": [{"model": "gpt-4.1", "label": "GPT 4.1", "modalities": ["text"]}],
                }
            }
        }
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
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
                                    "thinking_level": "off",
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
                                        "credential_pool": [
                                            {
                                                "credential_id": "primary",
                                                "status": "active",
                                                "cooldown_until": None,
                                                "failure_count": 0,
                                            },
                                            {
                                                "credential_id": "backup",
                                                "status": "active",
                                                "cooldown_until": None,
                                                "failure_count": 0,
                                            },
                                        ],
                                        "models": [{"model": "gpt-4.1", "label": "GPT 4.1", "modalities": ["text"]}],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["model_providers"]["openai"]["credential_pool"][0]["api_key"], "sk-primary")
        self.assertEqual(saved_payload["model_providers"]["openai"]["credential_pool"][1]["api_key"], "sk-backup")
        self.assertEqual(saved_payload["model_providers"]["openai"]["credential_pool"][1]["status"], "active")

    def test_update_settings_preserves_existing_model_pricing_when_payload_omits_it(self) -> None:
        existing_settings = {
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-openai",
                    "enabled": True,
                    "models": [
                        {
                            "model": "gpt-4.1",
                            "label": "GPT 4.1",
                            "modalities": ["text"],
                            "pricing": {
                                "input_per_million_usd": 2.0,
                                "output_per_million_usd": 8.0,
                            },
                        }
                    ],
                }
            }
        }
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
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
                                    "thinking_level": "off",
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
                                        "models": [
                                            {"model": "gpt-4.1", "label": "GPT 4.1", "modalities": ["text"]}
                                        ],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            saved_payload["model_providers"]["openai"]["models"][0]["pricing"],
            {
                "input_per_million_usd": 2.0,
                "output_per_million_usd": 8.0,
            },
        )

    def test_update_settings_allows_empty_model_refs_when_no_models_are_available(self) -> None:
        saved_payload: dict = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}) as build_payload:
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "",
                                    "video_model_ref": "",
                                },
                                "agent_runtime_defaults": {
                                    "model": "",
                                    "thinking_enabled": False,
                                    "thinking_level": "off",
                                    "temperature": 0.2,
                                },
                                "model_providers": {
                                    "local": {
                                        "label": "OpenAI-compatible Custom Provider",
                                        "transport": "openai-compatible",
                                        "base_url": "http://127.0.0.1:8888/v1",
                                        "api_key": "",
                                        "enabled": False,
                                        "auth_header": "Authorization",
                                        "auth_scheme": "Bearer",
                                        "models": [],
                                    }
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["text_model_ref"], "")
        self.assertEqual(saved_payload["video_model_ref"], "")
        self.assertEqual(saved_payload["agent_runtime_defaults"]["thinking_level"], "off")
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

    def test_settings_payload_includes_buddy_runtime_permission_mode(self) -> None:
        catalog = {
            "default_text_model_ref": "local/current-text",
            "default_video_model_ref": "local/current-video",
            "providers": [],
            "provider_templates": [],
        }

        with patch("app.api.routes_settings.build_model_catalog", return_value=catalog):
            with patch("app.api.routes_settings.get_default_agent_thinking_level", return_value="medium"):
                with patch("app.api.routes_settings.get_default_agent_temperature", return_value=0.2):
                    with patch("app.api.routes_settings.get_tool_registry", return_value={}):
                        with patch(
                            "app.api.routes_settings.load_app_settings",
                            return_value={"buddy_runtime": {"permission_mode": "full_access"}},
                        ):
                            payload = routes_settings._build_settings_payload(force_refresh_models=False)

        self.assertEqual(payload["buddy_runtime"], {"permission_mode": "full_access"})

    def test_settings_payload_includes_model_log_retention(self) -> None:
        catalog = {
            "default_text_model_ref": "local/current-text",
            "default_video_model_ref": "local/current-video",
            "providers": [],
            "provider_templates": [],
        }

        with patch("app.api.routes_settings.build_model_catalog", return_value=catalog):
            with patch("app.api.routes_settings.get_default_agent_thinking_level", return_value="medium"):
                with patch("app.api.routes_settings.get_default_agent_temperature", return_value=0.2):
                    with patch("app.api.routes_settings.get_tool_registry", return_value={}):
                        with patch(
                            "app.api.routes_settings.get_model_log_retention_settings",
                            return_value={"max_root_runs": 42, "cache_resource_retention_days": 21},
                        ):
                            payload = routes_settings._build_settings_payload(force_refresh_models=False)

        self.assertEqual(payload["model_logs"], {"max_root_runs": 42, "cache_resource_retention_days": 21})

    def test_settings_payload_defaults_developer_mode_off(self) -> None:
        catalog = {
            "default_text_model_ref": "local/current-text",
            "default_video_model_ref": "local/current-video",
            "providers": [],
            "provider_templates": [],
        }

        with patch("app.api.routes_settings.build_model_catalog", return_value=catalog):
            with patch("app.api.routes_settings.get_default_agent_thinking_level", return_value="medium"):
                with patch("app.api.routes_settings.get_default_agent_temperature", return_value=0.2):
                    with patch("app.api.routes_settings.get_tool_registry", return_value={}):
                        with patch("app.api.routes_settings.load_app_settings", return_value={}):
                            payload = routes_settings._build_settings_payload(force_refresh_models=False)

        self.assertEqual(payload["ui_preferences"], {"developer_mode": False})

    def test_update_settings_persists_ui_preferences_developer_mode(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/text",
                                    "video_model_ref": "local/video",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/text",
                                    "thinking_enabled": True,
                                    "thinking_level": "medium",
                                    "temperature": 0.2,
                                },
                                "ui_preferences": {"developer_mode": True},
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["ui_preferences"], {"developer_mode": True})

    def test_update_settings_preserves_existing_ui_preferences_when_omitted(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        existing_settings = {"ui_preferences": {"developer_mode": True}}
        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/text",
                                    "video_model_ref": "local/video",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/text",
                                    "thinking_enabled": True,
                                    "thinking_level": "medium",
                                    "temperature": 0.2,
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["ui_preferences"], {"developer_mode": True})

    def test_update_settings_persists_model_log_retention_from_full_payload(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/text",
                                    "video_model_ref": "local/video",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/text",
                                    "thinking_enabled": True,
                                    "thinking_level": "medium",
                                    "temperature": 0.2,
                                },
                                "model_logs": {"max_root_runs": 12, "cache_resource_retention_days": 18},
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["model_logs"], {"max_root_runs": 12, "cache_resource_retention_days": 18})

    def test_model_log_retention_endpoint_persists_setting(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        with patch("app.core.storage.model_log_store.load_app_settings", return_value={}):
            with patch("app.core.storage.model_log_store.save_app_settings", side_effect=capture_save):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/settings/model-logs",
                        json={"max_root_runs": 37, "cache_resource_retention_days": 22},
                    )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"max_root_runs": 37, "cache_resource_retention_days": 22})
        self.assertEqual(saved_payload["model_logs"], {"max_root_runs": 37, "cache_resource_retention_days": 22})

    def test_model_log_retention_endpoint_preserves_cache_resource_retention_when_omitted(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        existing_settings = {"model_logs": {"max_root_runs": 55, "cache_resource_retention_days": 88}}
        with patch("app.core.storage.model_log_store.load_app_settings", return_value=existing_settings):
            with patch("app.core.storage.model_log_store.save_app_settings", side_effect=capture_save):
                with TestClient(app) as client:
                    response = client.post("/api/settings/model-logs", json={"max_root_runs": 37})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"max_root_runs": 37, "cache_resource_retention_days": 88})
        self.assertEqual(saved_payload["model_logs"], {"max_root_runs": 37, "cache_resource_retention_days": 88})

    def test_update_settings_preserves_existing_buddy_runtime_when_omitted(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        existing_settings = {"buddy_runtime": {"permission_mode": "full_access"}}
        with patch("app.api.routes_settings.load_app_settings", return_value=existing_settings):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with patch("app.api.routes_settings._build_settings_payload", return_value={"ok": True}):
                    with TestClient(app) as client:
                        response = client.post(
                            "/api/settings",
                            json={
                                "model": {
                                    "text_model_ref": "local/text",
                                    "video_model_ref": "local/video",
                                },
                                "agent_runtime_defaults": {
                                    "model": "local/text",
                                    "thinking_enabled": True,
                                    "thinking_level": "medium",
                                    "temperature": 0.2,
                                },
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(saved_payload["buddy_runtime"], {"permission_mode": "full_access"})

    def test_buddy_runtime_endpoint_persists_normalized_permission_mode(self) -> None:
        saved_payload = {}

        def capture_save(payload: dict) -> dict:
            saved_payload.clear()
            saved_payload.update(payload)
            return payload

        with patch("app.api.routes_settings.load_app_settings", return_value={}):
            with patch("app.api.routes_settings.save_app_settings", side_effect=capture_save):
                with TestClient(app) as client:
                    response = client.post("/api/settings/buddy-runtime", json={"permission_mode": "unrestricted"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"permission_mode": "full_access"})
        self.assertEqual(saved_payload["buddy_runtime"], {"permission_mode": "full_access"})

    def test_buddy_runtime_ignores_legacy_policy_json_when_no_saved_setting(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            buddy_home.mkdir()
            (buddy_home / "policy.json").write_text(
                json.dumps({"graph_permission_mode": "full_access"}),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"TOOGRAPH_BUDDY_HOME": str(buddy_home)}):
                with patch("app.api.routes_settings.load_app_settings", return_value={}):
                    with TestClient(app) as client:
                        response = client.get("/api/settings/buddy-runtime")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"permission_mode": "ask_first"})

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

    def test_catalog_exposes_model_capabilities_and_permissions(self) -> None:
        saved_settings = {
            "text_model_ref": "local/rerank-test",
            "video_model_ref": "local/rerank-test",
            "model_providers": {
                "local": {
                    "label": "Local",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:8888/v1",
                    "enabled": True,
                    "models": [
                        {
                            "model": "rerank-test",
                            "label": "rerank-test",
                            "capabilities": {"chat": False, "rerank": True},
                            "embedding": {"dimensions": 1024, "use_for_memory": False, "use_for_knowledge": True},
                            "permissions": ["rerank"],
                        }
                    ],
                }
            },
        }

        from app.core import model_catalog

        with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=[]):
                    catalog = model_catalog.build_model_catalog(force_refresh=False)

        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")
        self.assertEqual(local_provider["models"][0]["capabilities"], {"chat": False, "rerank": True})
        self.assertEqual(
            local_provider["models"][0]["embedding"],
            {"dimensions": 1024, "use_for_memory": False, "use_for_knowledge": True},
        )
        self.assertEqual(local_provider["models"][0]["permissions"], ["rerank"])

    def test_catalog_exposes_provider_credential_pool_metadata(self) -> None:
        saved_settings = {
            "text_model_ref": "openai/gpt-4.1",
            "video_model_ref": "openai/gpt-4.1",
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://api.openai.com/v1",
                    "enabled": True,
                    "credential_pool": [
                        {
                            "credential_id": "primary",
                            "api_key": "sk-primary",
                            "status": "active",
                            "cooldown_until": None,
                            "failure_count": 0,
                        },
                        {
                            "credential_id": "backup",
                            "api_key": "sk-backup",
                            "status": "cooling_down",
                            "cooldown_until": "2026-06-01T12:00:00Z",
                            "failure_count": 2,
                        },
                    ],
                    "models": [{"model": "gpt-4.1", "label": "GPT 4.1"}],
                }
            },
        }

        from app.core import model_catalog

        with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=[]):
                    catalog = model_catalog.build_model_catalog(force_refresh=False)

        provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "openai")
        self.assertTrue(provider["configured"])
        self.assertTrue(provider["api_key_configured"])
        self.assertEqual(
            provider["credential_pool"],
            [
                {
                    "credential_id": "primary",
                    "status": "active",
                    "cooldown_until": None,
                    "failure_count": 0,
                },
                {
                    "credential_id": "backup",
                    "status": "cooling_down",
                    "cooldown_until": "2026-06-01T12:00:00Z",
                    "failure_count": 2,
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
