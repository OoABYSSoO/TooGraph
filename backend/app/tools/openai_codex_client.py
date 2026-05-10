from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

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
CODEX_OAUTH_AUTHORIZE_URL = f"{CODEX_AUTH_ISSUER}/oauth/authorize"
CODEX_OAUTH_TOKEN_URL = f"{CODEX_AUTH_ISSUER}/oauth/token"
CODEX_BROWSER_REDIRECT_URI = "http://localhost:1455/auth/callback"
CODEX_BROWSER_CALLBACK_HOST = "127.0.0.1"
CODEX_BROWSER_CALLBACK_PORT = 1455
CODEX_BROWSER_CALLBACK_PATH = "/auth/callback"
CODEX_BROWSER_SCOPE = "openid profile email offline_access"
CODEX_BROWSER_LOGIN_TTL_SECONDS = 600
CODEX_AUTH_PATH = SETTINGS_DATA_DIR / "openai_codex_auth.json"
CODEX_CLI_AUTH_PATH = Path.home() / ".codex" / "auth.json"
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
CODEX_JWT_AUTH_CLAIM_PATH = "https://api.openai.com/auth"
_browser_login_lock = threading.Lock()
_browser_login_sessions: dict[str, dict[str, Any]] = {}
_browser_callback_server: ThreadingHTTPServer | None = None
_URL_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


CODEX_BROWSER_SUCCESS_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication successful</title>
</head>
<body>
  <p>Authentication successful. You can close this window and return to TooGraph.</p>
</body>
</html>"""


CODEX_BROWSER_FAILURE_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication failed</title>
</head>
<body>
  <p>Authentication failed. Return to TooGraph and try a fallback sign-in option.</p>
</body>
</html>"""


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


def _url_token_encode(raw: bytes) -> str:
    chars: list[str] = []
    for index in range(0, len(raw), 3):
        chunk = raw[index : index + 3]
        first = chunk[0]
        second = chunk[1] if len(chunk) > 1 else 0
        third = chunk[2] if len(chunk) > 2 else 0
        packed = (first << 16) | (second << 8) | third
        chars.append(_URL_TOKEN_ALPHABET[(packed >> 18) & 0x3F])
        chars.append(_URL_TOKEN_ALPHABET[(packed >> 12) & 0x3F])
        if len(chunk) > 1:
            chars.append(_URL_TOKEN_ALPHABET[(packed >> 6) & 0x3F])
        if len(chunk) > 2:
            chars.append(_URL_TOKEN_ALPHABET[packed & 0x3F])
    return "".join(chars)


def _url_token_decode(value: str) -> bytes:
    clean = value.strip().rstrip("=")
    decoded = bytearray()
    for index in range(0, len(clean), 4):
        chunk = clean[index : index + 4]
        if len(chunk) == 1:
            raise ValueError("Invalid URL token segment.")
        padded = chunk.ljust(4, "A")
        packed = 0
        for char in padded:
            token_index = _URL_TOKEN_ALPHABET.find(char)
            if token_index < 0:
                raise ValueError("Invalid URL token character.")
            packed = (packed << 6) | token_index
        decoded.append((packed >> 16) & 0xFF)
        if len(chunk) > 2:
            decoded.append((packed >> 8) & 0xFF)
        if len(chunk) > 3:
            decoded.append(packed & 0xFF)
    return bytes(decoded)


def _generate_pkce_pair() -> tuple[str, str]:
    verifier = _url_token_encode(secrets.token_bytes(32))
    challenge = _url_token_encode(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge


def _decode_jwt_claims(token: Any) -> dict[str, Any]:
    if not isinstance(token, str) or token.count(".") < 2:
        return {}
    try:
        payload_segment = token.split(".")[1]
        decoded = _url_token_decode(payload_segment)
        claims = json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}
    return claims if isinstance(claims, dict) else {}


def _account_id_from_access_token(access_token: str) -> str:
    claims = _decode_jwt_claims(access_token)
    auth_claim = _as_dict(claims.get(CODEX_JWT_AUTH_CLAIM_PATH))
    account_id = str(auth_claim.get("chatgpt_account_id") or "").strip()
    return account_id


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
    try:
        CODEX_AUTH_PATH.chmod(0o600)
    except OSError:
        pass
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
    account_id = str(token_payload.get("account_id") or existing_tokens.get("account_id") or _account_id_from_access_token(access_token)).strip()
    expires_in = token_payload.get("expires_in")
    expires_at = None
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        expires_at = int(time.time() + float(expires_in))
    tokens = {
        "access_token": access_token,
        "refresh_token": refresh_token,
    }
    if account_id:
        tokens["account_id"] = account_id
    return save_codex_auth_state(
        {
            "tokens": tokens,
            "base_url": CODEX_BASE_URL,
            "last_refresh": utc_now_iso(),
            "auth_mode": "chatgpt",
            "source": source,
            **({"expires_at": expires_at} if expires_at is not None else {}),
        }
    )


def _build_codex_browser_authorization_url(*, state: str, code_challenge: str) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": CODEX_OAUTH_CLIENT_ID,
            "redirect_uri": CODEX_BROWSER_REDIRECT_URI,
            "scope": CODEX_BROWSER_SCOPE,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "originator": "toograph",
        }
    )
    return f"{CODEX_OAUTH_AUTHORIZE_URL}?{query}"


def _prune_expired_browser_sessions(now: float | None = None) -> None:
    timestamp = time.time() if now is None else now
    expired_states = [
        state
        for state, session in _browser_login_sessions.items()
        if float(session.get("expires_at") or 0) <= timestamp and session.get("status") == "pending"
    ]
    for state in expired_states:
        _browser_login_sessions[state]["status"] = "expired"
        _browser_login_sessions[state]["error"] = "Browser login expired."


class _CodexBrowserCallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802 - http.server uses do_GET
        parsed = urlparse(self.path)
        if parsed.path != CODEX_BROWSER_CALLBACK_PATH:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        params = parse_qs(parsed.query)
        state = str((params.get("state") or [""])[0]).strip()
        code = str((params.get("code") or [""])[0]).strip()
        error = str((params.get("error") or [""])[0]).strip()
        if error:
            _mark_codex_browser_login_failed(state=state, error=error)
            self._write_html(400, CODEX_BROWSER_FAILURE_HTML)
            return
        if not state or not code:
            _mark_codex_browser_login_failed(state=state, error="Missing authorization code.")
            self._write_html(400, CODEX_BROWSER_FAILURE_HTML)
            return

        try:
            complete_codex_browser_login_callback(state=state, code=code)
        except RuntimeError as exc:
            _mark_codex_browser_login_failed(state=state, error=str(exc))
            self._write_html(400, CODEX_BROWSER_FAILURE_HTML)
            return

        self._write_html(200, CODEX_BROWSER_SUCCESS_HTML)

    def _write_html(self, status_code: int, html: str) -> None:
        payload = html.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def _start_codex_browser_callback_server() -> None:
    global _browser_callback_server
    with _browser_login_lock:
        if _browser_callback_server is not None:
            return
        try:
            server = ThreadingHTTPServer(
                (CODEX_BROWSER_CALLBACK_HOST, CODEX_BROWSER_CALLBACK_PORT),
                _CodexBrowserCallbackHandler,
            )
        except OSError as exc:
            raise RuntimeError(
                "Codex browser login needs http://localhost:1455/auth/callback. "
                "Close the process using port 1455 or use a fallback sign-in option."
            ) from exc
        thread = threading.Thread(target=server.serve_forever, name="codex-browser-oauth", daemon=True)
        thread.start()
        _browser_callback_server = server


def _mark_codex_browser_login_failed(*, state: str, error: str) -> None:
    if not state:
        return
    with _browser_login_lock:
        session = _browser_login_sessions.get(state)
        if not session:
            return
        session["status"] = "failed"
        session["error"] = error


def start_codex_browser_login() -> dict[str, Any]:
    code_verifier, code_challenge = _generate_pkce_pair()
    state = secrets.token_hex(16)
    created_at = time.time()
    expires_at = created_at + CODEX_BROWSER_LOGIN_TTL_SECONDS
    authorization_url = _build_codex_browser_authorization_url(state=state, code_challenge=code_challenge)
    _start_codex_browser_callback_server()

    with _browser_login_lock:
        _prune_expired_browser_sessions(now=created_at)
        _browser_login_sessions[state] = {
            "state": state,
            "code_verifier": code_verifier,
            "authorization_url": authorization_url,
            "callback_url": CODEX_BROWSER_REDIRECT_URI,
            "created_at": created_at,
            "expires_at": expires_at,
            "status": "pending",
            "error": "",
        }

    return {
        "authorization_url": authorization_url,
        "callback_url": CODEX_BROWSER_REDIRECT_URI,
        "state": state,
        "expires_in": CODEX_BROWSER_LOGIN_TTL_SECONDS,
        "interval": 2,
    }


def poll_codex_browser_login(*, state: str) -> dict[str, Any]:
    trimmed_state = str(state or "").strip()
    if not trimmed_state:
        raise RuntimeError("Codex browser login polling requires state.")
    with _browser_login_lock:
        _prune_expired_browser_sessions()
        session = dict(_browser_login_sessions.get(trimmed_state) or {})
    if not session:
        return {**get_codex_auth_status(), "authenticated": False, "status": "missing"}

    status = str(session.get("status") or "pending")
    if status == "authenticated":
        return {**get_codex_auth_status(), "status": "authenticated"}
    if status == "failed":
        return {**get_codex_auth_status(), "authenticated": False, "status": "failed", "error": str(session.get("error") or "")}
    if status == "expired":
        return {**get_codex_auth_status(), "authenticated": False, "status": "expired"}
    return {**get_codex_auth_status(), "authenticated": False, "status": "pending"}


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


def _exchange_codex_authorization_code(
    *,
    authorization_code: str,
    code_verifier: str,
    redirect_uri: str = CODEX_DEVICE_REDIRECT_URI,
) -> dict[str, Any]:
    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=15.0)) as client:
            response = client.post(
                CODEX_OAUTH_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": authorization_code,
                    "redirect_uri": redirect_uri,
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


def complete_codex_browser_login_callback(*, state: str, code: str) -> dict[str, Any]:
    trimmed_state = str(state or "").strip()
    authorization_code = str(code or "").strip()
    if not trimmed_state or not authorization_code:
        raise RuntimeError("Codex browser login callback requires state and code.")

    with _browser_login_lock:
        _prune_expired_browser_sessions()
        session = _browser_login_sessions.get(trimmed_state)
        if not session:
            raise RuntimeError("Codex browser login session was not found.")
        if session.get("status") == "expired":
            raise RuntimeError("Codex browser login session expired.")
        if session.get("status") == "failed":
            raise RuntimeError(str(session.get("error") or "Codex browser login failed."))
        code_verifier = str(session.get("code_verifier") or "").strip()

    if not code_verifier:
        raise RuntimeError("Codex browser login session is missing its PKCE verifier.")

    token_payload = _exchange_codex_authorization_code(
        authorization_code=authorization_code,
        code_verifier=code_verifier,
        redirect_uri=CODEX_BROWSER_REDIRECT_URI,
    )
    _store_token_payload(token_payload, source="browser-oauth")
    with _browser_login_lock:
        if trimmed_state in _browser_login_sessions:
            _browser_login_sessions[trimmed_state]["status"] = "authenticated"
            _browser_login_sessions[trimmed_state]["error"] = ""
    return {**get_codex_auth_status(), "status": "authenticated"}


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


def import_codex_cli_auth_state(*, auth_path: Path | None = None) -> dict[str, Any]:
    source_path = auth_path or CODEX_CLI_AUTH_PATH
    state = _as_dict(read_json_file(source_path, default={}))
    tokens = _as_dict(state.get("tokens"))
    access_token = str(tokens.get("access_token") or "").strip()
    refresh_token = str(tokens.get("refresh_token") or "").strip()
    account_id = str(tokens.get("account_id") or "").strip()
    if not access_token:
        raise RuntimeError("No usable Codex CLI ChatGPT login was found on this computer.")

    _store_token_payload(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "account_id": account_id,
        },
        source="codex-cli",
    )

    status = get_codex_auth_status()
    if not status.get("authenticated") and refresh_token:
        try:
            refresh_codex_access_token()
            status = get_codex_auth_status()
        except RuntimeError:
            status = get_codex_auth_status()
    return {**status, "status": "authenticated" if status.get("authenticated") else "configured"}


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
