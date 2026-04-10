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
            temperature=float(params.get("temperature", 0.2)),
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
