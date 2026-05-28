from __future__ import annotations

import math
from typing import Any


DEFAULT_PROVIDER_RATE_MAX_WAIT_SECONDS = 10.0


def normalize_provider_rate_profile(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    profile: dict[str, Any] = {}
    requests_per_minute = _positive_int(value.get("requests_per_minute") or value.get("requestsPerMinute"))
    tokens_per_minute = _positive_int(value.get("tokens_per_minute") or value.get("tokensPerMinute"))
    concurrency = _positive_int(value.get("concurrency"))
    wait_strategy = _wait_strategy(value.get("wait_strategy") or value.get("waitStrategy"))
    raw_max_wait_seconds = value.get("max_wait_seconds")
    if raw_max_wait_seconds is None:
        raw_max_wait_seconds = value.get("maxWaitSeconds")
    max_wait_seconds = _positive_number_or_zero(raw_max_wait_seconds)
    if requests_per_minute is not None:
        profile["requests_per_minute"] = requests_per_minute
    if tokens_per_minute is not None:
        profile["tokens_per_minute"] = tokens_per_minute
    if concurrency is not None:
        profile["concurrency"] = concurrency
    if not profile:
        return {}
    if wait_strategy == "wait":
        profile["wait_strategy"] = wait_strategy
        profile["max_wait_seconds"] = (
            max_wait_seconds if max_wait_seconds is not None else DEFAULT_PROVIDER_RATE_MAX_WAIT_SECONDS
        )
    return profile


def build_provider_rate_decision(usage: Any, rate_profile: Any) -> dict[str, Any]:
    profile = normalize_provider_rate_profile(rate_profile)
    if not profile:
        return {}
    normalized_usage = usage if isinstance(usage, dict) else {}
    total_tokens = _token_count(
        normalized_usage,
        ("total_tokens", "totalTokens", "total_token_count", "totalTokenCount"),
    )
    if total_tokens is None:
        input_tokens = _token_count(
            normalized_usage,
            ("input_tokens", "prompt_tokens", "inputTokens", "promptTokens", "promptTokenCount"),
        )
        output_tokens = _token_count(
            normalized_usage,
            ("output_tokens", "completion_tokens", "outputTokens", "completionTokens", "candidatesTokenCount"),
        )
        if input_tokens is not None or output_tokens is not None:
            total_tokens = int(input_tokens or 0) + int(output_tokens or 0)

    limit_exceeded: list[str] = []
    tokens_per_minute = profile.get("tokens_per_minute")
    if total_tokens is not None and tokens_per_minute is not None and total_tokens > tokens_per_minute:
        limit_exceeded.append("tokens_per_minute")

    result: dict[str, Any] = {
        "kind": "provider_rate_decision",
        "version": 1,
        "mode": "audit_only",
        "scope": "single_call",
        "status": "over_limit" if limit_exceeded else "within_profile",
        **profile,
        "observed_requests": 1,
        "limit_exceeded": limit_exceeded,
        "reason": "single_call_tokens_exceed_profile" if limit_exceeded else "single_call_within_profile",
    }
    if total_tokens is not None:
        result["observed_total_tokens"] = total_tokens
    return result


def _token_count(usage: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = _positive_number_or_zero(usage.get(key))
        if value is not None:
            return int(value)
    return None


def _positive_int(value: Any) -> int | None:
    number = _positive_number_or_zero(value)
    if number is None or number < 1:
        return None
    return int(number)


def _wait_strategy(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return "wait" if normalized == "wait" else "block"


def _positive_number_or_zero(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number < 0:
        return None
    return number
