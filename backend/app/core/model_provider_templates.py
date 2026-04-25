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
