from __future__ import annotations

import importlib
import os
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


LOCAL_LLM_ENV_KEYS = (
    "EZLLM_BASE_URL",
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


class LocalLlmEzllmRuntimeTests(unittest.TestCase):
    @contextmanager
    def _patched_local_llm_env(self, **updates: str):
        original = {key: os.environ.get(key) for key in LOCAL_LLM_ENV_KEYS}
        for key in LOCAL_LLM_ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(updates)
        try:
            yield
        finally:
            for key in LOCAL_LLM_ENV_KEYS:
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

    def test_ezllm_base_url_takes_precedence_over_legacy_env_names(self) -> None:
        with self._patched_local_llm_env(
            EZLLM_BASE_URL="http://127.0.0.1:8899/v1",
            LOCAL_BASE_URL="http://127.0.0.1:8801/v1",
            OPENAI_BASE_URL="http://127.0.0.1:8802/v1",
            LOCAL_LLM_BASE_URL="http://127.0.0.1:8803/v1",
        ):
            local_llm, _model_catalog = self._reload_target_modules()

        self.assertEqual(local_llm.LOCAL_LLM_BASE_URL, "http://127.0.0.1:8899/v1")

    def test_build_model_catalog_reports_ezllm_runtime_provider_metadata(self) -> None:
        runtime_config = {
            "display_model_name": "Llama 3.1 8B",
            "cloud": {},
            "llama": {"ctx_size": 8192, "n_predict": 1024},
        }

        with self._patched_local_llm_env(EZLLM_BASE_URL="http://127.0.0.1:8899/v1"):
            _local_llm, model_catalog = self._reload_target_modules()

            with patch.object(model_catalog, "get_local_gateway_runtime_config", return_value=runtime_config):
                with patch.object(model_catalog, "get_local_route_model_names", return_value=["llama-3.1-8b"]):
                    with patch.object(model_catalog, "get_default_text_model", return_value="llama-3.1-8b"):
                        with patch.object(model_catalog, "get_default_video_model_name", return_value="llava-1.6"):
                            catalog = model_catalog.build_model_catalog()

        local_provider = next(
            provider for provider in catalog["providers"] if provider["provider_id"] == "local"
        )

        self.assertEqual(local_provider["label"], "EZLLM Runtime")
        self.assertEqual(
            local_provider["description"],
            "External EZLLM runtime used by GraphiteUI for local model routing, runtime metadata, logs, and provider fan-out.",
        )
        self.assertEqual(local_provider["base_url"], "http://127.0.0.1:8899/v1")
        self.assertEqual(local_provider["gateway"], runtime_config)


if __name__ == "__main__":
    unittest.main()
