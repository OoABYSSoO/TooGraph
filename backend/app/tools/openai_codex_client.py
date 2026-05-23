from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time
from html import escape
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
CODEX_BROWSER_SESSION_PATH = SETTINGS_DATA_DIR / "openai_codex_browser_sessions.json"
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


CODEX_BROWSER_CALLBACK_MASCOT_SVG = """<span class="buddy-mascot __MASCOT_MOOD_CLASS__ buddy-mascot--motion-idle buddy-mascot--facing-front" data-buddy-eye-follow aria-hidden="true">
    <svg class="buddy-mascot__svg" xmlns="http://www.w3.org/2000/svg" viewBox="-320 -180 640 560" focusable="false">
      <defs>
        <radialGradient id="buddyMascotSparkleGold" cx="0" cy="-136" r="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f2c968"/>
          <stop offset="62%" stop-color="#dfad50"/>
          <stop offset="100%" stop-color="#c89136"/>
        </radialGradient>
        <linearGradient id="buddyMascotEyeGold" x1="-104" y1="32" x2="104" y2="136" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#efbd61"/>
          <stop offset="52%" stop-color="#d8a650"/>
          <stop offset="100%" stop-color="#cf963d"/>
        </linearGradient>
        <radialGradient id="buddyMascotBlack" cx="-44" cy="-132" r="360" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#282928"/>
          <stop offset="44%" stop-color="#222222"/>
          <stop offset="100%" stop-color="#171818"/>
        </radialGradient>
        <filter id="buddyMascotSoftness" x="-340" y="-210" width="680" height="640" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="12" stdDeviation="13" flood-color="#3d2b18" flood-opacity="0.16"/>
        </filter>
      </defs>
      <g class="buddy-mascot__stage" filter="url(#buddyMascotSoftness)">
        <g class="buddy-mascot__tail-root">
          <g class="buddy-mascot__tail buddy-mascot__tail-rig">
            <path class="buddy-mascot__tail-pose" d="M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62">
              <animate
                attributeName="d"
                begin="0s"
                dur="6800ms"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1"
                keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                values="M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62;M0 176 C72 234 98 142 158 154 C222 166 230 96 260 80 C274 64 286 54 292 58;M0 176 C56 202 112 184 160 160 C206 138 236 112 260 84 C272 70 280 66 286 68;M0 176 C70 148 124 122 174 104 C218 86 252 70 286 58 C288 58 290 58 292 58;M0 176 C34 214 124 190 154 164 C196 130 244 122 260 86 C270 72 272 58 278 54;M0 176 C70 148 124 122 174 104 C218 86 252 70 286 58 C288 58 290 58 292 58;M0 176 C56 202 112 184 160 160 C206 138 236 112 260 84 C272 70 280 66 286 68;M0 176 C72 234 98 142 158 154 C222 166 230 96 260 80 C274 64 286 54 292 58;M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62"
              />
            </path>
          </g>
        </g>
        <g class="buddy-mascot__body-turn">
          <g class="buddy-mascot__body">
            <path class="buddy-mascot__left-ear" fill="url(#buddyMascotBlack)" d="M-146-143 C-114-132-82-101-55-61 C-60-24-84 25-124 63 C-158 95-190 53-168-4 C-174-52-164-106-146-143Z"/>
            <path class="buddy-mascot__right-ear" fill="url(#buddyMascotBlack)" d="M146-143 C114-132 82-101 55-61 C60-24 84 25 124 63 C158 95 190 53 168-4 C174-52 164-106 146-143Z"/>
            <path class="buddy-mascot__head" fill="url(#buddyMascotBlack)" d="M-55-61 C-25-66 25-66 55-61 C90-61 130-43 168-4 C196 22 214 66 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 66-196 22-168-4 C-130-43-90-61-55-61Z"/>
            <g class="buddy-mascot__look-eye buddy-mascot__look-eye--left">
              <ellipse class="buddy-mascot__resting-eye buddy-mascot__resting-eye--left" cx="-80" cy="82" rx="24" ry="52" fill="url(#buddyMascotEyeGold)"/>
              <path class="buddy-mascot__dizzy-eye buddy-mascot__dizzy-eye--left" d="M-80 82 C-70 70 -50 74 -50 90 C-50 112 -76 124 -96 108 C-122 88 -110 48 -76 44 C-34 40 -12 88 -42 122"/>
            </g>
            <g class="buddy-mascot__look-eye buddy-mascot__look-eye--right">
              <ellipse class="buddy-mascot__resting-eye buddy-mascot__resting-eye--right" cx="80" cy="82" rx="24" ry="52" fill="url(#buddyMascotEyeGold)"/>
              <path class="buddy-mascot__dizzy-eye buddy-mascot__dizzy-eye--right" d="M80 82 C90 70 110 74 110 90 C110 112 84 124 64 108 C38 88 50 48 84 44 C126 40 148 88 118 122"/>
            </g>
          </g>
        </g>
        <g class="buddy-mascot__sparkle-wrap">
          <path class="buddy-mascot__sparkle" fill="url(#buddyMascotSparkleGold)" d="M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z"/>
        </g>
      </g>
    </svg>
  </span>"""


CODEX_BROWSER_CALLBACK_HTML_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>__TITLE__</title>
  <style>
    :root {
      --toograph-font-ui: "Aptos", "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      --toograph-font-display: "Aptos Display", "Aptos", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif;
      --toograph-text-strong: #20170f;
      --toograph-text: rgba(60, 41, 20, 0.86);
      --toograph-text-muted: rgba(60, 41, 20, 0.66);
      --toograph-accent: #9a3412;
      --toograph-border: rgba(154, 52, 18, 0.14);
      --toograph-success: #047857;
      --toograph-danger: #b91c1c;
      --toograph-page-bg:
        radial-gradient(circle at 18% -10%, rgba(255, 255, 255, 0.88), transparent 28rem),
        radial-gradient(circle at 84% 8%, rgba(232, 190, 128, 0.2), transparent 30rem),
        linear-gradient(180deg, rgba(255, 251, 244, 0.98) 0%, rgba(242, 231, 211, 0.96) 100%);
      --toograph-canvas-dots:
        radial-gradient(circle at 1px 1px, rgba(217, 119, 6, 0.12) 1px, transparent 0) 0 0 / 28px 28px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 32px;
      background: var(--toograph-canvas-dots), var(--toograph-page-bg);
      color: var(--toograph-text);
      font-family: var(--toograph-font-ui);
      font-size: 16px;
      font-synthesis-weight: none;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }

    .toograph-auth-return {
      width: min(920px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(240px, 0.72fr);
      gap: 28px;
      align-items: center;
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 28px;
      padding: clamp(24px, 4vw, 44px);
      background:
        linear-gradient(115deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 255, 255, 0.42) 18%, rgba(255, 255, 255, 0) 44%),
        radial-gradient(90% 130% at 18% 0%, rgba(255, 255, 255, 0.36), transparent 48%),
        linear-gradient(180deg, rgba(255, 253, 249, 0.92), rgba(255, 248, 240, 0.86));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.88),
        0 24px 70px rgba(61, 43, 24, 0.12),
        0 8px 22px rgba(61, 43, 24, 0.06);
      overflow: hidden;
    }

    .toograph-auth-return__content {
      min-width: 0;
    }

    .toograph-auth-return__brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 32px;
      color: var(--toograph-accent);
      font-weight: 820;
    }

    .toograph-auth-return__brand-mark {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: linear-gradient(135deg, #e2b65f, #9a3412);
      box-shadow: 0 0 0 5px rgba(226, 182, 95, 0.14);
    }

    .toograph-auth-return__status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 28px;
      min-height: 34px;
      border: 1px solid rgba(5, 150, 105, 0.16);
      border-radius: 999px;
      padding: 7px 12px;
      background: rgba(236, 253, 245, 0.9);
      color: var(--toograph-success);
      font-weight: 760;
    }

    .toograph-auth-return--failure .toograph-auth-return__status {
      border-color: rgba(220, 38, 38, 0.16);
      background: rgba(254, 242, 242, 0.92);
      color: var(--toograph-danger);
    }

    .toograph-auth-return__status-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 14%, transparent);
    }

    h1 {
      margin: 18px 0 12px;
      color: var(--toograph-text-strong);
      font-family: var(--toograph-font-display);
      font-size: clamp(2rem, 5vw, 3.6rem);
      line-height: 1.04;
      letter-spacing: 0;
    }

    p {
      max-width: 58ch;
      margin: 0;
      color: var(--toograph-text-muted);
      line-height: 1.68;
    }

    .toograph-auth-return__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .toograph-auth-return__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      border: 1px solid rgba(154, 52, 18, 0.16);
      border-radius: 14px;
      padding: 11px 16px;
      color: var(--toograph-accent);
      background: rgba(255, 255, 255, 0.72);
      box-shadow: 0 10px 24px rgba(61, 43, 24, 0.07);
      cursor: pointer;
      font: inherit;
      font-weight: 760;
      text-decoration: none;
      transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        box-shadow 160ms ease;
    }

    .toograph-auth-return__button:hover,
    .toograph-auth-return__button:focus-visible {
      border-color: rgba(154, 52, 18, 0.32);
      background: rgba(255, 248, 240, 0.96);
      box-shadow: 0 14px 32px rgba(61, 43, 24, 0.1);
      transform: translateY(-1px);
    }

    .toograph-auth-return__button:focus-visible {
      outline: 3px solid rgba(217, 119, 6, 0.26);
      outline-offset: 3px;
    }

    .toograph-auth-return__button--primary {
      border-color: rgba(154, 52, 18, 0.28);
      color: #fff8f0;
      background: linear-gradient(135deg, #9a3412, #7c2d12);
    }

    .toograph-auth-return__button--primary:hover,
    .toograph-auth-return__button--primary:focus-visible {
      border-color: rgba(124, 45, 18, 0.44);
      background: linear-gradient(135deg, #a53b15, #7c2d12);
    }

    .toograph-auth-return__detail {
      margin-top: 16px;
      border: 1px solid rgba(220, 38, 38, 0.14);
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(254, 242, 242, 0.72);
      color: rgba(127, 29, 29, 0.82);
      font-size: 0.94rem;
      line-height: 1.58;
    }

    .toograph-auth-return__footnote {
      margin-top: 18px;
      color: rgba(60, 41, 20, 0.58);
      font-size: 0.92rem;
    }

    .toograph-auth-return__visual {
      display: grid;
      place-items: center;
      min-height: 320px;
    }

    .toograph-auth-return__mascot {
      width: min(310px, 82%);
      aspect-ratio: 8 / 7;
      display: grid;
      place-items: center;
      animation: mascot-arrive 420ms ease-out both;
    }

    .buddy-mascot {
      display: block;
      width: 100%;
      height: 100%;
      --buddy-mascot-left-eye-facing-x: 0px;
      --buddy-mascot-right-eye-facing-x: 0px;
      --buddy-mascot-eye-facing-y: 0px;
      --buddy-mascot-left-ear-x: 0px;
      --buddy-mascot-left-ear-y: 0px;
      --buddy-mascot-left-ear-scale: 1;
      --buddy-mascot-left-ear-rotate: 0deg;
      --buddy-mascot-right-ear-x: 0px;
      --buddy-mascot-right-ear-y: 0px;
      --buddy-mascot-right-ear-scale: 1;
      --buddy-mascot-right-ear-rotate: 0deg;
      --buddy-mascot-tail-root-x: 0px;
      pointer-events: none;
    }

    .buddy-mascot__svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }

    .buddy-mascot__body,
    .buddy-mascot__body-turn,
    .buddy-mascot__tail-root,
    .buddy-mascot__tail,
    .buddy-mascot__tail-pose,
    .buddy-mascot__sparkle-wrap,
    .buddy-mascot__sparkle,
    .buddy-mascot__left-ear,
    .buddy-mascot__right-ear,
    .buddy-mascot__look-eye,
    .buddy-mascot__resting-eye,
    .buddy-mascot__dizzy-eye {
      transform-box: fill-box;
      transform-origin: center;
    }

    .buddy-mascot__body {
      transform-origin: 50% 70%;
    }

    .buddy-mascot__body-turn {
      transform-origin: 50% 72%;
    }

    .buddy-mascot__tail {
      transform-origin: 50% 78%;
    }

    .buddy-mascot__tail-root {
      transform: translateX(var(--buddy-mascot-tail-root-x));
    }

    .buddy-mascot__tail-pose {
      fill: none;
      stroke: url(#buddyMascotBlack);
      stroke-width: 38;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 1;
      transform-origin: 50% 78%;
    }

    .buddy-mascot__sparkle-wrap,
    .buddy-mascot__sparkle {
      transform-origin: 50% 50%;
    }

    .buddy-mascot__left-ear {
      transform-origin: 78% 82%;
      transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
        scale(var(--buddy-mascot-left-ear-scale))
        rotate(var(--buddy-mascot-left-ear-rotate));
    }

    .buddy-mascot__right-ear {
      transform-origin: 22% 82%;
      transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
        scale(var(--buddy-mascot-right-ear-scale))
        rotate(var(--buddy-mascot-right-ear-rotate));
    }

    .buddy-mascot__look-eye--left {
      transform: translate(
        calc(var(--buddy-mascot-look-x, 0px) + var(--buddy-mascot-left-eye-facing-x, 0px)),
        calc(var(--buddy-mascot-look-y, 0px) + var(--buddy-mascot-eye-facing-y, 0px))
      );
    }

    .buddy-mascot__look-eye--right {
      transform: translate(
        calc(var(--buddy-mascot-look-x, 0px) + var(--buddy-mascot-right-eye-facing-x, 0px)),
        calc(var(--buddy-mascot-look-y, 0px) + var(--buddy-mascot-eye-facing-y, 0px))
      );
    }

    .buddy-mascot__resting-eye {
      opacity: 1;
      transform-origin: 50% 50%;
    }

    .buddy-mascot__dizzy-eye {
      opacity: 0;
      fill: none;
      stroke: url(#buddyMascotEyeGold);
      stroke-width: 10;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: opacity 120ms ease;
    }

    .buddy-mascot__dizzy-eye--left {
      transform-box: view-box;
      transform-origin: -80px 82px;
    }

    .buddy-mascot__dizzy-eye--right {
      transform-box: view-box;
      transform-origin: 80px 82px;
    }

    .buddy-mascot--idle .buddy-mascot__tail {
      animation: buddy-mascot-tail-sway 1.8s ease-in-out infinite;
    }

    .buddy-mascot--idle .buddy-mascot__sparkle-wrap {
      animation: buddy-mascot-star-sway 3.6s ease-in-out infinite;
    }

    .buddy-mascot--idle .buddy-mascot__left-ear {
      animation: buddy-mascot-ear-idle-left 4.2s ease-in-out infinite;
    }

    .buddy-mascot--idle .buddy-mascot__right-ear {
      animation: buddy-mascot-ear-idle-right 4.2s ease-in-out infinite;
      animation-delay: 160ms;
    }

    .buddy-mascot--idle .buddy-mascot__resting-eye {
      animation: buddy-mascot-blink 7.2s ease-in-out infinite;
    }

    .buddy-mascot--error {
      filter: saturate(0.85);
    }

    .buddy-mascot--error .buddy-mascot__left-ear {
      animation: buddy-mascot-error-ear-left 760ms ease-out both;
    }

    .buddy-mascot--error .buddy-mascot__right-ear {
      animation: buddy-mascot-error-ear-right 760ms ease-out both;
    }

    .buddy-mascot--error .buddy-mascot__look-eye--left {
      transform: translate(-4px, 10px);
    }

    .buddy-mascot--error .buddy-mascot__look-eye--right {
      transform: translate(4px, 10px);
    }

    .buddy-mascot--error .buddy-mascot__resting-eye {
      display: none;
      opacity: 0;
    }

    .buddy-mascot--error .buddy-mascot__dizzy-eye {
      opacity: 1;
      animation: buddy-mascot-error-eye-spin 920ms linear infinite;
    }

    .buddy-mascot--error .buddy-mascot__dizzy-eye--right {
      animation-delay: -230ms;
    }

    @keyframes mascot-arrive {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes buddy-mascot-tail-sway {
      0%,
      100% {
        transform: rotate(-2deg);
      }
      50% {
        transform: rotate(7deg);
      }
    }

    @keyframes buddy-mascot-star-sway {
      0%,
      100% {
        transform: translateY(0) rotate(-4deg);
      }
      50% {
        transform: translateY(-3px) rotate(4deg);
      }
    }

    @keyframes buddy-mascot-ear-idle-left {
      0%,
      82%,
      100% {
        transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
          scale(var(--buddy-mascot-left-ear-scale))
          rotate(calc(var(--buddy-mascot-left-ear-rotate) + 0deg));
      }
      88% {
        transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
          scale(var(--buddy-mascot-left-ear-scale))
          rotate(calc(var(--buddy-mascot-left-ear-rotate) + -8deg));
      }
      94% {
        transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
          scale(var(--buddy-mascot-left-ear-scale))
          rotate(calc(var(--buddy-mascot-left-ear-rotate) + 4deg));
      }
    }

    @keyframes buddy-mascot-ear-idle-right {
      0%,
      82%,
      100% {
        transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
          scale(var(--buddy-mascot-right-ear-scale))
          rotate(calc(var(--buddy-mascot-right-ear-rotate) + 0deg));
      }
      88% {
        transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
          scale(var(--buddy-mascot-right-ear-scale))
          rotate(calc(var(--buddy-mascot-right-ear-rotate) + 8deg));
      }
      94% {
        transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
          scale(var(--buddy-mascot-right-ear-scale))
          rotate(calc(var(--buddy-mascot-right-ear-rotate) + -4deg));
      }
    }

    @keyframes buddy-mascot-blink {
      0%,
      90%,
      94%,
      100% {
        transform: scaleY(1);
      }
      92% {
        transform: scaleY(0.08);
      }
    }

    @keyframes buddy-mascot-error-ear-left {
      0% {
        transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
          scale(var(--buddy-mascot-left-ear-scale))
          rotate(var(--buddy-mascot-left-ear-rotate));
      }
      100% {
        transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 16px))
          scale(0.94)
          rotate(calc(var(--buddy-mascot-left-ear-rotate) + -24deg));
      }
    }

    @keyframes buddy-mascot-error-ear-right {
      0% {
        transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
          scale(var(--buddy-mascot-right-ear-scale))
          rotate(var(--buddy-mascot-right-ear-rotate));
      }
      100% {
        transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 16px))
          scale(0.94)
          rotate(calc(var(--buddy-mascot-right-ear-rotate) + 24deg));
      }
    }

    @keyframes buddy-mascot-error-eye-spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 720px) {
      body {
        padding: 18px;
      }

      .toograph-auth-return {
        grid-template-columns: 1fr;
        gap: 18px;
        border-radius: 22px;
      }

      .toograph-auth-return__visual {
        order: -1;
        min-height: 220px;
      }

      .toograph-auth-return__actions {
        display: grid;
      }

      .toograph-auth-return__button {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
      }
    }
  </style>
</head>
<body>
  <main class="toograph-auth-return __STATE_CLASS__" aria-labelledby="auth-return-title">
    <section class="toograph-auth-return__content">
      <div class="toograph-auth-return__brand" aria-label="TooGraph">
        <span class="toograph-auth-return__brand-mark" aria-hidden="true"></span>
        <span>TooGraph</span>
      </div>
      <div class="toograph-auth-return__status" role="status">
        <span class="toograph-auth-return__status-dot" aria-hidden="true"></span>
        <span>__STATUS_LABEL__</span>
      </div>
      <h1 id="auth-return-title">__HEADING__</h1>
      <p>__BODY__</p>
      __DETAIL__
      <div class="toograph-auth-return__actions">
        <button class="toograph-auth-return__button toograph-auth-return__button--primary" type="button" onclick="window.close()">__PRIMARY_ACTION__</button>
      </div>
      <p class="toograph-auth-return__footnote">__FOOTNOTE__</p>
    </section>
    <aside class="toograph-auth-return__visual" aria-hidden="true">
      <div class="toograph-auth-return__mascot">
        __MASCOT__
      </div>
    </aside>
  </main>
  <script>
    (() => {
      function initBuddyMascotEyeFollow() {
        const mascot = document.querySelector("[data-buddy-eye-follow]");
        if (!mascot) {
          return;
        }

        const maxX = 18;
        const maxY = 12;
        let frameId = 0;
        let nextX = 0;
        let nextY = 0;

        function clamp(value) {
          return Math.max(-1, Math.min(1, value));
        }

        function applyLook(x, y) {
          mascot.style.setProperty("--buddy-mascot-look-x", `${x.toFixed(2)}px`);
          mascot.style.setProperty("--buddy-mascot-look-y", `${y.toFixed(2)}px`);
        }

        function scheduleLook(x, y) {
          nextX = x;
          nextY = y;
          if (frameId) {
            return;
          }
          frameId = window.requestAnimationFrame(() => {
            frameId = 0;
            applyLook(nextX, nextY);
          });
        }

        function resetLook() {
          scheduleLook(0, 0);
        }

        function updateLook(clientX, clientY) {
          const rect = mascot.getBoundingClientRect();
          if (!rect.width || !rect.height) {
            resetLook();
            return;
          }
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const x = clamp((clientX - centerX) / Math.max(rect.width * 0.38, 1)) * maxX;
          const y = clamp((clientY - centerY) / Math.max(rect.height * 0.34, 1)) * maxY;
          scheduleLook(x, y);
        }

        const handleMove = (event) => updateLook(event.clientX, event.clientY);
        const moveOptions = { passive: true };
        window.addEventListener(
          "pointermove",
          handleMove,
          moveOptions,
        );
        window.addEventListener("mousemove", handleMove, moveOptions);
        window.addEventListener("pointerleave", resetLook);
        window.addEventListener("mouseleave", resetLook);
        window.addEventListener("blur", resetLook);
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBuddyMascotEyeFollow, { once: true });
      } else {
        initBuddyMascotEyeFollow();
      }
    })();
  </script>
</body>
</html>"""


def _build_codex_browser_callback_html(
    *,
    title: str,
    state_class: str,
    status_label: str,
    heading: str,
    body: str,
    primary_action: str,
    footnote: str,
    mascot_mood_class: str,
    detail: str = "",
) -> str:
    detail_markup = ""
    if detail:
        detail_markup = f'<p class="toograph-auth-return__detail">{escape(detail)}</p>'
    return (
        CODEX_BROWSER_CALLBACK_HTML_TEMPLATE.replace("__TITLE__", title)
        .replace("__STATE_CLASS__", state_class)
        .replace("__STATUS_LABEL__", status_label)
        .replace("__HEADING__", heading)
        .replace("__BODY__", body)
        .replace("__DETAIL__", detail_markup)
        .replace("__PRIMARY_ACTION__", primary_action)
        .replace("__FOOTNOTE__", footnote)
        .replace("__MASCOT__", CODEX_BROWSER_CALLBACK_MASCOT_SVG.replace("__MASCOT_MOOD_CLASS__", mascot_mood_class))
    )


def _codex_browser_failure_detail(error: str) -> str:
    trimmed_error = str(error or "").strip()
    normalized_error = trimmed_error.lower()
    if "session was not found" in normalized_error:
        return "\u767b\u5f55\u4f1a\u8bdd\u5df2\u5931\u6548\u3002\u8bf7\u56de\u5230 TooGraph \u6a21\u578b\u7ba1\u7406\u9875\u91cd\u65b0\u53d1\u8d77\u767b\u5f55\u3002"
    if "session expired" in normalized_error or "browser login expired" in normalized_error:
        return "\u767b\u5f55\u4f1a\u8bdd\u5df2\u8fc7\u671f\u3002\u8bf7\u56de\u5230 TooGraph \u6a21\u578b\u7ba1\u7406\u9875\u91cd\u65b0\u53d1\u8d77\u767b\u5f55\u3002"
    if trimmed_error == "access_denied":
        return "\u6388\u6743\u6ca1\u6709\u5b8c\u6210\u3002\u5982\u679c\u4f60\u6ca1\u6709\u4e3b\u52a8\u53d6\u6d88\uff0c\u8bf7\u91cd\u65b0\u53d1\u8d77\u767b\u5f55\u3002"
    if "missing authorization code" in normalized_error:
        return "\u6ca1\u6709\u6536\u5230\u6388\u6743\u7801\u3002\u8bf7\u56de\u5230 TooGraph \u6a21\u578b\u7ba1\u7406\u9875\u91cd\u65b0\u53d1\u8d77\u767b\u5f55\u3002"
    if trimmed_error:
        return f"\u5931\u8d25\u539f\u56e0\uff1a{trimmed_error[:240]}"
    return ""


def _build_codex_browser_failure_html(error: str = "") -> str:
    return _build_codex_browser_callback_html(
        title="TooGraph \u767b\u5f55\u6ca1\u6709\u5b8c\u6210",
        state_class="toograph-auth-return--failure",
        status_label="\u9700\u8981\u91cd\u8bd5",
        heading="\u767b\u5f55\u6ca1\u6709\u5b8c\u6210",
        body="\u8fd9\u6b21\u6d4f\u89c8\u5668\u767b\u5f55\u6ca1\u6709\u5b8c\u6210\u3002\u8bf7\u5173\u95ed\u6b64\u9875\u9762\uff0c\u56de\u5230 TooGraph \u7684\u6a21\u578b\u7ba1\u7406\u9875\u91cd\u8bd5\uff0c\u6216\u4f7f\u7528\u5907\u7528\u767b\u5f55\u65b9\u5f0f\u3002",
        primary_action="\u5173\u95ed\u6b64\u9875\u9762",
        footnote="TooGraph \u6ca1\u6709\u4fdd\u5b58\u65b0\u7684\u767b\u5f55\u51ed\u636e\uff1b\u4f60\u53ef\u4ee5\u5b89\u5168\u5173\u95ed\u8fd9\u4e2a\u9875\u9762\u3002",
        mascot_mood_class="buddy-mascot--error",
        detail=_codex_browser_failure_detail(error),
    )


CODEX_BROWSER_SUCCESS_HTML = _build_codex_browser_callback_html(
    title="TooGraph \u767b\u5f55\u6210\u529f",
    state_class="toograph-auth-return--success",
    status_label="\u767b\u5f55\u6210\u529f",
    heading="\u767b\u5f55\u6210\u529f",
    body="ChatGPT / Codex \u767b\u5f55\u5df2\u5b8c\u6210\u3002TooGraph \u4f1a\u81ea\u52a8\u8bc6\u522b\u8fd9\u6b21\u767b\u5f55\uff0c\u4f60\u73b0\u5728\u53ef\u4ee5\u5173\u95ed\u6b64\u9875\u9762\uff0c\u56de\u5230\u539f\u6765\u7684\u6a21\u578b\u7ba1\u7406\u7a97\u53e3\u7ee7\u7eed\u4f7f\u7528\u3002",
    primary_action="\u5173\u95ed\u6b64\u9875\u9762",
    footnote="\u5982\u679c\u539f\u6765\u7684 TooGraph \u9875\u9762\u8fd8\u505c\u7559\u5728\u7b49\u5f85\u72b6\u6001\uff0c\u53ef\u4ee5\u70b9\u4e00\u6b21\u201c\u68c0\u67e5\u767b\u5f55\u201d\u3002",
    mascot_mood_class="buddy-mascot--idle",
)


CODEX_BROWSER_FAILURE_HTML = _build_codex_browser_failure_html()


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


def _normalize_float(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


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
    CODEX_BROWSER_SESSION_PATH.unlink(missing_ok=True)
    with _browser_login_lock:
        _browser_login_sessions.clear()


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


def _read_browser_login_sessions() -> dict[str, dict[str, Any]]:
    try:
        raw_sessions = _as_dict(read_json_file(CODEX_BROWSER_SESSION_PATH, default={}))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}

    sessions: dict[str, dict[str, Any]] = {}
    for raw_state, raw_session in raw_sessions.items():
        session = _as_dict(raw_session)
        state = str(session.get("state") or raw_state or "").strip()
        if not state:
            continue
        sessions[state] = {
            "state": state,
            "code_verifier": str(session.get("code_verifier") or ""),
            "authorization_url": str(session.get("authorization_url") or ""),
            "callback_url": str(session.get("callback_url") or CODEX_BROWSER_REDIRECT_URI),
            "created_at": _normalize_float(session.get("created_at"), time.time()),
            "expires_at": _normalize_float(session.get("expires_at"), time.time() + CODEX_BROWSER_LOGIN_TTL_SECONDS),
            "status": str(session.get("status") or "pending"),
            "error": str(session.get("error") or ""),
        }
    return sessions


def _persist_browser_login_sessions_locked() -> None:
    write_json_file(CODEX_BROWSER_SESSION_PATH, _browser_login_sessions)
    try:
        CODEX_BROWSER_SESSION_PATH.chmod(0o600)
    except OSError:
        pass


def _load_browser_login_sessions_locked() -> None:
    for state, session in _read_browser_login_sessions().items():
        existing = _browser_login_sessions.get(state)
        if not existing or _normalize_float(session.get("created_at"), 0.0) >= _normalize_float(existing.get("created_at"), 0.0):
            _browser_login_sessions[state] = session


def restore_pending_codex_browser_login_sessions() -> int:
    with _browser_login_lock:
        _load_browser_login_sessions_locked()
        _prune_expired_browser_sessions()
        pending_count = sum(1 for session in _browser_login_sessions.values() if session.get("status") == "pending")

    if pending_count <= 0:
        return 0

    try:
        _start_codex_browser_callback_server()
    except RuntimeError as exc:
        with _browser_login_lock:
            for session in _browser_login_sessions.values():
                if session.get("status") == "pending":
                    session["status"] = "failed"
                    session["error"] = str(exc)
                    session["code_verifier"] = ""
            _persist_browser_login_sessions_locked()
        return 0
    return pending_count


def _prune_expired_browser_sessions(now: float | None = None) -> None:
    timestamp = time.time() if now is None else now
    changed = False
    expired_states = [
        state
        for state, session in _browser_login_sessions.items()
        if float(session.get("expires_at") or 0) <= timestamp and session.get("status") == "pending"
    ]
    for state in expired_states:
        _browser_login_sessions[state]["status"] = "expired"
        _browser_login_sessions[state]["error"] = "Browser login expired."
        changed = True
    if changed:
        _persist_browser_login_sessions_locked()


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
            self._write_html(400, _build_codex_browser_failure_html(error))
            return
        if not state or not code:
            error_message = "Missing authorization code."
            _mark_codex_browser_login_failed(state=state, error=error_message)
            self._write_html(400, _build_codex_browser_failure_html(error_message))
            return

        try:
            complete_codex_browser_login_callback(state=state, code=code)
        except RuntimeError as exc:
            _mark_codex_browser_login_failed(state=state, error=str(exc))
            self._write_html(400, _build_codex_browser_failure_html(str(exc)))
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
        _load_browser_login_sessions_locked()
        session = _browser_login_sessions.get(state)
        if not session:
            timestamp = time.time()
            session = {
                "state": state,
                "code_verifier": "",
                "authorization_url": "",
                "callback_url": CODEX_BROWSER_REDIRECT_URI,
                "created_at": timestamp,
                "expires_at": timestamp + CODEX_BROWSER_LOGIN_TTL_SECONDS,
                "status": "failed",
                "error": "",
            }
            _browser_login_sessions[state] = session
        session["status"] = "failed"
        session["error"] = error
        session["code_verifier"] = ""
        _persist_browser_login_sessions_locked()


def start_codex_browser_login() -> dict[str, Any]:
    code_verifier, code_challenge = _generate_pkce_pair()
    state = secrets.token_hex(16)
    created_at = time.time()
    expires_at = created_at + CODEX_BROWSER_LOGIN_TTL_SECONDS
    authorization_url = _build_codex_browser_authorization_url(state=state, code_challenge=code_challenge)
    _start_codex_browser_callback_server()

    with _browser_login_lock:
        _load_browser_login_sessions_locked()
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
        _persist_browser_login_sessions_locked()

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
        _load_browser_login_sessions_locked()
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
        _load_browser_login_sessions_locked()
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
            _browser_login_sessions[trimmed_state]["code_verifier"] = ""
            _persist_browser_login_sessions_locked()
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
