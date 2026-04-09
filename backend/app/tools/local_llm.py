from __future__ import annotations

import os
from typing import Any

import httpx
from openai import OpenAI


def _env_first(*keys: str, default: str) -> str:
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return default


LOCAL_LLM_BASE_URL = _env_first("LOCAL_BASE_URL", "OPENAI_BASE_URL", "LOCAL_LLM_BASE_URL", default="http://127.0.0.1:8888/v1").rstrip("/")
LOCAL_LLM_MODEL = _env_first("LOCAL_TEXT_MODEL", "TEXT_MODEL", "LOCAL_MODEL_NAME", "UPSTREAM_MODEL_NAME", "LOCAL_LLM_MODEL", default="qwen-local")
LOCAL_LLM_API_KEY = _env_first("LOCAL_API_KEY", "OPENAI_API_KEY", "LITELLM_MASTER_KEY", "LOCAL_LLM_API_KEY", default="sk-local")


def _chat_with_local_model(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 80,
) -> str:
    client = OpenAI(
        base_url=LOCAL_LLM_BASE_URL,
        api_key=LOCAL_LLM_API_KEY,
        http_client=httpx.Client(trust_env=False),
    )
    try:
        response = client.chat.completions.create(
            model=model or LOCAL_LLM_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:  # pragma: no cover - network path
        raise RuntimeError(f"Local LLM request failed: {exc}") from exc
    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError("Local LLM returned an empty response.")
    return content


def generate_hello_greeting(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    name = str(state.get("name") or params.get("name") or "World").strip() or "World"
    system_prompt = "You are a precise assistant. Return only a short greeting in the format: Hello, <name>."
    user_prompt = f"Name: {name}"
    model_name = str(params.get("model") or LOCAL_LLM_MODEL)
    try:
        greeting = _chat_with_local_model(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model_name,
            temperature=float(params.get("temperature", 0.2)),
            max_tokens=int(params.get("max_tokens", 40)),
        )
        llm_response: dict[str, Any] = {
            "base_url": LOCAL_LLM_BASE_URL,
            "model": model_name,
        }
    except RuntimeError as exc:  # pragma: no cover - fallback path depends on local model availability
        greeting = f"Hello, {name}."
        llm_response = {
            "base_url": LOCAL_LLM_BASE_URL,
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
