from __future__ import annotations

import json
import time
from typing import Any, Callable

import httpx

from app.core.storage.model_log_store import append_model_request_log


ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_REQUEST_TIMEOUT_SEC = 180.0


def append_model_request_log_safely(
    *,
    provider_id: str,
    transport: str,
    model: str,
    path: str,
    request_raw: dict[str, Any],
    response_raw: dict[str, Any],
    started_at: float,
    status_code: int | None = 200,
    error: str | None = None,
    log_writer: Callable[..., Any] | None = None,
) -> None:
    try:
        writer = log_writer or append_model_request_log
        writer(
            provider_id=provider_id,
            transport=transport,
            model=model,
            path=path,
            request_raw=request_raw,
            response_raw=response_raw,
            duration_ms=int((time.monotonic() - started_at) * 1000),
            status_code=status_code,
            error=error,
        )
    except Exception:
        return


def normalize_base_url(base_url: str) -> str:
    normalized = str(base_url or "").strip().rstrip("/")
    if not normalized.startswith(("http://", "https://")):
        raise RuntimeError("Base URL must start with http:// or https://.")
    return normalized


def dedupe_strings(values: list[str]) -> list[str]:
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


def build_auth_headers(
    *,
    api_key: str,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    trimmed_key = str(api_key or "").strip()
    trimmed_header = str(auth_header or "").strip()
    if trimmed_key and trimmed_header:
        trimmed_scheme = str(auth_scheme or "").strip()
        headers[trimmed_header] = f"{trimmed_scheme} {trimmed_key}".strip() if trimmed_scheme else trimmed_key
    return headers


def anthropic_headers(api_key: str) -> dict[str, str]:
    headers = build_auth_headers(api_key=api_key, auth_header="x-api-key", auth_scheme="")
    headers["anthropic-version"] = ANTHROPIC_VERSION
    return headers


def request_json(
    *,
    method: str,
    url: str,
    timeout_sec: float,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    json_payload: dict[str, Any] | None = None,
    error_label: str,
    client_kwargs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        with httpx.Client(**(client_kwargs or {"timeout": timeout_sec, "trust_env": False})) as client:
            if method == "GET":
                response = client.get(url, headers=headers, params=params)
            elif method == "POST":
                response = client.post(url, headers=headers, params=params, json=json_payload)
            else:  # pragma: no cover - internal guard
                raise RuntimeError(f"Unsupported HTTP method: {method}")
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:  # pragma: no cover - network path
        detail = exc.response.text.strip()
        raise RuntimeError(f"{error_label}: HTTP {exc.response.status_code} {detail[:600]}") from exc
    except httpx.HTTPError as exc:  # pragma: no cover - network path
        raise RuntimeError(f"{error_label}: {exc}") from exc
    except ValueError as exc:  # pragma: no cover - network path
        raise RuntimeError(f"{error_label}: invalid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"{error_label}: unexpected payload shape.")
    return payload


def format_request_error(error_label: str, exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        detail = exc.response.text.strip()
        return f"{error_label}: HTTP {exc.response.status_code} {detail[:600]}"
    if isinstance(exc, httpx.HTTPError):
        return f"{error_label}: {exc}"
    if isinstance(exc, ValueError):
        return f"{error_label}: invalid JSON: {exc}"
    return f"{error_label}: {exc}"


def parse_json_or_stream_text(stream_text: str, parse_stream: Callable[[str], dict[str, Any]]) -> dict[str, Any]:
    try:
        payload = json.loads(stream_text)
    except ValueError:
        return parse_stream(stream_text)
    if isinstance(payload, dict):
        return payload
    raise ValueError("unexpected JSON payload shape")


def coerce_stream_line(raw_line: str | bytes) -> str:
    if isinstance(raw_line, bytes):
        return raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
    return str(raw_line).rstrip("\r\n")


def parse_sse_payload(event_name: str, data_lines: list[str]) -> dict[str, Any] | None:
    data = "\n".join(data_lines).strip()
    if not data or data == "[DONE]":
        return None
    try:
        payload = json.loads(data)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    if event_name and "_event" not in payload:
        payload["_event"] = event_name
    return payload


def read_streaming_response_text(
    response: Any,
    *,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> str:
    text_lines: list[str] = []
    event_name = ""
    data_lines: list[str] = []

    def flush_event() -> None:
        nonlocal event_name, data_lines
        if not data_lines:
            event_name = ""
            return
        payload = parse_sse_payload(event_name, data_lines)
        event_name = ""
        data_lines = []
        if payload is not None and on_event is not None:
            on_event(payload)

    for raw_line in response.iter_lines():
        line = coerce_stream_line(raw_line)
        text_lines.append(line)
        if not line:
            flush_event()
            continue
        if line.startswith("event:"):
            event_name = line[len("event:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].lstrip())
    flush_event()
    return "\n".join(text_lines)


def post_streaming_json_with_fallback(
    *,
    stream_url: str,
    fallback_url: str | None = None,
    timeout_sec: float,
    headers: dict[str, str] | None = None,
    stream_params: dict[str, str] | None = None,
    fallback_params: dict[str, str] | None = None,
    stream_payload: dict[str, Any],
    fallback_payload: dict[str, Any],
    parse_stream: Callable[[str], dict[str, Any]],
    error_label: str,
    on_delta: Callable[[str], None] | None = None,
    extract_stream_delta: Callable[[dict[str, Any]], str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any], str | None, bool]:
    try:
        with httpx.Client(timeout=timeout_sec, trust_env=False) as client:
            stream_headers = dict(headers or {})
            stream_headers.setdefault("Accept", "text/event-stream")

            def handle_stream_event(event_payload: dict[str, Any]) -> None:
                if on_delta is None or extract_stream_delta is None:
                    return
                delta = extract_stream_delta(event_payload)
                if delta:
                    on_delta(delta)

            with client.stream(
                "POST",
                stream_url,
                headers=stream_headers or None,
                params=stream_params,
                json=stream_payload,
            ) as response:
                if getattr(response, "status_code", 0) >= 400 and hasattr(response, "read"):
                    response.read()
                response.raise_for_status()
                payload = parse_json_or_stream_text(
                    read_streaming_response_text(response, on_event=handle_stream_event),
                    parse_stream,
                )
    except Exception as exc:
        stream_error = format_request_error(error_label, exc)
    else:
        if not isinstance(payload, dict):
            raise RuntimeError(f"{error_label}: unexpected payload shape.")
        return payload, stream_payload, None, True

    fallback_response = request_json(
        method="POST",
        url=fallback_url or stream_url,
        timeout_sec=timeout_sec,
        headers=headers,
        params=fallback_params,
        json_payload=fallback_payload,
        error_label=error_label,
    )
    fallback_response["_stream_fallback"] = {"error": stream_error}
    return fallback_response, fallback_payload, stream_error, False
