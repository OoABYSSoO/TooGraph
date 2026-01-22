from __future__ import annotations

import os
from pathlib import Path
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
ROOT_DIR = Path(__file__).resolve().parents[3]
LOCAL_USAGE_GUIDE_PATH = ROOT_DIR / "使用介绍.md"
DEFAULT_AGENT_TEMPERATURE = 0.2
DEFAULT_AGENT_THINKING_ENABLED = False


def get_default_text_model() -> str:
    return LOCAL_LLM_MODEL


def get_default_agent_temperature() -> float:
    return DEFAULT_AGENT_TEMPERATURE


def get_default_agent_thinking_enabled() -> bool:
    return DEFAULT_AGENT_THINKING_ENABLED


def _chat_with_local_model_with_meta(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = DEFAULT_AGENT_TEMPERATURE,
    max_tokens: int | None = None,
    reasoning_effort: str | None = None,
) -> tuple[str, dict[str, Any]]:
    client = OpenAI(
        base_url=LOCAL_LLM_BASE_URL,
        api_key=LOCAL_LLM_API_KEY,
        http_client=httpx.Client(trust_env=False),
    )
    request_payload: dict[str, Any] = {
        "model": model or LOCAL_LLM_MODEL,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if max_tokens is not None:
        request_payload["max_tokens"] = max_tokens
    if reasoning_effort:
        request_payload["reasoning_effort"] = reasoning_effort

    warnings: list[str] = []
    used_reasoning_effort = reasoning_effort

    try:
        response = client.chat.completions.create(**request_payload)
    except Exception as exc:  # pragma: no cover - network path
        if reasoning_effort:
            fallback_payload = dict(request_payload)
            fallback_payload.pop("reasoning_effort", None)
            try:
                response = client.chat.completions.create(**fallback_payload)
                warnings.append(
                    "Thinking mode was requested, but the current model backend rejected reasoning_effort. Retried without provider-level thinking."
                )
                used_reasoning_effort = None
            except Exception as fallback_exc:  # pragma: no cover - network path
                raise RuntimeError(f"Local LLM request failed: {fallback_exc}") from fallback_exc
        else:
            raise RuntimeError(f"Local LLM request failed: {exc}") from exc

    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError("Local LLM returned an empty response.")
    return content, {
        "base_url": LOCAL_LLM_BASE_URL,
        "model": request_payload["model"],
        "temperature": temperature,
        "reasoning_effort": used_reasoning_effort,
        "warnings": warnings,
    }


def _chat_with_local_model(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = DEFAULT_AGENT_TEMPERATURE,
    max_tokens: int | None = None,
) -> str:
    content, _meta = _chat_with_local_model_with_meta(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
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
    model_name = str(params.get("model") or LOCAL_LLM_MODEL)
    try:
        greeting = _chat_with_local_model(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model_name,
            temperature=float(params.get("temperature", DEFAULT_AGENT_TEMPERATURE)),
            max_tokens=int(params.get("max_tokens", 120)),
        )
        llm_response: dict[str, Any] = {
            "base_url": LOCAL_LLM_BASE_URL,
            "model": model_name,
        }
    except RuntimeError as exc:  # pragma: no cover - fallback path depends on local model availability
        greeting = (
            f"{name}，欢迎使用 GraphiteUI。你可以先点选节点查看配置，再尝试修改参数、保存图，"
            "最后运行整条流程观察输出结果。"
        )
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


def output_usage_introduction(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    _ = state
    _ = params
    if not LOCAL_USAGE_GUIDE_PATH.exists():
        raise RuntimeError(f"Local usage guide file not found: {LOCAL_USAGE_GUIDE_PATH}")
    content = LOCAL_USAGE_GUIDE_PATH.read_text(encoding="utf-8").strip()
    if not content:
        raise RuntimeError(f"Local usage guide file is empty: {LOCAL_USAGE_GUIDE_PATH}")
    return {
        "greeting": content,
        "final_result": content,
        "source_path": str(LOCAL_USAGE_GUIDE_PATH),
    }


def append_usage_introduction(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    _ = state
    params = params or {}
    greeting = str(params.get("greeting") or "").strip()
    if not greeting:
        raise RuntimeError("append_usage_introduction requires a non-empty greeting input.")
    if not LOCAL_USAGE_GUIDE_PATH.exists():
        raise RuntimeError(f"Local usage guide file not found: {LOCAL_USAGE_GUIDE_PATH}")
    guide = LOCAL_USAGE_GUIDE_PATH.read_text(encoding="utf-8").strip()
    if not guide:
        raise RuntimeError(f"Local usage guide file is empty: {LOCAL_USAGE_GUIDE_PATH}")
    combined = f"{greeting}\n\n{guide}"
    return {
        "greeting": combined,
        "final_result": combined,
        "source_path": str(LOCAL_USAGE_GUIDE_PATH),
    }
