from __future__ import annotations

import base64
import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.storage.database import SETTINGS_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


CODEX_PROVIDER_ID = "openai-codex"
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
CODEX_AUTH_ISSUER = "https://auth.openai.com"
CODEX_DEVICE_VERIFICATION_URL = f"{CODEX_AUTH_ISSUER}/codex/device"
CODEX_DEVICE_USER_CODE_URL = f"{CODEX_AUTH_ISSUER}/api/accounts/deviceauth/usercode"
CODEX_DEVICE_TOKEN_URL = f"{CODEX_AUTH_ISSUER}/api/accounts/deviceauth/token"
CODEX_DEVICE_REDIRECT_URI = f"{CODEX_AUTH_ISSUER}/deviceauth/callback"
CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
CODEX_OAUTH_TOKEN_URL = f"{CODEX_AUTH_ISSUER}/oauth/token"
CODEX_AUTH_PATH = SETTINGS_DATA_DIR / "openai_codex_auth.json"
CODEX_ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 120
DEFAULT_CODEX_MODEL_IDS = [
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
]
CODEX_HTTPS_PROXY_ENV_KEYS = ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy")
CODEX_FALLBACK_PROXY_ENV_KEYS = ("ALL_PROXY", "all_proxy")


def _normalize_http_proxy_url(value: Any) -> str | None:
    proxy_url = str(value or "").strip()
    if not proxy_url:
        return None
    if "://" not in proxy_url:
        return f"http://{proxy_url}"
    if proxy_url.lower().startswith(("http://", "https://")):
        return proxy_url
    return None


def get_codex_http_proxy_url() -> str | None:
    for key in (*CODEX_HTTPS_PROXY_ENV_KEYS, *CODEX_FALLBACK_PROXY_ENV_KEYS):
        proxy_url = _normalize_http_proxy_url(os.environ.get(key))
        if proxy_url:
            return proxy_url
    return None


def codex_http_client_kwargs(*, timeout: float) -> dict[str, Any]:
    client_kwargs: dict[str, Any] = {"timeout": timeout, "trust_env": False}
    proxy_url = get_codex_http_proxy_url()
    if proxy_url:
        client_kwargs["proxy"] = proxy_url
    return client_kwargs


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _decode_jwt_claims(token: Any) -> dict[str, Any]:
    if not isinstance(token, str) or token.count(".") < 2:
        return {}
    try:
        payload_segment = token.split(".")[1]
        padded = payload_segment + "=" * (-len(payload_segment) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        claims = json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}
    return claims if isinstance(claims, dict) else {}


def _access_token_is_expiring(access_token: str, *, skew_seconds: int = CODEX_ACCESS_TOKEN_REFRESH_SKEW_SECONDS) -> bool:
    claims = _decode_jwt_claims(access_token)
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        return False
    return float(exp) <= time.time() + max(0, int(skew_seconds))


def load_codex_auth_state() -> dict[str, Any]:
    return _as_dict(read_json_file(CODEX_AUTH_PATH, default={}))


def save_codex_auth_state(state: dict[str, Any]) -> dict[str, Any]:
    next_state = dict(state)
    next_state["provider_id"] = CODEX_PROVIDER_ID
    next_state["base_url"] = str(next_state.get("base_url") or CODEX_BASE_URL).strip().rstrip("/")
    write_json_file(CODEX_AUTH_PATH, next_state)
    return load_codex_auth_state()


def clear_codex_auth_state() -> None:
    CODEX_AUTH_PATH.unlink(missing_ok=True)


def get_codex_auth_status() -> dict[str, Any]:
    state = load_codex_auth_state()
    tokens = _as_dict(state.get("tokens"))
    access_token = str(tokens.get("access_token") or "").strip()
    refresh_token = str(tokens.get("refresh_token") or "").strip()
    authenticated = bool(access_token) and not _access_token_is_expiring(access_token, skew_seconds=0)
    return {
        "provider_id": CODEX_PROVIDER_ID,
        "configured": bool(access_token or refresh_token),
        "authenticated": authenticated,
        "auth_mode": str(state.get("auth_mode") or "chatgpt"),
        "source": str(state.get("source") or ""),
        "base_url": str(state.get("base_url") or CODEX_BASE_URL).strip().rstrip("/"),
        "last_refresh": str(state.get("last_refresh") or ""),
    }


def _store_token_payload(token_payload: dict[str, Any], *, source: str) -> dict[str, Any]:
    access_token = str(token_payload.get("access_token") or "").strip()
    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    if not access_token:
        raise RuntimeError("Codex token response did not include an access_token.")
    existing_tokens = _as_dict(load_codex_auth_state().get("tokens"))
    if not refresh_token:
        refresh_token = str(existing_tokens.get("refresh_token") or "").strip()
    return save_codex_auth_state(
        {
            "tokens": {
                "access_token": access_token,
                "refresh_token": refresh_token,
            },
            "base_url": CODEX_BASE_URL,
            "last_refresh": utc_now_iso(),
            "auth_mode": "chatgpt",
            "source": source,
        }
    )


def start_codex_device_login() -> dict[str, Any]:
    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=15.0)) as client:
            response = client.post(
                CODEX_DEVICE_USER_CODE_URL,
                json={"client_id": CODEX_OAUTH_CLIENT_ID},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        raise RuntimeError(f"Codex login start failed: HTTP {exc.response.status_code} {detail[:600]}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Codex login start failed: {exc}") from exc

    user_code = str(payload.get("user_code") or "").strip()
    device_auth_id = str(payload.get("device_auth_id") or "").strip()
    if not user_code or not device_auth_id:
        raise RuntimeError("Codex login start returned an incomplete device-code payload.")

    return {
        "verification_url": CODEX_DEVICE_VERIFICATION_URL,
        "user_code": user_code,
        "device_auth_id": device_auth_id,
        "expires_in": _normalize_int(payload.get("expires_in"), 900),
        "interval": max(1, _normalize_int(payload.get("interval"), 5)),
    }


def _exchange_codex_authorization_code(*, authorization_code: str, code_verifier: str) -> dict[str, Any]:
    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=15.0)) as client:
            response = client.post(
                CODEX_OAUTH_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": authorization_code,
                    "redirect_uri": CODEX_DEVICE_REDIRECT_URI,
                    "client_id": CODEX_OAUTH_CLIENT_ID,
                    "code_verifier": code_verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        raise RuntimeError(f"Codex token exchange failed: HTTP {exc.response.status_code} {detail[:600]}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Codex token exchange failed: {exc}") from exc
    return _as_dict(payload)


def poll_codex_device_login(*, device_auth_id: str, user_code: str) -> dict[str, Any]:
    trimmed_device_auth_id = str(device_auth_id or "").strip()
    trimmed_user_code = str(user_code or "").strip()
    if not trimmed_device_auth_id or not trimmed_user_code:
        raise RuntimeError("Codex login polling requires device_auth_id and user_code.")

    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=15.0)) as client:
            response = client.post(
                CODEX_DEVICE_TOKEN_URL,
                json={"device_auth_id": trimmed_device_auth_id, "user_code": trimmed_user_code},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Codex login polling failed: {exc}") from exc

    if response.status_code in (403, 404):
        return {**get_codex_auth_status(), "authenticated": False, "status": "pending"}
    if response.status_code >= 400:
        raise RuntimeError(f"Codex login polling failed: HTTP {response.status_code} {response.text[:600]}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(f"Codex login polling failed: invalid JSON: {exc}") from exc

    authorization_code = str(payload.get("authorization_code") or "").strip()
    code_verifier = str(payload.get("code_verifier") or "").strip()
    if not authorization_code or not code_verifier:
        raise RuntimeError("Codex login polling returned an incomplete authorization payload.")

    token_payload = _exchange_codex_authorization_code(
        authorization_code=authorization_code,
        code_verifier=code_verifier,
    )
    _store_token_payload(token_payload, source="device-code")
    return {**get_codex_auth_status(), "status": "authenticated"}


def refresh_codex_access_token() -> str:
    state = load_codex_auth_state()
    tokens = _as_dict(state.get("tokens"))
    refresh_token = str(tokens.get("refresh_token") or "").strip()
    if not refresh_token:
        raise RuntimeError("Codex auth is missing a refresh token. Please sign in again.")

    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=20.0)) as client:
            response = client.post(
                CODEX_OAUTH_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": CODEX_OAUTH_CLIENT_ID,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        raise RuntimeError(f"Codex token refresh failed: HTTP {exc.response.status_code} {detail[:600]}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Codex token refresh failed: {exc}") from exc

    next_state = _store_token_payload(_as_dict(payload), source=str(state.get("source") or "refresh"))
    access_token = str(_as_dict(next_state.get("tokens")).get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Codex token refresh did not return an access token.")
    return access_token


def resolve_codex_access_token(*, refresh_if_expiring: bool = True) -> str:
    state = load_codex_auth_state()
    tokens = _as_dict(state.get("tokens"))
    access_token = str(tokens.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("OpenAI Codex is not signed in. Please sign in from Settings.")
    if refresh_if_expiring and _access_token_is_expiring(access_token):
        return refresh_codex_access_token()
    return access_token
