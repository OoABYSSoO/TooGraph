from __future__ import annotations

from typing import Any, Callable

from app.core.model_provider_templates import (
    TRANSPORT_ANTHROPIC_MESSAGES,
    TRANSPORT_CODEX_RESPONSES,
    TRANSPORT_GEMINI_GENERATE_CONTENT,
    TRANSPORT_OPENAI_COMPATIBLE,
    normalize_transport,
)
from app.tools.model_provider_http import (
    anthropic_headers,
    build_auth_headers,
    dedupe_strings,
    normalize_base_url,
    request_json,
)
from app.tools.openai_codex_client import (
    DEFAULT_CODEX_MODEL_IDS,
    codex_http_client_kwargs,
    refresh_codex_access_token,
    resolve_codex_access_token,
)


def parse_data_model_ids(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")
    return dedupe_strings(
        [
            str(item.get("id") or item.get("name") or "").strip()
            for item in data
            if isinstance(item, dict) and str(item.get("id") or item.get("name") or "").strip()
        ]
    )


def parse_gemini_model_ids(payload: dict[str, Any]) -> list[str]:
    models = payload.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")

    model_ids: list[str] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        methods = item.get("supportedGenerationMethods")
        if isinstance(methods, list) and "generateContent" not in methods:
            continue
        name = str(item.get("name") or item.get("baseModelId") or "").strip()
        if not name:
            continue
        model_ids.append(name.removeprefix("models/"))
    return dedupe_strings(model_ids)


def parse_codex_model_ids(payload: dict[str, Any]) -> list[str]:
    models = payload.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")

    sortable: list[tuple[int, str]] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        if item.get("supported_in_api") is False:
            continue
        visibility = item.get("visibility")
        if isinstance(visibility, str) and visibility.strip().lower() in {"hide", "hidden"}:
            continue
        slug = str(item.get("slug") or item.get("id") or item.get("name") or "").strip()
        if not slug:
            continue
        priority = item.get("priority")
        rank = int(priority) if isinstance(priority, (int, float)) else 10_000
        sortable.append((rank, slug))

    sortable.sort(key=lambda entry: (entry[0], entry[1]))
    return dedupe_strings([slug for _rank, slug in sortable])


def discover_provider_models(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str = "",
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    timeout_sec: float = 8.0,
    resolve_codex_access_token_fn: Callable[[], str] | None = None,
    refresh_codex_access_token_fn: Callable[[], str] | None = None,
) -> list[str]:
    _ = provider_id
    normalized_transport = normalize_transport(transport)
    normalized_base_url = normalize_base_url(base_url)

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE:
        payload = request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            error_label="Model discovery failed",
        )
        return parse_data_model_ids(payload)

    if normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES:
        payload = request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            headers=anthropic_headers(api_key),
            error_label="Model discovery failed",
        )
        return parse_data_model_ids(payload)

    if normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT:
        payload = request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            params={"key": str(api_key or "").strip()} if str(api_key or "").strip() else None,
            error_label="Model discovery failed",
        )
        return parse_gemini_model_ids(payload)

    if normalized_transport == TRANSPORT_CODEX_RESPONSES:
        resolve_token = resolve_codex_access_token_fn or resolve_codex_access_token
        refresh_token = refresh_codex_access_token_fn or refresh_codex_access_token
        access_token = resolve_token()
        try:
            payload = request_json(
                method="GET",
                url=f"{normalized_base_url}/models",
                timeout_sec=timeout_sec,
                headers=build_auth_headers(api_key=access_token),
                params={"client_version": "1.0.0"},
                error_label="Model discovery failed",
                client_kwargs=codex_http_client_kwargs(timeout=timeout_sec),
            )
        except RuntimeError as exc:
            if "HTTP 401" in str(exc):
                access_token = refresh_token()
                payload = request_json(
                    method="GET",
                    url=f"{normalized_base_url}/models",
                    timeout_sec=timeout_sec,
                    headers=build_auth_headers(api_key=access_token),
                    params={"client_version": "1.0.0"},
                    error_label="Model discovery failed",
                    client_kwargs=codex_http_client_kwargs(timeout=timeout_sec),
                )
            else:
                return list(DEFAULT_CODEX_MODEL_IDS)
        model_ids = parse_codex_model_ids(payload)
        return model_ids or list(DEFAULT_CODEX_MODEL_IDS)

    raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")  # pragma: no cover
