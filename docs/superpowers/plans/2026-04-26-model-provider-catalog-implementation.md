# Model Provider Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build multi-provider model configuration for OpenAI, OpenRouter, Anthropic, Gemini, Local/Custom, plus Hermes/OpenClaw-aligned provider templates.

**Architecture:** Add a provider-template registry, a provider HTTP client with transport dispatch, and a catalog builder that merges saved settings, templates, and live discovery. The frontend settings page becomes an editable multi-provider manager while existing node model menus continue to consume `settings.model_catalog`.

**Tech Stack:** FastAPI, Pydantic, httpx, unittest, Vue 3, Element Plus, TypeScript node tests, Vite.

---

## File Structure

- Create `backend/app/core/model_provider_templates.py`
  - Owns provider ids, default base URLs, transports, auth defaults, and template grouping.
- Create `backend/app/tools/model_provider_client.py`
  - Owns model discovery and chat calls for `openai-compatible`, `anthropic-messages`, and `gemini-generate-content`.
- Modify `backend/app/tools/local_llm.py`
  - Keep existing local helper API, but delegate reusable OpenAI-compatible discovery/chat parsing to the new generic client.
- Modify `backend/app/core/model_catalog.py`
  - Build the full provider catalog from saved settings, provider templates, and live discovery.
  - Resolve default model refs from all enabled configured providers, not only `local`.
- Modify `backend/app/api/routes_settings.py`
  - Accept provider fields `transport`, `enabled`, `auth_header`, `auth_scheme`, and provider model metadata.
  - Make `/model-providers/discover` transport-aware.
- Modify `backend/app/core/runtime/node_system_executor.py`
  - Replace local-only chat dispatch with provider-aware dispatch.
- Add or modify backend tests:
  - `backend/tests/test_model_provider_templates.py`
  - `backend/tests/test_model_provider_client.py`
  - `backend/tests/test_settings_model_providers.py`
  - `backend/tests/test_openai_compatible_provider_runtime.py`
- Modify `frontend/src/types/settings.ts`
  - Add provider template, transport, enabled, configured, and metadata fields.
- Modify `frontend/src/api/settings.ts`
  - Post transport-aware discovery and provider updates.
- Modify `frontend/src/pages/settingsPageModel.ts`
  - Add pure helpers for provider draft building, template filtering, dirty checks, and save payload generation.
- Modify `frontend/src/pages/SettingsPage.vue`
  - Replace the single local-provider form with a multi-provider editable manager.
- Modify `frontend/src/pages/settingsPageModel.test.ts`
  - Cover helper behavior without mounting Vue.
- Modify `frontend/src/api/settings.test.ts`
  - Cover new API payloads.
- Modify `frontend/src/i18n/messages.ts`
  - Add labels for provider templates, enabled state, transport, manual model entry, and discovery errors.

## Task 1: Provider Templates

**Files:**
- Create: `backend/app/core/model_provider_templates.py`
- Test: `backend/tests/test_model_provider_templates.py`

- [ ] **Step 1: Write failing template tests**

Create `backend/tests/test_model_provider_templates.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest backend.tests.test_model_provider_templates
```

Expected: FAIL because `app.core.model_provider_templates` does not exist.

- [ ] **Step 3: Implement provider templates**

Create `backend/app/core/model_provider_templates.py` with:

```python
from __future__ import annotations

from copy import deepcopy
from typing import Any


TRANSPORT_OPENAI_COMPATIBLE = "openai-compatible"
TRANSPORT_ANTHROPIC_MESSAGES = "anthropic-messages"
TRANSPORT_GEMINI_GENERATE_CONTENT = "gemini-generate-content"
SUPPORTED_TRANSPORTS = {
    TRANSPORT_OPENAI_COMPATIBLE,
    TRANSPORT_ANTHROPIC_MESSAGES,
    TRANSPORT_GEMINI_GENERATE_CONTENT,
}

DIRECT_PROVIDER_IDS = ("openai", "openrouter", "anthropic", "gemini", "local")


def _openai_template(provider_id: str, label: str, base_url: str, *, group: str = "compatible") -> dict[str, Any]:
    return {
        "provider_id": provider_id,
        "label": label,
        "description": f"{label} provider template.",
        "transport": TRANSPORT_OPENAI_COMPATIBLE,
        "base_url": base_url.rstrip("/"),
        "auth_header": "Authorization",
        "auth_scheme": "Bearer",
        "enabled": provider_id == "local",
        "template_group": group,
        "models": [],
        "example_model_refs": [],
    }


PROVIDER_TEMPLATES: dict[str, dict[str, Any]] = {
    "local": {
        **_openai_template("local", "Local / Custom OpenAI-compatible", "http://127.0.0.1:8888/v1", group="direct"),
        "description": "Local or private OpenAI-compatible endpoint.",
    },
    "openai": {
        **_openai_template("openai", "OpenAI", "https://api.openai.com/v1", group="direct"),
        "enabled": False,
        "example_model_refs": ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
    },
    "openrouter": {
        **_openai_template("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", group="direct"),
        "example_model_refs": ["openrouter/auto", "openrouter/openai/gpt-4.1"],
    },
    "anthropic": {
        "provider_id": "anthropic",
        "label": "Anthropic",
        "description": "Direct Claude API through Anthropic Messages.",
        "transport": TRANSPORT_ANTHROPIC_MESSAGES,
        "base_url": "https://api.anthropic.com/v1",
        "auth_header": "x-api-key",
        "auth_scheme": "",
        "enabled": False,
        "template_group": "direct",
        "models": [],
        "example_model_refs": ["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-1"],
    },
    "gemini": {
        "provider_id": "gemini",
        "label": "Google Gemini",
        "description": "Google AI Studio Gemini API.",
        "transport": TRANSPORT_GEMINI_GENERATE_CONTENT,
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "auth_header": "x-goog-api-key",
        "auth_scheme": "",
        "enabled": False,
        "template_group": "direct",
        "models": [],
        "example_model_refs": ["gemini/gemini-2.0-flash", "gemini/gemini-1.5-pro"],
    },
    "deepseek": _openai_template("deepseek", "DeepSeek", "https://api.deepseek.com/v1"),
    "xai": _openai_template("xai", "xAI", "https://api.x.ai/v1"),
    "groq": _openai_template("groq", "Groq", "https://api.groq.com/openai/v1"),
    "mistral": _openai_template("mistral", "Mistral", "https://api.mistral.ai/v1"),
    "cerebras": _openai_template("cerebras", "Cerebras", "https://api.cerebras.ai/v1"),
    "nvidia": _openai_template("nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1"),
    "huggingface": _openai_template("huggingface", "Hugging Face Inference", "https://router.huggingface.co/v1"),
    "moonshot": _openai_template("moonshot", "Moonshot / Kimi", "https://api.moonshot.ai/v1"),
    "zai": _openai_template("zai", "Z.AI / GLM", "https://api.z.ai/api/paas/v4"),
    "alibaba": _openai_template("alibaba", "Alibaba / Qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    "minimax": _openai_template("minimax", "MiniMax", "https://api.minimax.io/v1"),
    "vercel-ai-gateway": _openai_template("vercel-ai-gateway", "Vercel AI Gateway", "https://ai-gateway.vercel.sh/v1"),
    "kilocode": _openai_template("kilocode", "KiloCode", "https://api.kilo.ai/api/gateway"),
    "xiaomi": _openai_template("xiaomi", "Xiaomi MiMo", "https://api.mimoapi.com/v1"),
    "arcee": _openai_template("arcee", "Arcee AI", "https://conductor.arcee.ai/v1"),
    "ollama": _openai_template("ollama", "Ollama", "http://127.0.0.1:11434/v1"),
    "vllm": _openai_template("vllm", "vLLM", "http://127.0.0.1:8000/v1"),
    "sglang": _openai_template("sglang", "SGLang", "http://127.0.0.1:30000/v1"),
    "lmstudio": _openai_template("lmstudio", "LM Studio", "http://127.0.0.1:1234/v1"),
    "litellm": _openai_template("litellm", "LiteLLM", "http://127.0.0.1:4000/v1"),
    "kimi-coding": {
        "provider_id": "kimi-coding",
        "label": "Kimi Coding",
        "description": "Moonshot Anthropic-compatible coding endpoint.",
        "transport": TRANSPORT_ANTHROPIC_MESSAGES,
        "base_url": "https://api.moonshot.ai/anthropic",
        "auth_header": "x-api-key",
        "auth_scheme": "",
        "enabled": False,
        "template_group": "compatible",
        "models": [],
        "example_model_refs": ["kimi-coding/kimi-code"],
    },
    "synthetic": {
        "provider_id": "synthetic",
        "label": "Synthetic",
        "description": "Synthetic Anthropic-compatible endpoint.",
        "transport": TRANSPORT_ANTHROPIC_MESSAGES,
        "base_url": "https://api.synthetic.new/anthropic",
        "auth_header": "x-api-key",
        "auth_scheme": "",
        "enabled": False,
        "template_group": "compatible",
        "models": [],
        "example_model_refs": ["synthetic/hf:MiniMaxAI/MiniMax-M2.5"],
    },
    "bedrock": {
        "provider_id": "bedrock",
        "label": "AWS Bedrock",
        "description": "Template only in this phase; use a compatible gateway for runtime calls.",
        "transport": TRANSPORT_OPENAI_COMPATIBLE,
        "base_url": "",
        "auth_header": "Authorization",
        "auth_scheme": "Bearer",
        "enabled": False,
        "template_group": "external-auth",
        "models": [],
        "example_model_refs": ["bedrock/anthropic.claude-sonnet-4-5"],
    },
}


def normalize_transport(value: str) -> str:
    transport = str(value or "").strip()
    if transport not in SUPPORTED_TRANSPORTS:
        raise ValueError(f"Unsupported provider transport: {transport}")
    return transport


def get_provider_template(provider_id: str) -> dict[str, Any]:
    provider_key = str(provider_id or "").strip()
    template = PROVIDER_TEMPLATES.get(provider_key)
    if template is None:
        return _openai_template(provider_key, provider_key, "", group="custom")
    return deepcopy(template)


def list_provider_templates() -> list[dict[str, Any]]:
    return [deepcopy(template) for template in PROVIDER_TEMPLATES.values()]
```

- [ ] **Step 4: Run template tests**

Run:

```powershell
python -m unittest backend.tests.test_model_provider_templates
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add backend/app/core/model_provider_templates.py backend/tests/test_model_provider_templates.py
git commit -m "增加模型供应商模板"
```

Expected: commit succeeds with a Chinese message.

## Task 2: Provider HTTP Client

**Files:**
- Create: `backend/app/tools/model_provider_client.py`
- Modify: `backend/app/tools/local_llm.py`
- Test: `backend/tests/test_model_provider_client.py`
- Test: `backend/tests/test_openai_compatible_provider_runtime.py`

- [ ] **Step 1: Write failing client tests**

Create `backend/tests/test_model_provider_client.py` with tests for all three transports. Use `unittest.mock.patch("app.tools.model_provider_client.httpx.Client")` and a fake client object that records `get` and `post` calls.

The test class must contain these concrete test methods:

- `test_discovers_openai_compatible_models_with_bearer_header`
- `test_discovers_anthropic_models_with_version_header`
- `test_discovers_gemini_models_and_filters_generate_content`
- `test_chat_openai_compatible_posts_chat_completions`
- `test_chat_anthropic_posts_messages_payload`
- `test_chat_gemini_posts_generate_content_payload`

For Anthropic discovery, assert:

```python
self.assertEqual(requested_url, "https://api.anthropic.com/v1/models")
self.assertEqual(requested_headers["x-api-key"], "sk-ant")
self.assertEqual(requested_headers["anthropic-version"], "2023-06-01")
```

For Gemini chat, assert:

```python
self.assertEqual(
    requested_url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
)
self.assertEqual(requested_params, {"key": "gemini-key"})
self.assertEqual(requested_json["system_instruction"]["parts"]["text"], "sys")
self.assertEqual(requested_json["contents"][0]["parts"][0]["text"], "user")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest backend.tests.test_model_provider_client
```

Expected: FAIL because `app.tools.model_provider_client` does not exist.

- [ ] **Step 3: Implement the generic client**

Create `backend/app/tools/model_provider_client.py` with these public functions:

```python
def discover_provider_models(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str = "",
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    timeout_sec: float = 8.0,
) -> list[str]:
    """Return provider-visible model ids or raise RuntimeError."""

def chat_with_model_provider(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None = None,
    thinking_enabled: bool = False,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
) -> tuple[str, dict[str, Any]]:
    """Return assistant text plus provider metadata or raise RuntimeError."""
```

Implementation rules:

- OpenAI-compatible discovery calls `GET {base_url}/models` and parses `data[].id`.
- Anthropic discovery calls `GET {base_url}/models`, sends `x-api-key` and `anthropic-version: 2023-06-01`, and parses `data[].id`.
- Gemini discovery calls `GET {base_url}/models` with `params={"key": api_key}`, strips a leading `models/`, and only includes models where `supportedGenerationMethods` is absent or contains `generateContent`.
- OpenAI-compatible chat calls `POST {base_url}/chat/completions`.
- Anthropic chat calls `POST {base_url}/messages`, uses body fields `model`, `system`, `max_tokens`, `temperature`, and `messages`.
- Gemini chat calls `POST {base_url}/models/{model}:generateContent`, passes API key as query param, uses `system_instruction`, `contents`, and `generationConfig`.
- Response parsing returns assistant text plus metadata fields `model`, `provider_id`, `temperature`, `usage`, `response_id`, and `warnings`.

- [ ] **Step 4: Delegate local helpers to generic discovery**

In `backend/app/tools/local_llm.py`, keep `discover_openai_compatible_models` as an exported function, but implement it by calling `discover_provider_models(provider_id="local", transport="openai-compatible", base_url=base_url, api_key=api_key, timeout_sec=timeout_sec)`. Keep `_chat_with_local_model_with_meta` working for existing tests.

- [ ] **Step 5: Run client and existing local tests**

Run:

```powershell
python -m unittest backend.tests.test_model_provider_client backend.tests.test_openai_compatible_provider_runtime
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add backend/app/tools/model_provider_client.py backend/app/tools/local_llm.py backend/tests/test_model_provider_client.py backend/tests/test_openai_compatible_provider_runtime.py
git commit -m "增加多供应商模型客户端"
```

Expected: commit succeeds.

## Task 3: Settings API and Catalog

**Files:**
- Modify: `backend/app/api/routes_settings.py`
- Modify: `backend/app/core/model_catalog.py`
- Test: `backend/tests/test_settings_model_providers.py`
- Test: `backend/tests/test_openai_compatible_provider_runtime.py`

- [ ] **Step 1: Write failing settings and catalog tests**

Extend `backend/tests/test_settings_model_providers.py`:

```python
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
    discover.assert_called_once()


def test_update_settings_preserves_existing_api_key_when_blank(self) -> None:
    existing = {
        "model_providers": {
            "openai": {
                "label": "OpenAI",
                "transport": "openai-compatible",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-existing",
                "enabled": True,
                "models": [{"model": "gpt-4.1", "label": "GPT 4.1"}],
            }
        }
    }
    # Patch load_app_settings/save_app_settings and post blank api_key.
    # Assert saved provider keeps "sk-existing".
```

Extend `backend/tests/test_openai_compatible_provider_runtime.py`:

```python
def test_build_model_catalog_includes_enabled_openai_provider_models(self) -> None:
    saved_settings = {
        "text_model_ref": "openai/gpt-4.1",
        "model_providers": {
            "openai": {
                "label": "OpenAI",
                "transport": "openai-compatible",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-openai",
                "enabled": True,
                "models": [{"model": "gpt-4.1", "label": "GPT 4.1"}],
            }
        },
    }
    # Patch load_app_settings and local helpers.
    # Assert catalog default_text_model_ref == "openai/gpt-4.1"
    # Assert provider "openai" is configured and has model_ref "openai/gpt-4.1".
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```powershell
python -m unittest backend.tests.test_settings_model_providers backend.tests.test_openai_compatible_provider_runtime
```

Expected: FAIL because schemas and catalog do not yet accept non-local provider config.

- [ ] **Step 3: Extend Pydantic payloads**

Update `backend/app/api/routes_settings.py`:

```python
class SettingsProviderModelPayload(BaseModel):
    model: str = Field(min_length=1)
    label: str | None = None
    route_target: str | None = Field(default=None, alias="route_target")
    reasoning: bool | None = None
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    context_window: int | None = Field(default=None, alias="context_window")
    max_tokens: int | None = Field(default=None, alias="max_tokens")


class SettingsModelProviderPayload(BaseModel):
    label: str | None = None
    transport: str = Field(default="openai-compatible")
    base_url: str = Field(alias="base_url")
    api_key: str | None = Field(default=None, alias="api_key")
    enabled: bool = True
    auth_header: str | None = Field(default=None, alias="auth_header")
    auth_scheme: str | None = Field(default=None, alias="auth_scheme")
    models: list[SettingsProviderModelPayload] = Field(default_factory=list)
```

Update `_merge_model_providers` so each saved provider stores `label`, `transport`, `base_url`, `enabled`, `auth_header`, `auth_scheme`, and normalized `models`. Preserve an existing `api_key` when incoming `api_key` is blank.

- [ ] **Step 4: Make discovery endpoint transport-aware**

Update `ModelDiscoveryPayload` and endpoint:

```python
class ModelDiscoveryPayload(BaseModel):
    provider_id: str = Field(default="custom", alias="provider_id")
    transport: str = Field(default="openai-compatible")
    base_url: str = Field(alias="base_url", min_length=1)
    api_key: str = Field(default="", alias="api_key")
    auth_header: str | None = Field(default=None, alias="auth_header")
    auth_scheme: str | None = Field(default=None, alias="auth_scheme")
```

Call:

```python
models = discover_provider_models(
    provider_id=payload.provider_id,
    transport=payload.transport,
    base_url=payload.base_url,
    api_key=payload.api_key,
    auth_header=payload.auth_header or "Authorization",
    auth_scheme=payload.auth_scheme if payload.auth_scheme is not None else "Bearer",
)
```

- [ ] **Step 5: Rewrite catalog merge for all providers**

Update `backend/app/core/model_catalog.py` to:

- Include `provider_templates` from `list_provider_templates()`.
- Merge saved provider configs over templates.
- Preserve special local gateway fields and auto-discovery.
- For enabled providers with an API key, call `discover_provider_models(provider_id=provider_id, transport=transport, base_url=base_url, api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme, timeout_sec=2.0)` when `force_refresh=True`.
- Build `provider["models"]` as objects with `model_ref`, `model`, `label`, `reasoning`, `modalities`, `context_window`, and `max_tokens`.
- Set `provider["configured"]` to true when `enabled` is true and either an API key is present or the provider is local/custom local without required auth.

- [ ] **Step 6: Update default model ref selection**

Update `get_default_text_model_ref` and `get_default_video_model_ref`:

- If saved ref is available in an enabled configured provider, return it.
- If saved provider exists but the saved model is stale and live discovery returns models, return the first live model for that provider.
- If saved ref is unusable, return the first configured model across providers.
- If no cloud/custom provider is configured, keep current local fallback.

- [ ] **Step 7: Run backend settings/catalog tests**

Run:

```powershell
python -m unittest backend.tests.test_settings_model_providers backend.tests.test_openai_compatible_provider_runtime
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add backend/app/api/routes_settings.py backend/app/core/model_catalog.py backend/tests/test_settings_model_providers.py backend/tests/test_openai_compatible_provider_runtime.py
git commit -m "扩展模型供应商设置接口"
```

Expected: commit succeeds.

## Task 4: Runtime Provider Dispatch

**Files:**
- Modify: `backend/app/core/runtime/node_system_executor.py`
- Modify: `backend/app/tools/model_provider_client.py`
- Test: `backend/tests/test_openai_compatible_provider_runtime.py`

- [ ] **Step 1: Write failing runtime dispatch test**

Add to `backend/tests/test_openai_compatible_provider_runtime.py`:

```python
def test_agent_response_uses_provider_aware_client_for_openai_ref(self) -> None:
    from app.core.runtime import node_system_executor

    runtime_config = {
        "runtime_model_name": "gpt-4.1",
        "resolved_provider_id": "openai",
        "resolved_temperature": 0.2,
        "resolved_thinking": False,
    }

    with patch.object(
        node_system_executor,
        "chat_with_model_ref_with_meta",
        return_value=('{"answer":"ok"}', {"model": "gpt-4.1", "provider_id": "openai", "temperature": 0.2, "warnings": []}),
    ) as chat:
        payload, reasoning, warnings, updated = node_system_executor._generate_agent_response(
            node=_build_minimal_agent_node(),
            input_values={"question": "hi"},
            skill_context={},
            runtime_config=runtime_config,
        )

    self.assertEqual(payload["answer"], "ok")
    self.assertEqual(updated["provider_id"], "openai")
    chat.assert_called_once()
```

Use the existing schema constructors in this test file or add a small helper `_build_minimal_agent_node()` that returns a `NodeSystemAgentNode` with one write binding.

Use this helper if the test file has no existing builder:

```python
from app.core.schemas.node_system import (
    NodeSystemAgentConfig,
    NodeSystemAgentNode,
    NodeSystemNodeUi,
    NodeSystemWriteBinding,
    Position,
)


def _build_minimal_agent_node() -> NodeSystemAgentNode:
    return NodeSystemAgentNode(
        ui=NodeSystemNodeUi(position=Position(x=0, y=0)),
        writes=[NodeSystemWriteBinding(state="answer")],
        config=NodeSystemAgentConfig(taskInstruction="Answer as JSON."),
    )
```

- [ ] **Step 2: Run runtime test to verify failure**

Run:

```powershell
python -m unittest backend.tests.test_openai_compatible_provider_runtime
```

Expected: FAIL because `chat_with_model_ref_with_meta` is not imported or used.

- [ ] **Step 3: Add runtime resolver in client**

In `backend/app/tools/model_provider_client.py`, add:

```python
def chat_with_model_ref_with_meta(
    *,
    model_ref: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None = None,
    thinking_enabled: bool = False,
) -> tuple[str, dict[str, Any]]:
    provider_id, model_name = model_ref.split("/", 1) if "/" in model_ref else ("local", model_ref)
    saved_settings = load_app_settings()
    saved_providers = saved_settings.get("model_providers") if isinstance(saved_settings.get("model_providers"), dict) else {}
    saved_provider = saved_providers.get(provider_id) if isinstance(saved_providers, dict) else {}
    template = get_provider_template(provider_id)
    provider_config = {**template, **(saved_provider if isinstance(saved_provider, dict) else {})}
    return chat_with_model_provider(
        provider_id=provider_id,
        transport=str(provider_config.get("transport") or template["transport"]),
        base_url=str(provider_config.get("base_url") or template["base_url"]),
        api_key=str(provider_config.get("api_key") or ""),
        model=model_name,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_enabled=thinking_enabled,
        auth_header=str(provider_config.get("auth_header") or template["auth_header"]),
        auth_scheme=str(provider_config.get("auth_scheme") if provider_config.get("auth_scheme") is not None else template["auth_scheme"]),
    )
```

For `local`, use the saved local provider base URL/API key when present and fall back to `LOCAL_BASE_URL`/`LOCAL_API_KEY` behavior through `local_llm` helpers to preserve existing local runtime behavior.

- [ ] **Step 4: Replace local-only runtime call**

In `backend/app/core/runtime/node_system_executor.py`:

- Remove `_chat_with_local_model_with_meta` import.
- Import `chat_with_model_ref_with_meta`.
- Replace the call in `_generate_agent_response` with:

```python
content, llm_meta = chat_with_model_ref_with_meta(
    model_ref=runtime_config["resolved_model_ref"],
    system_prompt=system_prompt,
    user_prompt=user_prompt,
    temperature=runtime_config["resolved_temperature"],
    thinking_enabled=runtime_config["resolved_thinking"],
)
```

- [ ] **Step 5: Preserve thinking warnings**

Ensure non-local providers return a warning when `thinking_enabled=True`, matching the existing behavior that only maps local-specific thinking fields for the local gateway.

- [ ] **Step 6: Run runtime tests**

Run:

```powershell
python -m unittest backend.tests.test_openai_compatible_provider_runtime backend.tests.test_model_provider_client
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add backend/app/core/runtime/node_system_executor.py backend/app/tools/model_provider_client.py backend/tests/test_openai_compatible_provider_runtime.py backend/tests/test_model_provider_client.py
git commit -m "接入运行时多供应商分发"
```

Expected: commit succeeds.

## Task 5: Frontend Types, API, and Helpers

**Files:**
- Modify: `frontend/src/types/settings.ts`
- Modify: `frontend/src/api/settings.ts`
- Modify: `frontend/src/api/settings.test.ts`
- Modify: `frontend/src/pages/settingsPageModel.ts`
- Modify: `frontend/src/pages/settingsPageModel.test.ts`

- [ ] **Step 1: Write failing frontend API tests**

Update `frontend/src/api/settings.test.ts` so provider payload includes:

```ts
model_providers: {
  openai: {
    label: "OpenAI",
    transport: "openai-compatible",
    base_url: "https://api.openai.com/v1",
    api_key: "sk-openai",
    enabled: true,
    auth_header: "Authorization",
    auth_scheme: "Bearer",
    models: [{ model: "gpt-4.1", label: "GPT 4.1", modalities: ["text"] }],
  },
},
```

Update discovery test to post:

```ts
{
  provider_id: "anthropic",
  transport: "anthropic-messages",
  base_url: "https://api.anthropic.com/v1",
  api_key: "sk-ant",
  auth_header: "x-api-key",
  auth_scheme: "",
}
```

- [ ] **Step 2: Write failing helper tests**

Update `frontend/src/pages/settingsPageModel.test.ts`:

```ts
import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  listAddableProviderTemplates,
} from "./settingsPageModel.ts";

test("buildProviderDraftsFromSettings keeps stored API keys hidden", () => {
  const payloadWithOpenAiProvider = {
    model: {
      text_model: "gpt-4.1",
      text_model_ref: "openai/gpt-4.1",
      video_model: "gpt-4.1",
      video_model_ref: "openai/gpt-4.1",
    },
    agent_runtime_defaults: {
      model: "openai/gpt-4.1",
      thinking_enabled: false,
      temperature: 0.2,
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "openai",
          label: "OpenAI",
          description: "OpenAI",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "https://api.openai.com/v1",
          auth_header: "Authorization",
          auth_scheme: "Bearer",
          api_key_configured: true,
          models: [{ model_ref: "openai/gpt-4.1", model: "gpt-4.1", label: "GPT 4.1" }],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    evaluator: { default_score_threshold: 7.8, routes: ["pass", "revise", "fail"] },
    tools: [],
  } as const;
  const drafts = buildProviderDraftsFromSettings(payloadWithOpenAiProvider);
  assert.equal(drafts.openai.api_key, "");
  assert.equal(drafts.openai.api_key_configured, true);
});

test("buildProviderSavePayload includes enabled providers and omits blank api keys", () => {
  const payload = buildProviderSavePayload({
    openai: {
      provider_id: "openai",
      label: "OpenAI",
      transport: "openai-compatible",
      base_url: "https://api.openai.com/v1",
      enabled: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      api_key: "",
      api_key_configured: true,
      discovered_models: ["gpt-4.1"],
      selected_models: ["gpt-4.1"],
    },
  });
  assert.equal(payload.openai.api_key, undefined);
  assert.equal(payload.openai.enabled, true);
  assert.equal(payload.openai.transport, "openai-compatible");
});
```

- [ ] **Step 3: Run frontend tests to verify failures**

Run:

```powershell
node --test frontend\\src\\api\\settings.test.ts frontend\\src\\pages\\settingsPageModel.test.ts
```

Expected: FAIL because types and helpers do not contain the new fields.

- [ ] **Step 4: Extend TypeScript types and API payloads**

Update `frontend/src/types/settings.ts`:

```ts
export type ModelProviderTransport =
  | "openai-compatible"
  | "anthropic-messages"
  | "gemini-generate-content";

export type SettingsProviderModel = {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
  reasoning?: boolean;
  modalities?: string[];
  context_window?: number | null;
  max_tokens?: number | null;
};

export type SettingsModelProvider = {
  provider_id: string;
  label: string;
  description: string;
  transport: ModelProviderTransport;
  configured: boolean;
  enabled: boolean;
  base_url: string;
  auth_header?: string;
  auth_scheme?: string;
  api_key_configured?: boolean;
  models: SettingsProviderModel[];
  example_model_refs: string[];
  template_group?: string;
  gateway?: Record<string, unknown>;
};
```

Update `frontend/src/api/settings.ts` so `SettingsModelProviderUpdate` and `discoverModelProviderModels` accept the same fields.

- [ ] **Step 5: Add provider draft helpers**

Update `frontend/src/pages/settingsPageModel.ts` with pure helpers:

```ts
export type ProviderDraft = {
  provider_id: string;
  label: string;
  transport: ModelProviderTransport;
  base_url: string;
  enabled: boolean;
  auth_header: string;
  auth_scheme: string;
  api_key: string;
  api_key_configured: boolean;
  discovered_models: string[];
  selected_models: string[];
};

export function buildProviderDraftsFromSettings(payload: SettingsPayload): Record<string, ProviderDraft> {
  const providers = payload.model_catalog?.providers ?? [];
  return Object.fromEntries(providers.filter((provider) => provider.configured || provider.provider_id === "local").map((provider) => [
    provider.provider_id,
    {
      provider_id: provider.provider_id,
      label: provider.label,
      transport: provider.transport,
      base_url: provider.base_url,
      enabled: provider.enabled,
      auth_header: provider.auth_header ?? "Authorization",
      auth_scheme: provider.auth_scheme ?? "Bearer",
      api_key: "",
      api_key_configured: Boolean(provider.api_key_configured),
      discovered_models: provider.models.map((model) => model.model),
      selected_models: provider.models.map((model) => model.model),
    },
  ]));
}

export function buildProviderSavePayload(drafts: Record<string, ProviderDraft>): Record<string, SettingsModelProviderUpdate> {
  return Object.fromEntries(Object.entries(drafts).map(([providerId, draft]) => [
    providerId,
    {
      label: draft.label,
      transport: draft.transport,
      base_url: draft.base_url,
      api_key: draft.api_key.trim() || undefined,
      enabled: draft.enabled,
      auth_header: draft.auth_header,
      auth_scheme: draft.auth_scheme,
      models: dedupeStrings(draft.selected_models).map((model) => ({ model, label: model })),
    },
  ]));
}

export function listAddableProviderTemplates(payload: SettingsPayload, drafts: Record<string, ProviderDraft>): SettingsModelProvider[] {
  const existing = new Set(Object.keys(drafts));
  return (payload.model_catalog?.provider_templates ?? []).filter((provider) => !existing.has(provider.provider_id));
}

export function providerDraftsFingerprint(drafts: Record<string, ProviderDraft>): string {
  return JSON.stringify(buildProviderSavePayload(drafts));
}
```

Rules:

- `api_key` is always `""` when building from settings.
- `api_key_configured` reflects backend state.
- Save payload omits blank `api_key`.
- Selected models are deduped and saved as `{ model, label }`.

- [ ] **Step 6: Run frontend helper/API tests**

Run:

```powershell
node --test frontend\\src\\api\\settings.test.ts frontend\\src\\pages\\settingsPageModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add frontend/src/types/settings.ts frontend/src/api/settings.ts frontend/src/api/settings.test.ts frontend/src/pages/settingsPageModel.ts frontend/src/pages/settingsPageModel.test.ts
git commit -m "扩展前端模型供应商数据模型"
```

Expected: commit succeeds.

## Task 6: Settings Page Multi-Provider UI

**Files:**
- Modify: `frontend/src/pages/SettingsPage.vue`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/src/i18n/messages.test.ts`
- Test: `frontend/src/pages/settingsPageModel.test.ts`

- [ ] **Step 1: Update settings page structure**

In `frontend/src/pages/SettingsPage.vue`:

- Replace `providerDraft` with `providerDrafts`.
- Add `selectedTemplateId` for template selection.
- Render editable provider cards from `providerDrafts`.
- Add provider button copies a template into `providerDrafts`.
- Discovery button calls `discoverModelProviderModels` with provider id, transport, base URL, API key, auth header, and auth scheme.
- Default model options come from all enabled configured models plus selected draft models.

Use Element Plus controls already present in the project: `ElSelect`, `ElOption`, and plain inputs/buttons matching existing styles.

- [ ] **Step 2: Add i18n keys**

In `frontend/src/i18n/messages.ts`, add these keys in `settings` for `zh-CN` and `en-US`:

```ts
addProvider: "Add provider",
providerTemplate: "Provider template",
enabledProvider: "Enabled",
disabledProvider: "Disabled",
providerId: "Provider ID",
providerTransport: "Transport",
manualModels: "Manual models",
removeProvider: "Remove provider",
noProviderTemplates: "No more templates",
providerDiscoveryFailed: "Discovery failed: {error}",
```

Use the corresponding Chinese strings in `zh-CN`.

- [ ] **Step 3: Ensure default selection stays valid**

When a provider is disabled or its selected models become empty:

- If the current default model ref belongs to that provider, select the first enabled model from any provider.
- If no enabled model exists, keep the current value and show the save button disabled until a provider/model is added.

- [ ] **Step 4: Run frontend tests and build**

Run:

```powershell
node --test frontend\\src\\pages\\settingsPageModel.test.ts frontend\\src\\i18n\\messages.test.ts
npx.cmd vite build
```

Expected: tests PASS and Vite build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/pages/SettingsPage.vue frontend/src/i18n/messages.ts frontend/src/pages/settingsPageModel.test.ts
git commit -m "改造设置页多供应商配置"
```

Expected: commit succeeds.

## Task 7: Verification, Connectivity, and Restart

**Files:**
- Runtime data may update under `backend/data/settings/app_settings.json`; do not commit local secrets.

- [ ] **Step 1: Run full backend test slice**

Run:

```powershell
python -m unittest backend.tests.test_model_provider_templates backend.tests.test_model_provider_client backend.tests.test_settings_model_providers backend.tests.test_openai_compatible_provider_runtime backend.tests.test_json_file_utils
```

Expected: PASS.

- [ ] **Step 2: Run frontend test slice**

Run:

```powershell
node --test frontend\\src\\editor\\nodes\\NodeCard.structure.test.ts frontend\\src\\editor\\canvas\\EditorCanvas.structure.test.ts frontend\\src\\editor\\workspace\\EditorWorkspaceShell.structure.test.ts frontend\\src\\api\\settings.test.ts frontend\\src\\pages\\settingsPageModel.test.ts frontend\\src\\i18n\\messages.test.ts
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

Run:

```powershell
npx.cmd vite build
```

Expected: build succeeds.

- [ ] **Step 4: Restart dev environment**

Run:

```powershell
npm.cmd run dev
```

Expected: backend listens on `http://127.0.0.1:8765` and frontend listens on `http://127.0.0.1:3477`.

- [ ] **Step 5: Verify local model discovery**

Run:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8765/api/settings -Method GET | ConvertTo-Json -Depth 10
```

Expected: `model_catalog.providers` contains `local`, and `local.models` includes models from `http://127.0.0.1:8888/v1/models` when that gateway is running.

- [ ] **Step 6: Verify OpenAI with real account when key is available**

If an OpenAI key is configured through the settings page, run:

```powershell
$payload = @{
  provider_id = "openai"
  transport = "openai-compatible"
  base_url = "https://api.openai.com/v1"
  api_key = "<configured key>"
  auth_header = "Authorization"
  auth_scheme = "Bearer"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8765/api/settings/model-providers/discover -Method POST -ContentType "application/json" -Body $payload
```

Expected: returns a JSON object with a non-empty `models` array. Do not commit or print the real API key in logs.

- [ ] **Step 7: Verify non-owned providers through mock tests**

Confirm the mock tests in Task 2 covered:

- OpenRouter: `Authorization: Bearer`, `/chat/completions`, `/models`.
- Anthropic: `x-api-key`, `anthropic-version: 2023-06-01`, `/messages`, `/models`.
- Gemini: `key` query param, `/models/{model}:generateContent`, `/models`.

- [ ] **Step 8: Final commit and push**

Run:

```powershell
git status --short
git push origin main
```

Expected: `main` is pushed. If implementation commits were made in each task, the final status should be clean.

## Self-Review

Spec coverage:

- Multiple providers in settings page: Task 5 and Task 6.
- Stable `provider/model` refs: Task 3 and Task 4.
- Automatic refresh before menu/run: existing workspace behavior remains, and Task 3 makes refresh multi-provider aware.
- OpenAI/OpenRouter/Anthropic/Gemini/Local direct support: Task 2, Task 3, Task 4.
- Hermes/OpenClaw-aligned templates: Task 1 and Task 6.
- Testing limits for unavailable accounts: Task 2 and Task 7.

Placeholder scan:

- No unresolved placeholder markers are used in implementation steps.
- OAuth and cloud SDK providers are explicitly out of scope for the first phase and represented as templates/gateway guidance.

Type consistency:

- Backend `transport`, `enabled`, `auth_header`, `auth_scheme`, and `models` fields match frontend `SettingsModelProviderUpdate`.
- Runtime uses `resolved_model_ref` and `provider/model` consistently.
