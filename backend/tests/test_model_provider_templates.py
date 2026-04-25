from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.model_provider_templates import (
    DIRECT_PROVIDER_IDS,
    get_provider_template,
    list_provider_templates,
    normalize_transport,
)


class ModelProviderTemplateTests(unittest.TestCase):
    def test_direct_templates_include_first_phase_providers(self) -> None:
        self.assertIn("openai", DIRECT_PROVIDER_IDS)
        self.assertIn("openrouter", DIRECT_PROVIDER_IDS)
        self.assertIn("anthropic", DIRECT_PROVIDER_IDS)
        self.assertIn("gemini", DIRECT_PROVIDER_IDS)
        self.assertIn("local", DIRECT_PROVIDER_IDS)

    def test_openrouter_template_is_openai_compatible(self) -> None:
        template = get_provider_template("openrouter")
        self.assertEqual(template["transport"], "openai-compatible")
        self.assertEqual(template["base_url"], "https://openrouter.ai/api/v1")
        self.assertEqual(template["auth_header"], "Authorization")
        self.assertEqual(template["auth_scheme"], "Bearer")

    def test_gemini_template_uses_generate_content_transport(self) -> None:
        template = get_provider_template("gemini")
        self.assertEqual(template["transport"], "gemini-generate-content")
        self.assertEqual(template["base_url"], "https://generativelanguage.googleapis.com/v1beta")

    def test_templates_align_with_hermes_and_openclaw_provider_surface(self) -> None:
        provider_ids = {template["provider_id"] for template in list_provider_templates()}
        expected = {
            "deepseek",
            "xai",
            "groq",
            "mistral",
            "cerebras",
            "nvidia",
            "huggingface",
            "moonshot",
            "zai",
            "alibaba",
            "minimax",
            "vercel-ai-gateway",
            "kilocode",
            "xiaomi",
            "arcee",
            "ollama",
            "vllm",
            "sglang",
            "lmstudio",
            "litellm",
        }
        self.assertTrue(expected.issubset(provider_ids))

    def test_normalize_transport_rejects_unknown_values(self) -> None:
        self.assertEqual(normalize_transport("openai-compatible"), "openai-compatible")
        self.assertEqual(normalize_transport("anthropic-messages"), "anthropic-messages")
        self.assertEqual(normalize_transport("gemini-generate-content"), "gemini-generate-content")
        with self.assertRaises(ValueError):
            normalize_transport("unsupported")


if __name__ == "__main__":
    unittest.main()
