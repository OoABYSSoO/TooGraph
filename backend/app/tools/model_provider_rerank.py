from __future__ import annotations

import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_OPENAI_COMPATIBLE
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC, build_auth_headers, request_json


def extract_openai_rerank_results(response_payload: dict[str, Any], documents: list[str]) -> list[dict[str, Any]]:
    raw_results = response_payload.get("results")
    if raw_results is None:
        raw_results = response_payload.get("data")
    if not isinstance(raw_results, list):
        raise RuntimeError("OpenAI-compatible rerank response did not include results.")

    ranked: list[dict[str, Any]] = []
    for fallback_index, item in enumerate(raw_results):
        if not isinstance(item, dict):
            continue
        raw_index = item.get("index", item.get("document_index", fallback_index))
        try:
            index = int(raw_index)
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= len(documents):
            continue
        score = _score_from_item(item)
        ranked.append(
            {
                "index": index,
                "score": score,
                "document": _document_text(item.get("document"), fallback=documents[index]),
                "raw_score": score,
            }
        )
    if not ranked:
        raise RuntimeError("OpenAI-compatible rerank response did not include valid ranked documents.")
    return ranked


def rerank_openai_compatible(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    query: str,
    documents: list[str],
    top_n: int,
    auth_header: str,
    auth_scheme: str,
    append_request_log: Callable[..., None],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    path = "/rerank"
    request_payload = {
        "model": model,
        "query": query,
        "documents": documents,
        "top_n": top_n,
        "return_documents": False,
    }
    started_at = time.monotonic()
    try:
        response_payload = request_json(
            method="POST",
            url=f"{base_url}{path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            json_payload=request_payload,
            error_label=f"{provider_id} rerank request failed",
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
    results = extract_openai_rerank_results(response_payload, documents)
    return results, {
        "provider_id": provider_id,
        "transport": TRANSPORT_OPENAI_COMPATIBLE,
        "model": response_payload.get("model") or model,
        "response_id": response_payload.get("id"),
        "usage": response_payload.get("usage"),
        "result_count": len(results),
    }


def _score_from_item(item: dict[str, Any]) -> float:
    for key in ("relevance_score", "score", "rank_score"):
        try:
            return float(item.get(key))
        except (TypeError, ValueError):
            continue
    return 0.0


def _document_text(value: Any, *, fallback: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("text", "content"):
            text = str(value.get(key) or "").strip()
            if text:
                return text
    return fallback
