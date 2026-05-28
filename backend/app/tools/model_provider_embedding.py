from __future__ import annotations

import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_OPENAI_COMPATIBLE
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC, build_auth_headers, normalize_request_timeout_seconds, request_json


def extract_openai_embedding_vector(response_payload: dict[str, Any]) -> list[float]:
    data = response_payload.get("data")
    if not isinstance(data, list):
        raise RuntimeError("OpenAI-compatible embedding response did not include data.")
    for item in data:
        if not isinstance(item, dict):
            continue
        embedding = item.get("embedding")
        if not isinstance(embedding, list) or not embedding:
            continue
        return [float(value) for value in embedding]
    raise RuntimeError("OpenAI-compatible embedding response did not include an embedding vector.")


def embed_openai_compatible(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    text: str,
    auth_header: str,
    auth_scheme: str,
    append_request_log: Callable[..., None],
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SEC,
) -> tuple[list[float], dict[str, Any]]:
    timeout_sec = normalize_request_timeout_seconds(request_timeout_seconds)
    path = "/embeddings"
    request_payload = {"model": model, "input": text}
    started_at = time.monotonic()
    try:
        response_payload = request_json(
            method="POST",
            url=f"{base_url}{path}",
            timeout_sec=timeout_sec,
            headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            json_payload=request_payload,
            error_label=f"{provider_id} embedding request failed",
        )
    except Exception as exc:
        append_request_log(
            provider_id=provider_id,
            transport=TRANSPORT_OPENAI_COMPATIBLE,
            model=model,
            path=path,
            request_raw=request_payload,
            response_raw={"error": str(exc)},
            started_at=started_at,
            status_code=None,
            error=str(exc),
        )
        raise

    append_request_log(
        provider_id=provider_id,
        transport=TRANSPORT_OPENAI_COMPATIBLE,
        model=model,
        path=path,
        request_raw=request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    vector = extract_openai_embedding_vector(response_payload)
    return vector, {
        "provider_id": provider_id,
        "transport": TRANSPORT_OPENAI_COMPATIBLE,
        "model": response_payload.get("model") or model,
        "response_id": response_payload.get("id"),
        "usage": response_payload.get("usage"),
        "dimensions": len(vector),
        "request_timeout_seconds": timeout_sec,
    }
