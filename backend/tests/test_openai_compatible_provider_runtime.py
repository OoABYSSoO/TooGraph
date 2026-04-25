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
    "OPENAI_BASE_URL",
    "LOCAL_LLM_BASE_URL",
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

    def test_local_base_url_is_the_primary_custom_provider_env_name(self) -> None:
        with self._patched_local_provider_env(
            LOCAL_BASE_URL="http://127.0.0.1:8801/v1",
            OPENAI_BASE_URL="http://127.0.0.1:8802/v1",
            LOCAL_LLM_BASE_URL="http://127.0.0.1:8803/v1",
        ):
            local_llm, _model_catalog = self._reload_target_modules()

        self.assertEqual(local_llm.LOCAL_LLM_BASE_URL, "http://127.0.0.1:8801/v1")

    def test_build_model_catalog_reports_openai_compatible_custom_provider(self) -> None:
        runtime_config = {
            "display_model_name": "Llama 3.1 8B",
            "cloud": {},
            "llama": {"ctx_size": 8192, "n_predict": 1024},
        }

        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8801/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "load_app_settings", return_value={}):
                with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=runtime_config):
                    with patch.object(model_catalog, "get_local_llm_base_url", return_value="http://127.0.0.1:8801/v1"):
                        with patch.object(model_catalog, "get_local_route_model_names", return_value=["llama-3.1-8b"]) as route_models:
                            with patch.object(model_catalog, "get_default_text_model", return_value="llama-3.1-8b") as default_text_model:
                                with patch.object(model_catalog, "get_default_video_model_name", return_value="llava-1.6"):
                                    catalog = model_catalog.build_model_catalog()

        route_models.assert_called_once_with(force_refresh=False, runtime_config=runtime_config)
        default_text_model.assert_not_called()
        local_provider = next(provider for provider in catalog["providers"] if provider["provider_id"] == "local")

        self.assertEqual(local_provider["label"], "OpenAI-compatible Custom Provider")
        self.assertEqual(
            local_provider["description"],
            "Custom OpenAI-compatible endpoint used by GraphiteUI for local or private model routing.",
        )
        self.assertEqual(local_provider["transport"], "openai-compatible")
        self.assertEqual(local_provider["base_url"], "http://127.0.0.1:8801/v1")
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
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                with patch.object(
                    local_llm,
                    "discover_openai_compatible_models",
                    return_value=["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"],
                ) as discover:
                    models = local_llm.get_local_route_model_names(force_refresh=True)

        self.assertEqual(models, ["gemma-4-26b-a4b-it", "huihui-gemma-4-26b-a4b-it-abliterated"])
        discover.assert_called_once_with(base_url="http://127.0.0.1:8888/v1", api_key="sk-local", timeout_sec=2.0)

    def test_non_forced_runtime_config_does_not_probe_local_gateway(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm.httpx, "Client", side_effect=RuntimeError("network probe")) as client_factory:
                runtime_config = local_llm.get_local_gateway_runtime_config(force_refresh=False)

        self.assertIsNone(runtime_config)
        client_factory.assert_not_called()

    def test_non_forced_local_model_names_do_not_probe_local_gateway(self) -> None:
        with self._patched_local_provider_env(LOCAL_BASE_URL="http://127.0.0.1:8888/v1"):
            local_llm, _model_catalog = self._reload_target_modules()

            with patch.object(local_llm, "load_app_settings", return_value={}):
                with patch.object(local_llm, "get_local_gateway_runtime_config", return_value=None):
                    with patch.object(local_llm, "discover_openai_compatible_models", side_effect=AssertionError("network probe")):
                        models = local_llm.get_local_route_model_names(force_refresh=False)

        self.assertEqual(models, ["lm-local"])

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
