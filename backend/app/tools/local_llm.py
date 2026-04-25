from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.storage.settings_store import load_app_settings


def _env_first(*keys: str, default: str) -> str:
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return default


def _parse_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


LOCAL_LLM_BASE_URL = _env_first(
    "LOCAL_BASE_URL",
    "OPENAI_BASE_URL",
    "LOCAL_LLM_BASE_URL",
    default="http://127.0.0.1:8888/v1",
).rstrip("/")
LOCAL_LLM_API_KEY = _env_first("LOCAL_API_KEY", "OPENAI_API_KEY", "LITELLM_MASTER_KEY", "LOCAL_LLM_API_KEY", default="sk-local")
LOCAL_LLM_REQUEST_TIMEOUT_SEC = _parse_float_env("LOCAL_LLM_REQUEST_TIMEOUT_SEC", 180.0)
ROOT_DIR = Path(__file__).resolve().parents[3]
LOCAL_ONBOARDING_GUIDE_PATH = ROOT_DIR / "knowledge" / "GraphiteUI-official" / "getting-started.md"
DEFAULT_AGENT_TEMPERATURE = 0.2
DEFAULT_AGENT_THINKING_ENABLED = True
DEFAULT_LOCAL_MODEL_ALIAS = "lm-local"
LOCAL_RUNTIME_CONFIG_CACHE_TTL_SEC = 5.0
_LOCAL_RUNTIME_CONFIG_CACHE: tuple[float, dict[str, Any] | None] | None = None


def _get_saved_local_provider_config() -> dict[str, Any]:
    saved_settings = load_app_settings()
    providers = saved_settings.get("model_providers")
    if not isinstance(providers, dict):
        return {}
    provider = providers.get("local")
    return provider if isinstance(provider, dict) else {}


def get_local_llm_base_url() -> str:
    provider = _get_saved_local_provider_config()
    saved_base_url = str(provider.get("base_url") or "").strip().rstrip("/")
    return saved_base_url or LOCAL_LLM_BASE_URL


def get_local_llm_api_key() -> str:
    provider = _get_saved_local_provider_config()
    saved_api_key = str(provider.get("api_key") or "").strip()
    return saved_api_key or LOCAL_LLM_API_KEY


def get_saved_local_provider_model_names() -> list[str]:
    provider = _get_saved_local_provider_config()
    models = provider.get("models")
    if not isinstance(models, list):
        return []
    names: list[str] = []
    for model in models:
        if not isinstance(model, dict):
            continue
        name = str(model.get("model") or model.get("id") or "").strip()
        if name:
            names.append(name)
    return _dedupe_strings(names)


def has_local_llm_api_key_configured() -> bool:
    return bool(get_local_llm_api_key().strip())


def _get_gateway_base_url() -> str:
    trimmed = get_local_llm_base_url().rstrip("/")
    return trimmed[:-3] if trimmed.endswith("/v1") else trimmed


def _dedupe_strings(values: list[str]) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for raw in values:
        item = str(raw or "").strip()
        if not item:
            continue
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        items.append(item)
    return items


def get_local_gateway_runtime_config(*, force_refresh: bool = False) -> dict[str, Any] | None:
    global _LOCAL_RUNTIME_CONFIG_CACHE

    now = time.monotonic()
    if (
        not force_refresh
        and _LOCAL_RUNTIME_CONFIG_CACHE is not None
        and now - _LOCAL_RUNTIME_CONFIG_CACHE[0] < LOCAL_RUNTIME_CONFIG_CACHE_TTL_SEC
    ):
        return _LOCAL_RUNTIME_CONFIG_CACHE[1]

    runtime_config: dict[str, Any] | None = None
    try:
        with httpx.Client(timeout=3.0, trust_env=False) as client:
            response = client.get(f"{_get_gateway_base_url()}/runtime-config")
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict):
                runtime_config = payload
    except Exception:
        runtime_config = None

    _LOCAL_RUNTIME_CONFIG_CACHE = (now, runtime_config)
    return runtime_config


def get_local_route_model_names() -> list[str]:
    runtime_config = get_local_gateway_runtime_config()
    llama_config = runtime_config.get("llama") if isinstance(runtime_config, dict) else None
    aliases = llama_config.get("local_route_model_names") if isinstance(llama_config, dict) else None
    if isinstance(aliases, list):
        deduped = _dedupe_strings([str(item) for item in aliases])
        if deduped:
            return deduped

    configured_model = _env_first(
        "LOCAL_TEXT_MODEL",
        "TEXT_MODEL",
        "LOCAL_MODEL_NAME",
        "UPSTREAM_MODEL_NAME",
        "LOCAL_LLM_MODEL",
        default="",
    ).strip()
    if configured_model:
        return [configured_model]
    saved_models = get_saved_local_provider_model_names()
    if saved_models:
        return saved_models
    return [DEFAULT_LOCAL_MODEL_ALIAS]


def _extract_model_name_from_ref(model_ref: str | None) -> str:
    trimmed = str(model_ref or "").strip()
    if not trimmed:
        return ""
    return trimmed.split("/")[-1].strip()


def get_default_text_model() -> str:
    saved_settings = load_app_settings()
    saved_model_name = _extract_model_name_from_ref(saved_settings.get("text_model_ref"))
    if saved_model_name:
        return saved_model_name
    aliases = get_local_route_model_names()
    return aliases[0] if aliases else DEFAULT_LOCAL_MODEL_ALIAS


def get_default_agent_temperature() -> float:
    saved_settings = load_app_settings()
    runtime_defaults = saved_settings.get("agent_runtime_defaults")
    if isinstance(runtime_defaults, dict):
        saved_temperature = runtime_defaults.get("temperature")
        if isinstance(saved_temperature, (int, float)):
            return max(0.0, min(float(saved_temperature), 2.0))
    return DEFAULT_AGENT_TEMPERATURE


def get_default_agent_thinking_enabled() -> bool:
    saved_settings = load_app_settings()
    runtime_defaults = saved_settings.get("agent_runtime_defaults")
    if isinstance(runtime_defaults, dict) and isinstance(runtime_defaults.get("thinking_enabled"), bool):
        return bool(runtime_defaults["thinking_enabled"])
    return DEFAULT_AGENT_THINKING_ENABLED


def _normalize_message_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [_normalize_message_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        for key in ("text", "content", "reasoning_content", "reasoning"):
            candidate = value.get(key)
            if candidate:
                return _normalize_message_text(candidate)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _extract_chat_completion_text(response_payload: dict[str, Any]) -> tuple[str, str]:
    choices = response_payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        if isinstance(message, dict):
            content = _normalize_message_text(message.get("content")).strip()
            reasoning = _normalize_message_text(
                message.get("reasoning_content") or message.get("reasoning")
            ).strip()
            return content, reasoning

    return (
        _normalize_message_text(response_payload.get("content")).strip(),
        _normalize_message_text(response_payload.get("reasoning")).strip(),
    )


def _request_local_chat_completion(request_payload: dict[str, Any]) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {get_local_llm_api_key()}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=LOCAL_LLM_REQUEST_TIMEOUT_SEC, trust_env=False) as client:
            response = client.post(f"{get_local_llm_base_url()}/chat/completions", headers=headers, json=request_payload)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:  # pragma: no cover - network path
        detail = exc.response.text.strip()
        raise RuntimeError(
            f"Local LLM request failed: HTTP {exc.response.status_code} {detail[:600]}"
        ) from exc
    except httpx.HTTPError as exc:  # pragma: no cover - network path
        raise RuntimeError(f"Local LLM request failed: {exc}") from exc
    except ValueError as exc:  # pragma: no cover - network path
        raise RuntimeError(f"Local LLM returned invalid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Local LLM returned an unexpected payload shape.")
    return payload


def _chat_with_local_model_with_meta(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    provider_id: str = "local",
    temperature: float = DEFAULT_AGENT_TEMPERATURE,
    max_tokens: int | None = None,
    thinking_enabled: bool = False,
) -> tuple[str, dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "model": model or get_default_text_model(),
        "temperature": temperature,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if max_tokens is not None:
        request_payload["max_tokens"] = max_tokens

    warnings: list[str] = []
    used_thinking = bool(thinking_enabled and provider_id == "local")
    if used_thinking:
        request_payload["return_progress"] = True
        request_payload["reasoning_format"] = "auto"
        request_payload["timings_per_token"] = True
    elif thinking_enabled:
        warnings.append(
            f"Thinking mode was requested for provider '{provider_id}', but GraphiteUI currently only maps provider-specific thinking fields for the local gateway."
        )

    response_payload = _request_local_chat_completion(request_payload)
    content, reasoning = _extract_chat_completion_text(response_payload)

    if not content and max_tokens is not None:
        retry_payload = dict(request_payload)
        retry_payload.pop("max_tokens", None)
        response_payload = _request_local_chat_completion(retry_payload)
        content, reasoning = _extract_chat_completion_text(response_payload)
        warnings.append(
            "The provider exhausted max_tokens before returning final content. Retried once without a max_tokens limit."
        )

    if not content and used_thinking:
        retry_payload = dict(request_payload)
        retry_payload.pop("return_progress", None)
        retry_payload.pop("reasoning_format", None)
        retry_payload.pop("timings_per_token", None)
        response_payload = _request_local_chat_completion(retry_payload)
        content, reasoning = _extract_chat_completion_text(response_payload)
        used_thinking = False
        warnings.append(
            "Thinking mode was requested, but the local gateway returned reasoning without final content. Retried without local thinking fields."
        )

    if used_thinking and not reasoning:
        warnings.append(
            "Thinking mode was requested and the local gateway accepted the request, but this response did not include any reasoning text."
        )

    if not content:
        raise RuntimeError("Local LLM returned an empty response.")

    return content, {
        "base_url": get_local_llm_base_url(),
        "model": response_payload.get("model") or request_payload["model"],
        "provider_id": provider_id,
        "temperature": temperature,
        "thinking_enabled": used_thinking,
        "reasoning_format": "auto" if used_thinking and provider_id == "local" else None,
        "reasoning": reasoning,
        "usage": response_payload.get("usage"),
        "timings": response_payload.get("timings"),
        "response_id": response_payload.get("id"),
        "warnings": warnings,
    }


def _chat_with_local_model(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = DEFAULT_AGENT_TEMPERATURE,
    max_tokens: int | None = None,
    provider_id: str = "local",
    thinking_enabled: bool = False,
) -> str:
    content, _meta = _chat_with_local_model_with_meta(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=model,
        provider_id=provider_id,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_enabled=thinking_enabled,
    )
    return content


def generate_hello_greeting(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    name = str(state.get("name") or params.get("name") or "World").strip() or "World"
    system_prompt = (
        "You are a product onboarding assistant for GraphiteUI. "
        "Return only a short usage introduction in Chinese for a new user. "
        "Keep it within 3 sentences, mention that the user can inspect nodes, edit configuration, save the graph, "
        "and run the flow. Personalize it with the provided name when natural."
    )
    user_prompt = f"User name: {name}"
    model_name = str(params.get("model") or get_default_text_model())
    try:
        greeting = _chat_with_local_model(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model_name,
            temperature=float(params.get("temperature", DEFAULT_AGENT_TEMPERATURE)),
            max_tokens=int(params.get("max_tokens", 120)),
        )
        llm_response: dict[str, Any] = {
            "base_url": get_local_llm_base_url(),
            "model": model_name,
        }
    except RuntimeError as exc:  # pragma: no cover - fallback path depends on local model availability
        greeting = (
            f"{name}，欢迎使用 GraphiteUI。你可以先点选节点查看配置，再尝试修改参数、保存图，"
            "最后运行整条流程观察输出结果。"
        )
        llm_response = {
            "base_url": get_local_llm_base_url(),
            "model": model_name,
            "fallback": True,
            "reason": str(exc),
        }
    return {
        "name": name,
        "greeting": greeting,
        "final_result": greeting,
        "llm_response": llm_response,
    }


def discover_openai_compatible_models(*, base_url: str, api_key: str = "") -> list[str]:
    normalized_base_url = str(base_url or "").strip().rstrip("/")
    if not normalized_base_url.startswith(("http://", "https://")):
        raise RuntimeError("Base URL must start with http:// or https://.")

    headers = {"Content-Type": "application/json"}
    if str(api_key or "").strip():
        headers["Authorization"] = f"Bearer {str(api_key).strip()}"

    try:
        with httpx.Client(timeout=8.0, trust_env=False) as client:
            response = client.get(f"{normalized_base_url}/models", headers=headers)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        raise RuntimeError(f"Model discovery failed: HTTP {exc.response.status_code} {detail[:300]}") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Model discovery failed: {exc}") from exc
    except ValueError as exc:
        raise RuntimeError(f"Model discovery returned invalid JSON: {exc}") from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")

    model_ids = [
        str(item.get("id") or "").strip()
        for item in data
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    ]
    return _dedupe_strings(model_ids)


def output_usage_introduction(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    _ = state
    _ = params
    if not LOCAL_ONBOARDING_GUIDE_PATH.exists():
        raise RuntimeError(f"Local onboarding guide file not found: {LOCAL_ONBOARDING_GUIDE_PATH}")
    content = LOCAL_ONBOARDING_GUIDE_PATH.read_text(encoding="utf-8").strip()
    if not content:
        raise RuntimeError(f"Local onboarding guide file is empty: {LOCAL_ONBOARDING_GUIDE_PATH}")
    return {
        "greeting": content,
        "final_result": content,
        "source_path": str(LOCAL_ONBOARDING_GUIDE_PATH),
    }


def append_usage_introduction(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    _ = state
    params = params or {}
    greeting = str(params.get("greeting") or "").strip()
    if not greeting:
        raise RuntimeError("append_usage_introduction requires a non-empty greeting input.")
    if not LOCAL_ONBOARDING_GUIDE_PATH.exists():
        raise RuntimeError(f"Local onboarding guide file not found: {LOCAL_ONBOARDING_GUIDE_PATH}")
    guide = LOCAL_ONBOARDING_GUIDE_PATH.read_text(encoding="utf-8").strip()
    if not guide:
        raise RuntimeError(f"Local onboarding guide file is empty: {LOCAL_ONBOARDING_GUIDE_PATH}")
    combined = f"{greeting}\n\n{guide}"
    return {
        "greeting": combined,
        "final_result": combined,
        "source_path": str(LOCAL_ONBOARDING_GUIDE_PATH),
    }
