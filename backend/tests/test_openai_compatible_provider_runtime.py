from __future__ import annotations

import importlib
import os
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import (
    NodeSystemAgentConfig,
    NodeSystemAgentNode,
    NodeSystemNodeUi,
    NodeSystemWriteBinding,
    Position,
)


LOCAL_PROVIDER_ENV_KEYS = (
    "LOCAL_BASE_URL",
    "LOCAL_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "LITELLM_MASTER_KEY",
    "LOCAL_LLM_BASE_URL",
    "LOCAL_LLM_API_KEY",
    "LOCAL_TEXT_MODEL",
    "TEXT_MODEL",
    "LOCAL_MODEL_NAME",
    "UPSTREAM_MODEL_NAME",
    "LOCAL_LLM_MODEL",
    "LOCAL_VIDEO_MODEL",
    "VIDEO_MODEL",
)


class OpenAiCompatibleProviderRuntimeTests(unittest.TestCase):
    @contextmanager
    def _patched_local_provider_env(self, **updates: str):
        original = {key: os.environ.get(key) for key in LOCAL_PROVIDER_ENV_KEYS}
        for key in LOCAL_PROVIDER_ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(updates)
        try:
            yield
        finally:
            for key in LOCAL_PROVIDER_ENV_KEYS:
                os.environ.pop(key, None)
            for key, value in original.items():
                if value is not None:
                    os.environ[key] = value

    def _reload_target_modules(self):
        sys.modules.pop("app.core.model_catalog", None)
        sys.modules.pop("app.tools.local_llm", None)
        local_llm = importlib.import_module("app.tools.local_llm")
        model_catalog = importlib.import_module("app.core.model_catalog")
        return local_llm, model_catalog

    def test_local_provider_ignores_legacy_environment_configuration(self) -> None:
        with self._patched_local_provider_env(
            LOCAL_BASE_URL="http://127.0.0.1:8801/v1",
            LOCAL_API_KEY="sk-env",
            OPENAI_BASE_URL="http://127.0.0.1:8802/v1",
            LOCAL_LLM_BASE_URL="http://127.0.0.1:8803/v1",
            LOCAL_TEXT_MODEL="env-model",
        ):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value={}):
                with patch.object(local_llm, "get_current_local_model_names", return_value=[]):
                    with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                        self.assertEqual(local_llm.get_local_llm_base_url(), "")
                        self.assertEqual(local_llm.get_local_llm_api_key(), "")
                        self.assertEqual(local_llm.get_local_route_model_names(force_refresh=False), [])

    def test_local_provider_uses_saved_model_provider_configuration(self) -> None:
        saved_settings = {
            "text_model_ref": "local/saved-model",
            "model_providers": {
                "local": {
                    "base_url": "http://127.0.0.1:9999/v1",
                    "api_key": "sk-saved",
                    "models": [{"model": "saved-model", "label": "Saved Model"}],
                }
            },
        }

        with self._patched_local_provider_env(
            LOCAL_BASE_URL="http://127.0.0.1:8801/v1",
            LOCAL_API_KEY="sk-env",
            LOCAL_TEXT_MODEL="env-model",
        ):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value=saved_settings):
                with patch.object(local_llm, "get_current_local_model_names", return_value=[]):
                    with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                        self.assertEqual(local_llm.get_local_llm_base_url(), "http://127.0.0.1:9999/v1")
                        self.assertEqual(local_llm.get_local_llm_api_key(), "sk-saved")
                        self.assertEqual(local_llm.get_local_route_model_names(force_refresh=False), ["saved-model"])

    def test_build_model_catalog_reports_unconfigured_local_provider_template_without_saved_settings(self) -> None:
        runtime_config = {
            "display_model_name": "Llama 3.1 8B",
            "cloud": {},
            "llama": {"ctx_size": 8192, "n_predict": 1024},
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8801/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "load_app_settings", return_value={}):
                with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=runtime_config):
                    with patch.object(model_catalog, "get_local_route_model_names", return_value=["llama-3.1-8b"]) as route_models:
                        with patch.object(model_catalog, "get_default_text_model", return_value="llama-3.1-8b") as default_text_model:
                            catalog = model_catalog.build_model_catalog()

        route_models.assert_not_called()
        default_text_model.assert_not_called()
        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")

        self.assertEqual(local_provider["label"], "OpenAI-compatible Custom Provider")
        self.assertEqual(
            local_provider["description"],
            "Custom OpenAI-compatible endpoint used by GraphiteUI for local or private model routing.",
        )
        self.assertEqual(local_provider["transport"], "openai-compatible")
        self.assertEqual(local_provider["base_url"], "http://127.0.0.1:8888/v1")
        self.assertFalse(local_provider["configured"])
        self.assertFalse(local_provider["enabled"])
        self.assertEqual(local_provider["models"], [])
        self.assertEqual(catalog["default_text_model_ref"], "")
        self.assertEqual(local_provider["gateway"], runtime_config)

    def test_build_model_catalog_uses_saved_local_provider_and_handles_null_cloud_config(self) -> None:
        saved_settings = {
            "text_model_ref": "local/gemma-4-26b-a4b-it",
            "video_model_ref": "local/gemma-4-26b-a4b-it",
            "model_providers": {
                "local": {
                    "label": "Local Gateway",
                    "base_url": "http://127.0.0.1:8888/v1",
                    "api_key": "sk-local",
                    "models": [
                        {
                            "model": "gemma-4-26b-a4b-it",
                            "label": "Gemma 4 26B",
                        }
                    ],
                }
            },
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8801/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
                with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value={"cloud": None, "llama": None}):
                    with patch.object(model_catalog, "get_local_route_model_names", return_value=[]):
                        catalog = model_catalog.build_model_catalog()

        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")
        openrouter_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "openrouter")

        self.assertEqual(local_provider["label"], "Local Gateway")
        self.assertEqual(local_provider["base_url"], "http://127.0.0.1:8888/v1")
        self.assertTrue(local_provider["api_key_configured"])
        self.assertEqual(local_provider["models"][0]["model_ref"], "local/gemma-4-26b-a4b-it")
        self.assertEqual(local_provider["models"][0]["label"], "Gemma 4 26B")
        self.assertEqual(openrouter_provider["base_url"], "https://openrouter.ai/api/v1")

    def test_local_route_models_auto_discover_openai_compatible_models(self) -> None:
        saved_settings = {
            "model_providers": {
                "local": {
                    "base_url": "http://127.0.0.1:8888/v1",
                    "api_key": "sk-saved",
                }
            }
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8801/v1", LOCAL_API_KEY="sk-env"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value=saved_settings):
                with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                    with patch.object(
                        local_llm,
                        "discover_openai_compatible_models",
                        return_value=["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"],
                    ) as discover:
                        models = local_llm.get_local_route_model_names(force_refresh=True)

        self.assertEqual(models, ["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"])
        discover.assert_called_once_with(base_url="http://127.0.0.1:8888/v1", api_key="sk-saved", timeout_sec=2.0)

    def test_non_forced_runtime_config_does_not_probe_local_gateway(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm.httpx, "Client", side_effect=RuntimeError("network probe")) as client_factory:
                runtime_config = local_llm.get_local_gateway_runtime_config(force_refresh=False)

        self.assertIsNone(runtime_config)
        client_factory.assert_not_called()

    def test_forced_runtime_config_without_saved_base_url_does_not_probe_local_gateway(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value={}):
                with patch.object(local_llm.httpx, "Client", side_effect=RuntimeError("network probe")) as client_factory:
                    runtime_config = local_llm.get_local_gateway_runtime_config(force_refresh=True)

        self.assertIsNone(runtime_config)
        client_factory.assert_not_called()

    def test_non_forced_local_model_names_do_not_probe_local_gateway(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value={}):
                with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                    with patch.object(local_llm, "discover_openai_compatible_models", side_effect=AssertionError("network probe")):
                        models = local_llm.get_local_route_model_names(force_refresh=False)

        self.assertEqual(models, [])

    def test_local_gateway_thinking_payload_uses_runtime_reasoning_format(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                return {
                    "id": "chatcmpl-1",
                    "model": "gemma-4-26b-a4b-it",
                    "choices": [{"message": {"content": '{"answer":"ok"}', "reasoning_content": "<think>ok</think>"}}],
                }

            with patch.object(
                local_llm,
                "get_local_gateway_runtime_config",
                return_value={"llama": {"reasoning_format": "deepseek"}},
            ):
                with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                    _content, meta = local_llm._chat_with_local_model_with_meta(
                        system_prompt="sys",
                        user_prompt="user",
                        model="gemma-4-26b-a4b-it",
                        thinking_enabled=True,
                        thinking_level="medium",
                    )

        self.assertEqual(sent_payloads[0]["reasoning_format"], "deepseek")
        self.assertEqual(sent_payloads[0]["reasoning"], {"effort": "medium"})
        self.assertEqual(sent_payloads[0]["stream"], True)
        self.assertEqual(meta["reasoning_format"], "local-gateway:deepseek")

    def test_local_gateway_sends_image_attachments_as_openai_content_parts(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                return {
                    "id": "chatcmpl-1",
                    "model": "vision-model",
                    "choices": [{"message": {"content": '{"answer":"ok"}'}}],
                }

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                    content, _meta = local_llm._chat_with_local_model_with_meta(
                        system_prompt="sys",
                        user_prompt="Describe the image.",
                        model="vision-model",
                        thinking_enabled=False,
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

        self.assertEqual(content, '{"answer":"ok"}')
        self.assertEqual(
            sent_payloads[0]["messages"][1]["content"],
            [
                {"type": "text", "text": "Describe the image."},
                {"type": "image_url", "image_url": {"url": "file:///tmp/reference.png"}},
            ],
        )

    def test_local_gateway_sends_video_attachments_as_native_video_parts(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                return {
                    "id": "chatcmpl-1",
                    "model": "vision-model",
                    "choices": [{"message": {"content": '{"answer":"ok"}'}}],
                }

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                    content, _meta = local_llm._chat_with_local_model_with_meta(
                        system_prompt="sys",
                        user_prompt="Describe the video.",
                        model="vision-model",
                        thinking_enabled=False,
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

        self.assertEqual(content, '{"answer":"ok"}')
        self.assertEqual(
            sent_payloads[0]["messages"][1]["content"],
            [
                {"type": "text", "text": "Describe the video."},
                {"type": "video_url", "video_url": {"url": "file:///tmp/clip.mp4"}},
            ],
        )

    def test_local_gateway_falls_back_from_native_video_to_extracted_frames(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []
            frame_attachments = [
                {
                    "type": "image",
                    "state_key": "clip#frame_001",
                    "name": "clip_frame_001.jpg",
                    "mime_type": "image/jpeg",
                    "file_url": "file:///tmp/clip_frame_001.jpg",
                }
            ]

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                if len(sent_payloads) == 1:
                    raise RuntimeError("Local LLM request failed: unsupported video_url input")
                return {
                    "id": "chatcmpl-1",
                    "model": "vision-model",
                    "choices": [{"message": {"content": '{"answer":"ok"}'}}],
                }

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                    with patch.object(
                        local_llm,
                        "build_video_frame_fallback_attachments",
                        return_value=(frame_attachments, {"used": True, "frame_count": 1, "video_count": 1}),
                    ):
                        content, meta = local_llm._chat_with_local_model_with_meta(
                            system_prompt="sys",
                            user_prompt="Describe the video.",
                            model="vision-model",
                            thinking_enabled=False,
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

        self.assertEqual(content, '{"answer":"ok"}')
        self.assertEqual(sent_payloads[0]["messages"][1]["content"][1]["type"], "video_url")
        self.assertEqual(sent_payloads[1]["messages"][1]["content"][1]["type"], "image_url")
        self.assertEqual(meta["video_fallback"], {"used": True, "frame_count": 1, "video_count": 1})
        self.assertTrue(any("Native video request failed" in warning for warning in meta["warnings"]))

    def test_local_gateway_retries_without_media_when_frame_file_urls_are_rejected(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []
            frame_attachments = [
                {
                    "type": "image",
                    "state_key": "clip#frame_001",
                    "name": "clip_frame_001.jpg",
                    "mime_type": "image/jpeg",
                    "file_url": "file:///tmp/clip_frame_001.jpg",
                }
            ]

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                if len(sent_payloads) == 1:
                    raise RuntimeError("Local LLM request failed: unsupported content[].type")
                if len(sent_payloads) == 2:
                    raise RuntimeError("Local LLM request failed: file:// URLs are not allowed unless --media-path is specified")
                return {
                    "id": "chatcmpl-1",
                    "model": "vision-model",
                    "choices": [{"message": {"content": '{"answer":"text-only ok"}'}}],
                }

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                    with patch.object(
                        local_llm,
                        "build_video_frame_fallback_attachments",
                        return_value=(frame_attachments, {"used": True, "frame_count": 1, "video_count": 1}),
                    ):
                        content, meta = local_llm._chat_with_local_model_with_meta(
                            system_prompt="sys",
                            user_prompt="Describe the video.",
                            model="vision-model",
                            thinking_enabled=False,
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

        self.assertEqual(content, '{"answer":"text-only ok"}')
        self.assertEqual(sent_payloads[0]["messages"][1]["content"][1]["type"], "video_url")
        self.assertEqual(sent_payloads[1]["messages"][1]["content"][1]["type"], "image_url")
        self.assertEqual(sent_payloads[2]["messages"][1]["content"], "Describe the video.")
        self.assertEqual(meta["video_fallback"], {"used": True, "frame_count": 1, "video_count": 1, "text_only_retry": True})
        self.assertTrue(any("retried without media attachments" in warning for warning in meta["warnings"]))

    def test_lm_studio_thinking_payload_uses_reasoning_effort_when_advertised(self) -> None:
        class FakeResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict[str, object]:
                return {
                    "models": [
                        {
                            "key": "openai-gpt-oss-20b",
                            "loaded_instances": [{"id": "openai-gpt-oss-20b"}],
                            "reasoning": {"type": "effort"},
                        }
                    ]
                }

        class FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                pass

            def __enter__(self) -> "FakeClient":
                return self

            def __exit__(self, *args: object) -> None:
                return None

            def get(self, url: str, headers: dict[str, str] | None = None) -> FakeResponse:
                self.last_url = url
                self.last_headers = headers
                return FakeResponse()

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:1234/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            sent_payloads: list[dict[str, object]] = []

            def fake_request(payload: dict[str, object]) -> dict[str, object]:
                sent_payloads.append(dict(payload))
                return {
                    "id": "chatcmpl-1",
                    "model": "openai-gpt-oss-20b",
                    "choices": [{"message": {"content": '{"answer":"ok"}', "reasoning": "reasoning"}}],
                }

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(local_llm.httpx, "Client", FakeClient):
                    with patch.object(local_llm, "_request_local_chat_completion", side_effect=fake_request):
                        _content, meta = local_llm._chat_with_local_model_with_meta(
                            system_prompt="sys",
                            user_prompt="user",
                            model="openai-gpt-oss-20b",
                            thinking_enabled=True,
                            thinking_level="medium",
                        )

        self.assertEqual(sent_payloads[0]["reasoning_effort"], "medium")
        self.assertEqual(sent_payloads[0]["stream"], True)
        self.assertNotIn("return_progress", sent_payloads[0])
        self.assertEqual(meta["reasoning_format"], "lmstudio:reasoning_effort")

    def test_build_model_catalog_keeps_discovered_models_separate_from_saved_models(self) -> None:
        saved_settings = {
            "text_model_ref": "local/stale-model",
            "model_providers": {
                "local": {
                    "base_url": "http://127.0.0.1:8888/v1",
                    "models": [{"model": "stale-model", "label": "Stale Model"}],
                }
            },
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
                with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value={"cloud": None, "llama": None}):
                    with patch.object(model_catalog, "get_local_route_model_names", return_value=["gemma-4-26b-a4b-it"]):
                        catalog = model_catalog.build_model_catalog(force_refresh=True)

        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")
        self.assertEqual(catalog["default_text_model_ref"], "local/stale-model")
        self.assertEqual([model["model"] for model in local_provider["models"]], ["stale-model"])
        self.assertEqual([model["model"] for model in local_provider["discovered_models"]], ["gemma-4-26b-a4b-it"])

    def test_build_model_catalog_includes_enabled_openai_provider_models(self) -> None:
        saved_settings = {
            "text_model_ref": "openai/gpt-4.1",
            "video_model_ref": "openai/gpt-4.1",
            "model_providers": {
                "openai": {
                    "label": "OpenAI",
                    "transport": "openai-compatible",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-openai",
                    "enabled": True,
                    "auth_header": "Authorization",
                    "auth_scheme": "Bearer",
                    "models": [{"model": "gpt-4.1", "label": "GPT 4.1"}],
                }
            },
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "load_app_settings", return_value=saved_settings):
                with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value={"cloud": None, "llama": None}):
                    with patch.object(model_catalog, "get_local_route_model_names", return_value=["local-model"]):
                        catalog = model_catalog.build_model_catalog(force_refresh=False)

        openai_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "openai")

        self.assertEqual(catalog["default_text_model_ref"], "openai/gpt-4.1")
        self.assertTrue(openai_provider["configured"])
        self.assertTrue(openai_provider["enabled"])
        self.assertEqual(openai_provider["models"][0]["model_ref"], "openai/gpt-4.1")
        self.assertEqual(openai_provider["models"][0]["label"], "GPT 4.1")

    def test_agent_response_uses_provider_aware_client_for_openai_ref(self) -> None:
        from app.core.runtime import node_system_executor

        runtime_config = {
            "runtime_model_name": "gpt-4.1",
            "resolved_model_ref": "openai/gpt-4.1",
            "resolved_provider_id": "openai",
            "resolved_temperature": 0.2,
            "resolved_thinking": False,
        }

        node = NodeSystemAgentNode(
            ui=NodeSystemNodeUi(position=Position(x=0, y=0)),
            writes=[NodeSystemWriteBinding(state="answer")],
            config=NodeSystemAgentConfig(taskInstruction="Answer as JSON."),
        )

        with patch.object(
            node_system_executor,
            "chat_with_model_ref_with_meta",
            return_value=('{"answer":"ok"}', {"model": "gpt-4.1", "provider_id": "openai", "temperature": 0.2, "warnings": []}),
        ) as chat:
            payload, reasoning, warnings, updated = node_system_executor._generate_agent_response(
                node=node,
                input_values={"question": "hi"},
                skill_context={},
                runtime_config=runtime_config,
            )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(reasoning, "")
        self.assertEqual(warnings, [])
        self.assertEqual(updated["provider_id"], "openai")
        chat.assert_called_once()


if __name__ == "__main__":
    unittest.main()
