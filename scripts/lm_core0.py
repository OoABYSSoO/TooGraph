import os
import json
import time
import asyncio
import subprocess
import codecs
import math
import httpx
import uvicorn
import html
import re
import shutil
import signal
import sys
import tempfile
import base64
import mimetypes
import binascii
from urllib.parse import urlparse, unquote
from collections import deque
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse

# ==========================================
# 1. 配置
# ==========================================
LLAMA_PORT = int(os.environ.get("LLAMA_PORT", "8889"))
PROXY_PORT = int(os.environ.get("PROXY_PORT", "8888"))

TARGET_URL = f"http://127.0.0.1:{LLAMA_PORT}"

LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "lm-local")
UPSTREAM_MODEL_NAME = os.environ.get("UPSTREAM_MODEL_NAME", LOCAL_MODEL_NAME)

UPSTREAM_OPENAI_API_KEY = os.environ.get("UPSTREAM_OPENAI_API_KEY", "sk-local-upstream")

LLAMA_SERVER_BIN = os.environ.get("LLAMA_SERVER_BIN", "/home/abyss/llama.cpp/build/bin/llama-server")
MODEL_PATH = os.environ.get(
    "MODEL_PATH","/home/abyss/models/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf"
)
MMPROJ_PATH = "/home/abyss/models/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf"
DISPLAY_MODEL_NAME = os.environ.get("DISPLAY_MODEL_NAME", os.path.basename(MODEL_PATH))

LM_CLOUD_PROVIDER = os.environ.get("LM_CLOUD_PROVIDER", os.environ.get("CLOUD_PROVIDER", "or"))

LM_OPENROUTER_API_KEY = os.environ.get("LM_OPENROUTER_API_KEY", os.environ.get("OPENROUTER_API_KEY", ""))
LM_OPENROUTER_API_BASE = os.environ.get("LM_OPENROUTER_API_BASE", os.environ.get("OPENROUTER_API_BASE", ""))

LM_SUB2_BASE_URL = os.environ.get("LM_SUB2_BASE_URL", os.environ.get("LM_CC_BASE_URL", ""))
LM_SUB2_AUTH_TOKEN = os.environ.get("LM_SUB2_AUTH_TOKEN", os.environ.get("LM_CC_AUTH_TOKEN", ""))

OPENROUTER_API_KEY = LM_OPENROUTER_API_KEY
OPENROUTER_API_BASE = LM_OPENROUTER_API_BASE

LOCAL_MODEL_ALIASES = os.environ.get(
    "LOCAL_MODEL_ALIASES",
    ",".join(x for x in [LOCAL_MODEL_NAME, UPSTREAM_MODEL_NAME, DISPLAY_MODEL_NAME] if x),
)

LM_NATIVE_SONNET_MODEL = os.environ.get("LM_NATIVE_SONNET_MODEL", os.environ.get("ANTHROPIC_DEFAULT_SONNET_MODEL", "claude-sonnet-4-6"))
LM_NATIVE_OPUS_MODEL = os.environ.get("LM_NATIVE_OPUS_MODEL", os.environ.get("ANTHROPIC_DEFAULT_OPUS_MODEL", "claude-opus-4-6"))
LM_NATIVE_HAIKU_MODEL = os.environ.get("LM_NATIVE_HAIKU_MODEL", os.environ.get("ANTHROPIC_DEFAULT_HAIKU_MODEL", "claude-haiku-4-5"))

LM_OR_SONNET_ALIAS = os.environ.get("LM_OR_SONNET_ALIAS", "or-sonnet")
LM_OR_OPUS_ALIAS = os.environ.get("LM_OR_OPUS_ALIAS", "or-opus")
LM_OR_HAIKU_ALIAS = os.environ.get("LM_OR_HAIKU_ALIAS", "or-haiku")

LM_SUB2_SONNET_ALIAS = os.environ.get("LM_SUB2_SONNET_ALIAS", "sub2-sonnet")
LM_SUB2_OPUS_ALIAS = os.environ.get("LM_SUB2_OPUS_ALIAS", "sub2-opus")
LM_SUB2_HAIKU_ALIAS = os.environ.get("LM_SUB2_HAIKU_ALIAS", "sub2-haiku")

CLOUD_SONNET_ALIAS = os.environ.get("CLOUD_SONNET_ALIAS", LM_OR_SONNET_ALIAS)
CLOUD_OPUS_ALIAS = os.environ.get("CLOUD_OPUS_ALIAS", LM_OR_OPUS_ALIAS)
CLOUD_HAIKU_ALIAS = os.environ.get("CLOUD_HAIKU_ALIAS", LM_OR_HAIKU_ALIAS)

LM_OPENROUTER_SONNET_MODEL = os.environ.get("LM_OPENROUTER_SONNET_MODEL", os.environ.get("CLOUD_SONNET_MODEL", "openrouter/anthropic/claude-sonnet-4.6"))
LM_OPENROUTER_OPUS_MODEL = os.environ.get("LM_OPENROUTER_OPUS_MODEL", os.environ.get("CLOUD_OPUS_MODEL", "openrouter/anthropic/claude-opus-4.6"))
LM_OPENROUTER_HAIKU_MODEL = os.environ.get("LM_OPENROUTER_HAIKU_MODEL", os.environ.get("CLOUD_HAIKU_MODEL", "openrouter/anthropic/claude-haiku-4.5"))

LM_SUB2_SONNET_MODEL = os.environ.get("LM_SUB2_SONNET_MODEL", os.environ.get("LM_CC_SONNET_MODEL", LM_NATIVE_SONNET_MODEL))
LM_SUB2_OPUS_MODEL = os.environ.get("LM_SUB2_OPUS_MODEL", os.environ.get("LM_CC_OPUS_MODEL", LM_NATIVE_OPUS_MODEL))
LM_SUB2_HAIKU_MODEL = os.environ.get("LM_SUB2_HAIKU_MODEL", os.environ.get("LM_CC_HAIKU_MODEL", LM_NATIVE_HAIKU_MODEL))

LLAMA_REASONING = os.environ.get("LLAMA_REASONING", "auto")
LLAMA_REASONING_FORMAT = os.environ.get("LLAMA_REASONING_FORMAT", "deepseek")
LLAMA_REASONING_BUDGET = os.environ.get("LLAMA_REASONING_BUDGET", "-1")

LLAMA_GPU_LAYERS = int(os.environ.get("LLAMA_GPU_LAYERS", "999"))
LLAMA_CTX_SIZE = int(os.environ.get("LLAMA_CTX_SIZE", "200000"))
LLAMA_N_PREDICT = int(os.environ.get("LLAMA_N_PREDICT", "81920"))
LLAMA_CACHE_K_TYPE = os.environ.get("LLAMA_CACHE_K_TYPE", "q8_0")
LLAMA_CACHE_V_TYPE = os.environ.get("LLAMA_CACHE_V_TYPE", "q8_0")
LLAMA_FLASH_ATTN = os.environ.get("LLAMA_FLASH_ATTN", "on")
LLAMA_BATCH_SIZE = int(os.environ.get("LLAMA_BATCH_SIZE", "512"))
LLAMA_PARALLEL = int(os.environ.get("LLAMA_PARALLEL", "1"))
LLAMA_TEMP = os.environ.get("LLAMA_TEMP", "0.7")
LLAMA_TOP_P = os.environ.get("LLAMA_TOP_P", "0.95")
LLAMA_TOP_K = os.environ.get("LLAMA_TOP_K", "20")

LOG_DIR = os.path.expanduser(os.environ.get("LOG_DIR", "~/llamaLogs"))
os.makedirs(LOG_DIR, exist_ok=True)

HISTORY_LOG_FILE = os.path.join(LOG_DIR, "chat_history.jsonl")

VIDEO_ADAPTER_ENABLED = os.environ.get("VIDEO_ADAPTER_ENABLED", "1").lower() not in {"0", "false", "off", "no"}
VIDEO_DEFAULT_FPS = float(os.environ.get("VIDEO_DEFAULT_FPS", "1.0"))
VIDEO_MAX_FRAMES = int(os.environ.get("VIDEO_MAX_FRAMES", "12"))
VIDEO_MAX_SIDE = int(os.environ.get("VIDEO_MAX_SIDE", "1280"))
VIDEO_JPEG_QSCALE = int(os.environ.get("VIDEO_JPEG_QSCALE", "3"))
VIDEO_TMP_DIR = os.path.expanduser(os.environ.get("VIDEO_TMP_DIR", os.path.join(LOG_DIR, "video_tmp")))
VIDEO_KEEP_TEMP = os.environ.get("VIDEO_KEEP_TEMP", "0").lower() in {"1", "true", "on", "yes"}
VIDEO_FRAME_HINT_TEMPLATE = os.environ.get(
    "VIDEO_FRAME_HINT_TEMPLATE",
    "上面这些图片是从同一段视频按约 {fps:g} fps 抽取的连续帧，请按时间顺序把它们当作视频进行分析。",
)
os.makedirs(VIDEO_TMP_DIR, exist_ok=True)

llama_process = None
SERVICE_STARTED_AT = None
_http_local: httpx.AsyncClient | None = None
_http_cloud: httpx.AsyncClient | None = None


def parse_csv_env(value: str) -> list[str]:
    parts = []
    seen = set()
    for raw in (value or "").split(","):
        item = raw.strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(item)
    return parts


def yaml_quote(value: str) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "off", "no", ""}


def normalize_openrouter_model_id(model: str) -> str:
    model = (model or "").strip()
    if model.startswith("openrouter/"):
        return model[len("openrouter/") :]
    return model


def normalize_cloud_provider_name(provider: str) -> str:
    provider = (provider or "").strip().lower()
    if provider in {"openrouter", "or"}:
        return "or"
    if provider in {"cc", "sub2", "sub2api"}:
        return "sub2"
    return "or"


LOCAL_ROUTE_MODEL_NAMES = parse_csv_env(LOCAL_MODEL_ALIASES)
LOCAL_ROUTE_MODEL_NAMES_LOWER = {x.lower() for x in LOCAL_ROUTE_MODEL_NAMES}

OPENROUTER_DIRECT_BASE = (OPENROUTER_API_BASE or "https://openrouter.ai/api").rstrip("/")
SUB2_DIRECT_BASE = LM_SUB2_BASE_URL.rstrip("/")

CLOUD_PROVIDER_REQUESTED = normalize_cloud_provider_name(LM_CLOUD_PROVIDER)

CLOUD_FAMILY_CONFIG = {
    "sonnet": {
        "alias": CLOUD_SONNET_ALIAS.strip(),
        "aliases": [
            CLOUD_SONNET_ALIAS.strip(),
            LM_OR_SONNET_ALIAS.strip(),
            LM_SUB2_SONNET_ALIAS.strip(),
        ],
        "native": LM_NATIVE_SONNET_MODEL.strip(),
        "providers": {
            "or": normalize_openrouter_model_id(LM_OPENROUTER_SONNET_MODEL),
            "sub2": LM_SUB2_SONNET_MODEL.strip(),
        },
    },
    "opus": {
        "alias": CLOUD_OPUS_ALIAS.strip(),
        "aliases": [
            CLOUD_OPUS_ALIAS.strip(),
            LM_OR_OPUS_ALIAS.strip(),
            LM_SUB2_OPUS_ALIAS.strip(),
        ],
        "native": LM_NATIVE_OPUS_MODEL.strip(),
        "providers": {
            "or": normalize_openrouter_model_id(LM_OPENROUTER_OPUS_MODEL),
            "sub2": LM_SUB2_OPUS_MODEL.strip(),
        },
    },
    "haiku": {
        "alias": CLOUD_HAIKU_ALIAS.strip(),
        "aliases": [
            CLOUD_HAIKU_ALIAS.strip(),
            LM_OR_HAIKU_ALIAS.strip(),
            LM_SUB2_HAIKU_ALIAS.strip(),
        ],
        "native": LM_NATIVE_HAIKU_MODEL.strip(),
        "providers": {
            "or": normalize_openrouter_model_id(LM_OPENROUTER_HAIKU_MODEL),
            "sub2": LM_SUB2_HAIKU_MODEL.strip(),
        },
    },
}

CLOUD_PROVIDER_CONFIGS = {
    "or": {
        "api_base": OPENROUTER_DIRECT_BASE,
        "label": "OpenRouter",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
        "auth_token": LM_OPENROUTER_API_KEY.strip(),
        "extra_headers": {
            "HTTP-Referer": f"http://127.0.0.1:{PROXY_PORT}",
            "X-Title": "lm_core.py proxy",
        },
        "models": {
            family: cfg["providers"]["or"]
            for family, cfg in CLOUD_FAMILY_CONFIG.items()
        },
    },
    "sub2": {
        "api_base": SUB2_DIRECT_BASE,
        "label": "sub2api",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
        "auth_token": LM_SUB2_AUTH_TOKEN.strip(),
        "extra_headers": {},
        "models": {
            family: cfg["providers"]["sub2"]
            for family, cfg in CLOUD_FAMILY_CONFIG.items()
        },
    },
}

AVAILABLE_CLOUD_PROVIDERS = [
    name for name, cfg in CLOUD_PROVIDER_CONFIGS.items()
    if cfg.get("api_base")
]

ACTIVE_CLOUD_PROVIDER = CLOUD_PROVIDER_REQUESTED
if not CLOUD_PROVIDER_CONFIGS.get(ACTIVE_CLOUD_PROVIDER, {}).get("api_base"):
    ACTIVE_CLOUD_PROVIDER = "or"

ACTIVE_CLOUD_PROVIDER_CONFIG = CLOUD_PROVIDER_CONFIGS[ACTIVE_CLOUD_PROVIDER]

CLOUD_MODEL_NAME_TO_FAMILY: dict[str, str] = {}
for family, cfg in CLOUD_FAMILY_CONFIG.items():
    candidates = [
        cfg.get("alias"),
        *cfg.get("aliases", []),
        cfg.get("native"),
        *cfg.get("providers", {}).values(),
    ]
    for candidate in candidates:
        candidate = (candidate or "").strip()
        if candidate:
            CLOUD_MODEL_NAME_TO_FAMILY.setdefault(candidate.lower(), family)


def build_llama_cmd() -> list[str]:
    return [
        LLAMA_SERVER_BIN,
        "-m", MODEL_PATH,
        "--mmproj", MMPROJ_PATH,
        "-ngl", str(LLAMA_GPU_LAYERS),
        "-c", str(LLAMA_CTX_SIZE),
        "-n", str(LLAMA_N_PREDICT),
        "-ctk", LLAMA_CACHE_K_TYPE,
        "-ctv", LLAMA_CACHE_V_TYPE,
        "-fa", LLAMA_FLASH_ATTN,
        "-b", str(LLAMA_BATCH_SIZE),
        "--parallel", str(LLAMA_PARALLEL),
        "--temp", str(LLAMA_TEMP),
        "--top-p", str(LLAMA_TOP_P),
        "--top-k", str(LLAMA_TOP_K),
        "--reasoning", str(LLAMA_REASONING),
        "--reasoning-format", str(LLAMA_REASONING_FORMAT),
        "--reasoning-budget", str(LLAMA_REASONING_BUDGET),
        "--host", "127.0.0.1",
        "--port", str(LLAMA_PORT),
    ]


def build_runtime_config() -> dict:
    return {
        "display_model_name": DISPLAY_MODEL_NAME,
        "proxy": {
            "url": f"http://127.0.0.1:{PROXY_PORT}",
            "host": "0.0.0.0",
            "port": PROXY_PORT,
            "healthz": f"http://127.0.0.1:{PROXY_PORT}/healthz",
            "logs_page": f"http://127.0.0.1:{PROXY_PORT}/logs",
        },
        "llama": {
            "url": TARGET_URL,
            "port": LLAMA_PORT,
            "binary": LLAMA_SERVER_BIN,
            "model_path": MODEL_PATH,
            "model_file": os.path.basename(MODEL_PATH),
            "gpu_layers": LLAMA_GPU_LAYERS,
            "ctx_size": LLAMA_CTX_SIZE,
            "n_predict": LLAMA_N_PREDICT,
            "cache_k_type": LLAMA_CACHE_K_TYPE,
            "cache_v_type": LLAMA_CACHE_V_TYPE,
            "flash_attn": LLAMA_FLASH_ATTN,
            "batch_size": LLAMA_BATCH_SIZE,
            "parallel": LLAMA_PARALLEL,
            "temp": str(LLAMA_TEMP),
            "top_p": str(LLAMA_TOP_P),
            "top_k": str(LLAMA_TOP_K),
            "reasoning": str(LLAMA_REASONING),
            "reasoning_format": str(LLAMA_REASONING_FORMAT),
            "reasoning_budget": str(LLAMA_REASONING_BUDGET),
            "local_route_model_names": LOCAL_ROUTE_MODEL_NAMES,
            "command": build_llama_cmd(),
        },
        "cloud": {
            "provider": ACTIVE_CLOUD_PROVIDER,
            "provider_label": ACTIVE_CLOUD_PROVIDER_CONFIG.get("label", ACTIVE_CLOUD_PROVIDER),
            "available_providers": AVAILABLE_CLOUD_PROVIDERS,
            "api_base": ACTIVE_CLOUD_PROVIDER_CONFIG.get("api_base", ""),
            "aliases": {
                "sonnet": CLOUD_SONNET_ALIAS,
                "opus": CLOUD_OPUS_ALIAS,
                "haiku": CLOUD_HAIKU_ALIAS,
            },
            "accepted_aliases": {
                family: list(dict.fromkeys(alias for alias in cfg.get("aliases", []) if alias))
                for family, cfg in CLOUD_FAMILY_CONFIG.items()
            },
            "native_models": {
                "sonnet": LM_NATIVE_SONNET_MODEL,
                "opus": LM_NATIVE_OPUS_MODEL,
                "haiku": LM_NATIVE_HAIKU_MODEL,
            },
            "models": {
                "sonnet": ACTIVE_CLOUD_PROVIDER_CONFIG["models"].get("sonnet", ""),
                "opus": ACTIVE_CLOUD_PROVIDER_CONFIG["models"].get("opus", ""),
                "haiku": ACTIVE_CLOUD_PROVIDER_CONFIG["models"].get("haiku", ""),
            },
            "providers": {
                name: {
                    "label": cfg.get("label", name),
                    "api_base": cfg.get("api_base", ""),
                    "auth_configured": bool(cfg.get("auth_token")),
                    "models": dict(cfg.get("models", {})),
                }
                for name, cfg in CLOUD_PROVIDER_CONFIGS.items()
            },
        },
        "logs": {
            "dir": LOG_DIR,
            "history": HISTORY_LOG_FILE,
        },
    }


def summarize_runtime_config() -> dict:
    cfg = build_runtime_config()
    llama = {k: v for k, v in cfg["llama"].items()
             if k not in {"reasoning", "reasoning_format", "reasoning_budget",
                          "local_route_model_names", "command"}}
    return {
        "display_model_name": cfg["display_model_name"],
        "proxy": cfg["proxy"],
        "llama": llama,
        "cloud": cfg["cloud"],
        "logs": cfg["logs"],
    }


async def wait_http_ready(url: str, *, timeout_sec: float = 120.0, ok_statuses: tuple[int, ...] = (200,)) -> None:
    deadline = time.time() + timeout_sec
    last_error = None

    async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
        while time.time() < deadline:
            try:
                res = await client.get(url)
                if res.status_code in ok_statuses:
                    return
                last_error = f"HTTP {res.status_code} from {url}"
            except Exception as ex:
                last_error = repr(ex)
            await asyncio.sleep(1.0)

    raise RuntimeError(f"服务未就绪: {url}; 最后错误: {last_error}")


async def wait_process_http_ready(
    label: str,
    url: str,
    proc: subprocess.Popen | None,
    *,
    timeout_sec: float = 120.0,
    ok_statuses: tuple[int, ...] = (200,),
    log_path: str | None = None,
    progress_every: float = 5.0,
) -> None:
    deadline = time.time() + timeout_sec
    last_error = None
    next_progress = time.time() + progress_every
    start = time.time()

    async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
        while time.time() < deadline:
            if proc is not None and proc.poll() is not None:
                raise build_process_start_error(label, url, proc, log_path)

            try:
                res = await client.get(url)
                if res.status_code in ok_statuses:
                    elapsed = time.time() - start
                    print(f"✅ {label} 健康检查通过 ({elapsed:.1f}s): {url}")
                    return
                last_error = f"HTTP {res.status_code} from {url}"
            except Exception as ex:
                last_error = repr(ex)

            now = time.time()
            if now >= next_progress:
                elapsed = now - start
                print(f"⏳ 等待 {label} 就绪中 ({elapsed:.0f}s/{timeout_sec:.0f}s): {url} | last_error={last_error}")
                if log_path and os.path.exists(log_path):
                    try:
                        tail = ''.join(tail_lines(log_path, 8)).strip()
                        if tail:
                            print(f"📄 {label} 日志尾部:\n{tail}")
                    except Exception:
                        pass
                next_progress = now + progress_every
            await asyncio.sleep(1.0)

    raise build_process_start_error(label, url, proc, log_path)


def terminate_process(proc: subprocess.Popen | None) -> None:
    if not proc:
        return
    if proc.poll() is not None:
        return

    pgid = None
    try:
        pgid = os.getpgid(proc.pid)
    except Exception:
        pgid = None

    try:
        if pgid:
            os.killpg(pgid, signal.SIGTERM)
        else:
            proc.terminate()
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        if pgid:
            os.killpg(pgid, signal.SIGKILL)
        else:
            proc.kill()
        try:
            proc.wait(timeout=5)
        except Exception:
            pass


def cleanup_child_processes() -> None:
    global llama_process
    terminate_process(llama_process)
    llama_process = None


def describe_pid(pid: int) -> str:
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            raw = f.read().replace(b"\x00", b" ").decode(errors="ignore").strip()
            return raw or f"pid={pid}"
    except Exception:
        return f"pid={pid}"


def is_port_listening(port: int, host: str = "127.0.0.1") -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        try:
            return sock.connect_ex((host, port)) == 0
        except OSError:
            return False


def find_listening_pids(port: int) -> list[int]:
    pids: list[int] = []

    lsof = shutil.which("lsof")
    if lsof:
        try:
            res = subprocess.run(
                [lsof, f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
                capture_output=True,
                text=True,
                check=False,
            )
            for line in res.stdout.splitlines():
                line = line.strip()
                if line.isdigit():
                    pids.append(int(line))
        except Exception:
            pass

    if not pids:
        ss = shutil.which("ss")
        if ss:
            try:
                res = subprocess.run(
                    [ss, "-ltnp"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                needle = f":{port}"
                for line in res.stdout.splitlines():
                    if needle not in line:
                        continue
                    pids.extend(int(pid) for pid in re.findall(r"pid=(\d+)", line))
            except Exception:
                pass

    if not pids:
        fuser = shutil.which("fuser")
        if fuser:
            try:
                res = subprocess.run(
                    [fuser, f"{port}/tcp"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                for token in (res.stdout + " " + res.stderr).split():
                    if token.isdigit():
                        pids.append(int(token))
            except Exception:
                pass

    return sorted({pid for pid in pids if pid != os.getpid()})


def kill_pids(pids: list[int], sig: int) -> None:
    for pid in pids:
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            continue
        except PermissionError:
            print(f"⚠️ 无权限结束进程 pid={pid}: {describe_pid(pid)}", file=sys.stderr)
        except Exception as ex:
            print(f"⚠️ 结束进程失败 pid={pid}: {ex}", file=sys.stderr)


def ensure_port_is_free(port: int, *, label: str, timeout_sec: float = 15.0) -> None:
    deadline = time.time() + timeout_sec
    last_pids: list[int] = []
    while time.time() < deadline:
        pids = find_listening_pids(port)
        if not pids and not is_port_listening(port):
            return
        last_pids = pids
        time.sleep(0.3)
    details = ", ".join(describe_pid(pid) for pid in last_pids) if last_pids else "unknown listener"
    raise RuntimeError(f"{label} 端口 {port} 仍被占用: {details}")


def kill_existing_listener_on_port(port: int, *, label: str) -> None:
    pids = find_listening_pids(port)
    if not pids and not is_port_listening(port):
        return

    if pids:
        print(f"♻️ 发现已有 {label} 服务占用端口 {port}，准备结束旧进程:")
        for pid in pids:
            print(f"   - pid={pid} {describe_pid(pid)}")
        kill_pids(pids, signal.SIGTERM)
        deadline = time.time() + 8.0
        while time.time() < deadline:
            rest = find_listening_pids(port)
            if not rest and not is_port_listening(port):
                return
            time.sleep(0.25)
        rest = find_listening_pids(port)
        if rest:
            print(f"⚠️ 旧进程未正常退出，强制结束端口 {port} 上的残留进程...")
            kill_pids(rest, signal.SIGKILL)
        ensure_port_is_free(port, label=label, timeout_sec=8.0)
        return

    raise RuntimeError(f"检测到端口 {port} 已被占用，但无法定位对应进程，请手动释放后重试")


def normalize_text_piece(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def extract_content(content):
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                block_type = item.get("type", "unknown")
                if block_type == "text":
                    parts.append(normalize_text_piece(item.get("text")))
                elif block_type == "thinking":
                    parts.append(normalize_text_piece(item.get("thinking") or item.get("text")))
                elif block_type == "tool_use":
                    parts.append(
                        f"[tool_use:{item.get('name', 'unknown')}] "
                        f"{json.dumps(item.get('input', {}), ensure_ascii=False)}"
                    )
                elif block_type == "tool_result":
                    parts.append(f"[tool_result] {extract_content(item.get('content'))}")
                else:
                    parts.append(json.dumps(item, ensure_ascii=False))
            else:
                parts.append(str(item))
        return "\n".join([p for p in parts if p])

    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)

    return str(content)


def build_display_messages(req_raw: dict) -> list[dict]:
    messages = []
    system = req_raw.get("system")

    if system:
        messages.append({"role": "system", "content": system})

    for msg in req_raw.get("messages", []):
        messages.append(msg)

    return messages


def flatten_text_content(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                if item.get("type") in {"text", "thinking"}:
                    parts.append(normalize_text_piece(item.get("text") or item.get("thinking")))
                else:
                    parts.append(normalize_text_piece(item))
            else:
                parts.append(normalize_text_piece(item))
        return "\n".join(p for p in parts if p)
    if isinstance(value, dict):
        return normalize_text_piece(value)
    return ""


def detect_request_kind(req_raw: dict, path: str) -> str:
    normalized_path = (path or "").strip().lower()
    if normalized_path.endswith("/count_tokens"):
        return "count-tokens"

    system = req_raw.get("system")
    system_text = flatten_text_content(system).lower()
    if "generate a concise, sentence-case title" in system_text and '"title"' in system_text:
        return "session-title"

    if normalized_path.endswith("/messages") or normalized_path.endswith("/chat/completions"):
        return "chat"

    return "request"


def parse_user_content_html(content_str):
    """
    智能解析 OpenClaw 特有的 User Content 格式，生成带标签的美观 HTML。
    """
    meta_pattern = r"Sender \(untrusted metadata\):\s*```json\s*(.*?)\s*```"
    timestamp_pattern = r"^\[(.*?)\]"

    meta_match = re.search(meta_pattern, content_str, re.DOTALL)
    if meta_match:
        try:
            meta_json = json.loads(meta_match.group(1))
            username = meta_json.get("username", meta_json.get("name", "Unknown"))
        except Exception:
            username = "Unknown"

        clean_content = re.sub(meta_pattern, "", content_str, flags=re.DOTALL).strip()
        ts_match = re.match(timestamp_pattern, clean_content)

        if ts_match:
            timestamp = ts_match.group(1)
            actual_msg = clean_content[len(ts_match.group(0)):].strip()
            return (
                f'<div style="margin-bottom: 8px;"><span style="background:#21262d; padding:2px 6px; '
                f'border-radius:4px; font-size:11px; color:#39c5cf; margin-right:8px; border: 1px solid '
                f'#00aba9;">👤 {html.escape(username)}</span><span style="background:#21262d; padding:2px 6px; '
                f'border-radius:4px; font-size:11px; color:#8b949e; border: 1px solid #30363d;">🕒 '
                f'{html.escape(timestamp)}</span></div><div>{html.escape(actual_msg)}</div>'
            )
        else:
            return (
                f'<div style="margin-bottom: 8px;"><span style="background:#21262d; padding:2px 6px; '
                f'border-radius:4px; font-size:11px; color:#39c5cf; border: 1px solid #00aba9;">👤 '
                f'{html.escape(username)}</span></div><div>{html.escape(clean_content)}</div>'
            )

    return html.escape(content_str)


def sanitize_payload_for_log(value):
    if isinstance(value, dict):
        sanitized = {}
        for k, v in value.items():
            if k in {"url", "image", "video"}:
                sanitized[k] = sanitize_media_value_for_log(v)
            else:
                sanitized[k] = sanitize_payload_for_log(v)
        return sanitized

    if isinstance(value, list):
        return [sanitize_payload_for_log(v) for v in value]

    if isinstance(value, str) and value.startswith("data:"):
        return summarize_data_url(value)

    return value


def summarize_data_url(url: str) -> str:
    head, sep, _ = url.partition(",")
    mime = "unknown"
    if head.startswith("data:"):
        mime = head[5:].split(";", 1)[0] or "unknown"
    return f"<data-url mime={mime} chars={len(url)}>"


def sanitize_media_value_for_log(value):
    if isinstance(value, list):
        return [sanitize_media_value_for_log(v) for v in value]
    if isinstance(value, str):
        if value.startswith("data:"):
            return summarize_data_url(value)
        if value.startswith("file://"):
            return f"<file-url {value[7:]}>"
    return sanitize_payload_for_log(value)


def save_raw_log(req_j, reasoning, content, duration, path, upstream):
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "duration_sec": round(duration, 2),
        "path": path,
        "upstream": upstream,
        "request_raw": sanitize_payload_for_log(req_j),
        "response_raw": sanitize_payload_for_log({
            "reasoning": reasoning,
            "content": content,
        }),
    }
    with open(HISTORY_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def parse_openai_payload_for_log(payload: dict, reasoning_parts: list[str], content_parts: list[str]) -> None:
    try:
        choices = payload.get("choices", [])
        if not choices:
            return

        choice = choices[0]
        delta = choice.get("delta")
        if isinstance(delta, dict):
            reasoning = delta.get("reasoning_content")
            content = delta.get("content")
            if reasoning:
                reasoning_parts.append(normalize_text_piece(reasoning))
            if content:
                content_parts.append(normalize_text_piece(content))
            return

        message = choice.get("message", {})
        if isinstance(message, dict):
            reasoning = message.get("reasoning_content")
            content = message.get("content")
            if reasoning:
                reasoning_parts.append(normalize_text_piece(reasoning))
            if content:
                content_parts.append(normalize_text_piece(content))
    except Exception:
        return


def parse_anthropic_block_for_log(block: dict, reasoning_parts: list[str], content_parts: list[str]) -> None:
    block_type = block.get("type")
    if block_type == "text":
        text = block.get("text")
        if text:
            content_parts.append(normalize_text_piece(text))
    elif block_type == "thinking":
        thinking = block.get("thinking") or block.get("text")
        if thinking:
            reasoning_parts.append(normalize_text_piece(thinking))
    elif block_type == "tool_use":
        content_parts.append(
            f"[tool_use:{block.get('name', 'unknown')}] {json.dumps(block.get('input', {}), ensure_ascii=False)}"
        )
    elif block_type == "tool_result":
        content_parts.append(f"[tool_result] {extract_content(block.get('content'))}")


def parse_anthropic_payload_for_log(payload: dict, reasoning_parts: list[str], content_parts: list[str]) -> None:
    payload_type = payload.get("type")

    if payload_type == "content_block_delta":
        delta = payload.get("delta", {})
        delta_type = delta.get("type")
        if delta_type == "text_delta":
            text = delta.get("text")
            if text:
                content_parts.append(normalize_text_piece(text))
        elif delta_type == "thinking_delta":
            thinking = delta.get("thinking") or delta.get("text")
            if thinking:
                reasoning_parts.append(normalize_text_piece(thinking))
        return

    if payload_type == "message_start":
        message = payload.get("message", {})
        for block in message.get("content", []):
            if isinstance(block, dict):
                parse_anthropic_block_for_log(block, reasoning_parts, content_parts)
        return

    if "content" in payload and isinstance(payload.get("content"), list):
        for block in payload.get("content", []):
            if isinstance(block, dict):
                parse_anthropic_block_for_log(block, reasoning_parts, content_parts)


def remove_hop_by_hop_headers(headers: dict) -> dict:
    blocked = {"host", "content-length", "transfer-encoding", "connection"}
    return {k: v for k, v in headers.items() if k.lower() not in blocked}


def get_request_model(req_j: dict | None) -> str:
    if not isinstance(req_j, dict):
        return ""
    model = req_j.get("model")
    return model.strip() if isinstance(model, str) else ""


def should_route_to_local(req_j: dict | None) -> bool:
    model = get_request_model(req_j)
    if not model:
        return True
    return model.lower() in LOCAL_ROUTE_MODEL_NAMES_LOWER


def get_cloud_model_family(model: str) -> str | None:
    model = (model or "").strip()
    if not model:
        return None
    return CLOUD_MODEL_NAME_TO_FAMILY.get(model.lower())


def should_route_to_cloud(req_j: dict | None) -> bool:
    model = get_request_model(req_j)
    return get_cloud_model_family(model) is not None


def maybe_rewrite_model_for_local(req_j: dict | None) -> dict | None:
    if not isinstance(req_j, dict):
        return req_j
    model = get_request_model(req_j)
    if model and model.lower() in LOCAL_ROUTE_MODEL_NAMES_LOWER:
        req_j["model"] = LOCAL_MODEL_NAME
    return req_j


def maybe_rewrite_model_for_cloud(req_j: dict | None) -> dict | None:
    if not isinstance(req_j, dict):
        return req_j
    model = get_request_model(req_j)
    if not model:
        return req_j
    family = get_cloud_model_family(model)
    if family:
        req_j["model"] = ACTIVE_CLOUD_PROVIDER_CONFIG["models"].get(family, model)
    return req_j


def maybe_normalize_cloud_reasoning(req_j: dict | None) -> dict | None:
    if not isinstance(req_j, dict):
        return req_j
    if not should_route_to_cloud(req_j):
        return req_j

    reasoning = req_j.get("reasoning")
    if not isinstance(reasoning, dict):
        reasoning = None

    if reasoning is not None:
        max_tokens = reasoning.get("max_tokens")
        if isinstance(max_tokens, int):
            reasoning["max_tokens"] = max(1024, min(63999, max_tokens))

    thinking = req_j.get("thinking")
    if isinstance(thinking, dict):
        budget_tokens = thinking.get("budget_tokens")
        if isinstance(budget_tokens, int):
            thinking["budget_tokens"] = max(1024, min(63999, budget_tokens))
    return req_j


def maybe_strip_cloud_history_thinking(req_j: dict | None) -> tuple[dict | None, int, int]:
    if not isinstance(req_j, dict):
        return req_j, 0, 0
    if not should_route_to_cloud(req_j):
        return req_j, 0, 0

    messages = req_j.get("messages")
    if not isinstance(messages, list):
        return req_j, 0, 0

    removed_blocks = 0
    dropped_messages = 0
    cleaned_messages = []

    for msg in messages:
        if not isinstance(msg, dict):
            cleaned_messages.append(msg)
            continue

        role = (msg.get("role") or "").strip().lower()
        content = msg.get("content")
        if role != "assistant" or not isinstance(content, list):
            cleaned_messages.append(msg)
            continue

        cleaned_content = []
        for block in content:
            if not isinstance(block, dict):
                cleaned_content.append(block)
                continue

            block_type = (block.get("type") or "").strip().lower()
            if block_type in {"thinking", "redacted_thinking"}:
                removed_blocks += 1
                continue

            if "signature" in block:
                block = {k: v for k, v in block.items() if k != "signature"}
                removed_blocks += 1

            cleaned_content.append(block)

        if cleaned_content:
            msg["content"] = cleaned_content
            cleaned_messages.append(msg)
        else:
            dropped_messages += 1

    if removed_blocks or dropped_messages:
        req_j["messages"] = cleaned_messages

    return req_j, removed_blocks, dropped_messages


def choose_upstream(path: str, req_j: dict | None = None) -> tuple[str, str, str]:
    normalized = path.lstrip("/")
    wants_anthropic = normalized == "v1/messages" or normalized.startswith("v1/messages/") or normalized.startswith("anthropic/")
    route_cloud = should_route_to_cloud(req_j)

    if route_cloud:
        return ACTIVE_CLOUD_PROVIDER_CONFIG.get("api_base", ""), ("anthropic" if wants_anthropic else "openai"), ACTIVE_CLOUD_PROVIDER

    return TARGET_URL, ("anthropic" if wants_anthropic else "openai"), "local"


def tail_lines(path: str, limit: int) -> list[str]:
    with open(path, "r", encoding="utf-8") as f:
        return list(deque(f, maxlen=limit))


def build_process_start_error(label: str, url: str, proc: subprocess.Popen | None = None, log_path: str | None = None) -> RuntimeError:
    details = [f"服务未就绪: {url}"]

    if proc is not None and proc.poll() is not None:
        details.append(f"{label} 已退出，exit_code={proc.returncode}")

    if log_path and os.path.exists(log_path):
        try:
            tail = "".join(tail_lines(log_path, 40)).strip()
            if tail:
                details.append(f"{label} 日志尾部:\n{tail}")
        except Exception as ex:
            details.append(f"读取 {label} 日志失败: {repr(ex)}")

    return RuntimeError("\n".join(details))


def clamp_video_fps(value) -> float:
    try:
        fps = float(value)
    except Exception:
        fps = VIDEO_DEFAULT_FPS
    return max(0.1, min(10.0, fps))


def guess_extension_from_mime(mime_type: str | None, default: str = ".bin") -> str:
    if not mime_type:
        return default
    ext = mimetypes.guess_extension(mime_type)
    if ext:
        return ext
    fallback = {
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    return fallback.get(mime_type.lower(), default)


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    header, sep, payload = data_url.partition(",")
    if not sep or not header.startswith("data:"):
        raise ValueError("无效的 data URL")

    mime_part = header[5:]
    is_base64 = False
    if ";" in mime_part:
        mime_type, *params = mime_part.split(";")
        is_base64 = "base64" in [p.lower() for p in params]
    else:
        mime_type = mime_part

    mime_type = mime_type or "application/octet-stream"
    if not is_base64:
        raise ValueError("当前仅支持 base64 data URL")

    try:
        return mime_type, base64.b64decode(payload)
    except (binascii.Error, ValueError) as ex:
        raise ValueError(f"无法解码 data URL: {ex}") from ex


def image_file_to_data_url(path: str) -> str:
    mime_type, _ = mimetypes.guess_type(path)
    mime_type = mime_type or "image/jpeg"
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def choose_frame_subset(paths: list[str], max_frames: int) -> list[str]:
    if len(paths) <= max_frames:
        return paths
    if max_frames <= 1:
        return [paths[0]]
    indexes = sorted({round(i * (len(paths) - 1) / (max_frames - 1)) for i in range(max_frames)})
    return [paths[i] for i in indexes]


def ffmpeg_extract_frames(video_path: str, output_dir: str, fps: float, max_frames: int, max_side: int) -> list[str]:
    ffmpeg_bin = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("未找到 ffmpeg，无法启用视频适配器")

    os.makedirs(output_dir, exist_ok=True)
    out_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    scale_filter = (
        f"fps={fps},"
        f"scale='if(gt(iw,ih),min({max_side},iw),-2)':'if(gt(iw,ih),-2,min({max_side},ih))'"
    )

    proc = subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i", video_path,
            "-vf", scale_filter,
            "-q:v", str(VIDEO_JPEG_QSCALE),
            out_pattern,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 抽帧失败: {proc.stderr.strip()}")

    paths = sorted(
        os.path.join(output_dir, name)
        for name in os.listdir(output_dir)
        if name.lower().endswith(".jpg")
    )
    if not paths:
        raise RuntimeError("视频适配器未抽取到任何帧")

    return choose_frame_subset(paths, max_frames)


def build_video_frame_blocks(frame_urls: list[str], fps: float) -> list[dict]:
    blocks = [{"type": "image_url", "image_url": {"url": url}} for url in frame_urls]
    blocks.append({"type": "text", "text": VIDEO_FRAME_HINT_TEMPLATE.format(fps=fps)})
    return blocks


async def materialize_video_to_local_file(video_ref: str, workdir: str) -> str:
    parsed = urlparse(video_ref)

    if video_ref.startswith("data:"):
        mime_type, data = decode_data_url(video_ref)
        ext = guess_extension_from_mime(mime_type, ".mp4")
        path = os.path.join(workdir, f"input{ext}")
        with open(path, "wb") as f:
            f.write(data)
        return path

    if parsed.scheme == "file":
        path = unquote(parsed.path or "")
        if os.name == "nt" and path.startswith("/") and len(path) > 2 and path[2] == ":":
            path = path[1:]
        if not os.path.exists(path):
            raise FileNotFoundError(f"找不到本地视频文件: {path}")
        return path

    if parsed.scheme in {"http", "https"}:
        ext = guess_extension_from_mime(None, os.path.splitext(parsed.path)[1] or ".mp4")
        path = os.path.join(workdir, f"download{ext}")
        async with httpx.AsyncClient(timeout=120.0, trust_env=False, follow_redirects=True) as client:
            res = await client.get(video_ref)
            res.raise_for_status()
            with open(path, "wb") as f:
                f.write(res.content)
        return path

    if os.path.isabs(video_ref) or os.path.exists(video_ref):
        if not os.path.exists(video_ref):
            raise FileNotFoundError(f"找不到本地视频文件: {video_ref}")
        return video_ref

    raise ValueError("暂不支持该视频来源，请使用 data:、file://、http(s):// 或本地绝对路径")


async def maybe_transform_video_block(block: dict, workdir: str) -> list[dict] | None:
    block_type = block.get("type")
    fps = clamp_video_fps(block.get("fps", VIDEO_DEFAULT_FPS))

    if block_type == "video_url" or (block_type is None and "video_url" in block):
        video_info = block.get("video_url") or {}
        video_ref = video_info.get("url") if isinstance(video_info, dict) else None
        if not video_ref:
            raise ValueError("video_url 缺少 url")
        local_video = await materialize_video_to_local_file(video_ref, workdir)
        frame_dir = os.path.join(workdir, f"frames_{int(time.time() * 1000)}")
        frame_paths = await asyncio.to_thread(
            ffmpeg_extract_frames,
            local_video,
            frame_dir,
            fps,
            VIDEO_MAX_FRAMES,
            VIDEO_MAX_SIDE,
        )
        frame_urls = await asyncio.to_thread(lambda: [image_file_to_data_url(p) for p in frame_paths])
        return build_video_frame_blocks(frame_urls, fps)

    if block_type == "video" or (block_type is None and "video" in block):
        video_value = block.get("video")
        if isinstance(video_value, list):
            frame_urls = []
            for item in video_value:
                if isinstance(item, str):
                    frame_urls.append(item)
                elif isinstance(item, dict) and "url" in item:
                    frame_urls.append(item["url"])
                else:
                    raise ValueError("video 帧列表仅支持字符串 URL 或包含 url 的对象")
            if not frame_urls:
                raise ValueError("video 帧列表为空")
            return build_video_frame_blocks(frame_urls, fps)

        if isinstance(video_value, str):
            local_video = await materialize_video_to_local_file(video_value, workdir)
            frame_dir = os.path.join(workdir, f"frames_{int(time.time() * 1000)}")
            frame_paths = await asyncio.to_thread(
                ffmpeg_extract_frames,
                local_video,
                frame_dir,
                fps,
                VIDEO_MAX_FRAMES,
                VIDEO_MAX_SIDE,
            )
            frame_urls = await asyncio.to_thread(lambda: [image_file_to_data_url(p) for p in frame_paths])
            return build_video_frame_blocks(frame_urls, fps)

        raise ValueError("video 字段需要是帧列表或视频来源字符串")

    return None


async def maybe_rewrite_video_request(req_j: dict, request_path: str) -> tuple[dict, str | None, bool]:
    if not VIDEO_ADAPTER_ENABLED:
        return req_j, None, False

    normalized_path = request_path.lstrip("/")
    if not (normalized_path.startswith("v1/chat/completions") or normalized_path.startswith("chat/completions")):
        return req_j, None, False

    messages = req_j.get("messages")
    if not isinstance(messages, list):
        return req_j, None, False

    workdir = None
    changed = False

    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue

        new_content = []
        for block in content:
            if not isinstance(block, dict):
                new_content.append(block)
                continue

            transformed = None
            if block.get("type") in {"video_url", "video"} or "video_url" in block or "video" in block:
                if workdir is None:
                    workdir = tempfile.mkdtemp(prefix="video_req_", dir=VIDEO_TMP_DIR)
                transformed = await maybe_transform_video_block(block, workdir)

            if transformed is None:
                new_content.append(block)
            else:
                new_content.extend(transformed)
                changed = True

        msg["content"] = new_content

    return req_j, workdir, changed


def cleanup_video_workdir(workdir: str | None) -> None:
    if not workdir or VIDEO_KEEP_TEMP:
        return
    try:
        shutil.rmtree(workdir, ignore_errors=True)
    except Exception:
        pass


def parse_sse_event_block(event_text: str, upstream_kind: str, reasoning_parts: list[str], content_parts: list[str]) -> None:
    data_lines = []
    for raw_line in event_text.split("\n"):
        if not raw_line or raw_line.startswith(":"):
            continue
        if raw_line.startswith("data:"):
            data_lines.append(raw_line[5:].lstrip())

    if not data_lines:
        return

    payload_text = "\n".join(data_lines).strip()
    if not payload_text or payload_text == "[DONE]":
        return

    try:
        payload = json.loads(payload_text)
    except Exception:
        return

    if upstream_kind == "anthropic":
        parse_anthropic_payload_for_log(payload, reasoning_parts, content_parts)
    else:
        parse_openai_payload_for_log(payload, reasoning_parts, content_parts)


def normalize_anthropic_sse_event(event_text: str) -> bytes | None:
    lines = []
    data_lines = []

    for raw_line in event_text.split("\n"):
        if not raw_line:
            continue
        if raw_line.startswith(":"):
            continue
        if raw_line.startswith("data:"):
            data_lines.append(raw_line[5:].lstrip())
        elif raw_line.startswith("event:"):
            lines.append(raw_line)

    if not data_lines:
        return None

    payload_text = "\n".join(data_lines).strip()
    if not payload_text or payload_text == "[DONE]":
        return None

    for item in data_lines:
        lines.append(f"data: {item}")

    return ("\n".join(lines) + "\n\n").encode("utf-8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global llama_process, SERVICE_STARTED_AT, _http_local, _http_cloud

    os.environ.setdefault("UPSTREAM_OPENAI_API_KEY", UPSTREAM_OPENAI_API_KEY)
    SERVICE_STARTED_AT = time.time()

    try:
        runtime_cfg = summarize_runtime_config()
        print("\n🚀 正在启动 llama-server ...")
        print(
            "🧩 当前实参: "
            f"model={runtime_cfg['llama']['model_file']} | "
            f"ctx={runtime_cfg['llama']['ctx_size']} | "
            f"n_predict={runtime_cfg['llama']['n_predict']} | "
            f"parallel={runtime_cfg['llama']['parallel']} | "
            f"llama={runtime_cfg['llama']['url']} | proxy={runtime_cfg['proxy']['url']}"
        )
        kill_existing_listener_on_port(LLAMA_PORT, label="llama-server")
        llama_cmd = build_llama_cmd()
        llama_process = subprocess.Popen(llama_cmd, start_new_session=True)

        await wait_process_http_ready("llama-server", f"{TARGET_URL}/health", llama_process, timeout_sec=240.0, ok_statuses=(200,))
        print(f"✅ llama-server 已就绪: {TARGET_URL}")
        print(f"✅ Proxy 准备监听: http://127.0.0.1:{PROXY_PORT}")
        print(f"✅ 日志页面: http://127.0.0.1:{PROXY_PORT}/logs")
        print(f"✅ 健康检查: http://127.0.0.1:{PROXY_PORT}/healthz")

        _http_local = httpx.AsyncClient(timeout=None, trust_env=False)
        _http_cloud = httpx.AsyncClient(timeout=None, trust_env=True)

        async def watchdog():
            await asyncio.sleep(20)
            while True:
                try:
                    if llama_process and llama_process.poll() is not None:
                        raise RuntimeError("llama-server exited")

                    llama_res = await _http_local.get(f"{TARGET_URL}/health", timeout=5.0)
                    if llama_res.status_code != 200:
                        raise RuntimeError(f"llama health failed: {llama_res.status_code}")
                except Exception as ex:
                    print(f"❌ watchdog 检测失败，准备关闭服务: {ex}", file=sys.stderr)
                    cleanup_child_processes()
                    os.kill(os.getpid(), signal.SIGTERM)
                    return

                await asyncio.sleep(30)

        asyncio.create_task(watchdog())

        try:
            yield
        finally:
            await _http_local.aclose()
            await _http_cloud.aclose()
            _http_local = None
            _http_cloud = None
            cleanup_child_processes()
    except Exception:
        if _http_local:
            await _http_local.aclose()
        if _http_cloud:
            await _http_cloud.aclose()
        _http_local = None
        _http_cloud = None
        cleanup_child_processes()
        raise



app = FastAPI(lifespan=lifespan)


# ==========================================
# 2. 响应式 UI 渲染
# ==========================================

def _read_log_page(page: int, size: int) -> tuple[list[dict], int]:
    if not os.path.exists(HISTORY_LOG_FILE):
        return [], 0
    with open(HISTORY_LOG_FILE, "r", encoding="utf-8") as f:
        all_lines = f.readlines()
    total = len(all_lines)
    if total == 0:
        return [], 0
    all_lines.reverse()
    start = (page - 1) * size
    end = start + size
    entries = []
    for line in all_lines[start:end]:
        try:
            e = json.loads(line)
            req_raw = e.get("request_raw", {})
            resp_raw = e.get("response_raw", {})
            messages = build_display_messages(req_raw)
            parsed_msgs = []
            for msg in messages:
                role = msg.get("role", "unknown")
                raw_content = extract_content(msg.get("content", ""))
                if role == "user":
                    parsed_body = parse_user_content_html(raw_content)
                else:
                    parsed_body = html.escape(raw_content)
                parsed_msgs.append({"role": role, "body": parsed_body})
            entries.append({
                "timestamp": e.get("timestamp", ""),
                "duration_sec": e.get("duration_sec", 0),
                "path": e.get("path", "-"),
                "upstream": e.get("upstream", "-"),
                "request_model": get_request_model(req_raw),
                "request_kind": detect_request_kind(req_raw, e.get("path", "-")),
                "messages": parsed_msgs,
                "reasoning": resp_raw.get("reasoning", ""),
                "content": resp_raw.get("content", ""),
                "request_raw": req_raw,
                "response_raw": resp_raw,
            })
        except Exception:
            pass
    return entries, total


@app.get("/api/logs", response_class=JSONResponse)
async def api_logs(page: int = 1, size: int = 10):
    entries, total = _read_log_page(page, size)
    return JSONResponse({
        "entries": entries,
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
    })


@app.get("/logs", response_class=HTMLResponse)
async def view_logs():
    return HTMLResponse("""<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LM Core Monitor</title>
<style>
:root{--preview-lines:3;--preview-h:calc(var(--preview-lines) * 1.6em)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:#0d1117}
::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#484f58}

.shell{padding:24px 20px}

/* header */
.hdr{text-align:center;padding:32px 0 24px;border-bottom:1px solid #21262d;margin-bottom:24px}
.hdr h1{font-size:22px;font-weight:600;color:#e6edf3;letter-spacing:.3px}
.hdr p{font-size:13px;color:#8b949e;margin-top:4px}

/* toolbar */
.toolbar{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
.toolbar input[type=text]{flex:1;min-width:200px;padding:8px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;outline:none;transition:border-color .2s}
.toolbar input[type=text]:focus{border-color:#388bfd}
.toolbar select{padding:8px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;outline:none;cursor:pointer}
.toolbar .stats{font-size:12px;color:#8b949e;margin-left:auto;white-space:nowrap}

/* pagination */
.pager{display:flex;justify-content:center;align-items:center;gap:6px;padding:20px 0}
.pager button{padding:6px 14px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;cursor:pointer;transition:all .15s}
.pager button:hover:not(:disabled){background:#30363d;border-color:#484f58}
.pager button:disabled{opacity:.4;cursor:default}
.pager button.cur{background:#388bfd;border-color:#388bfd;color:#fff;font-weight:600}
.pager .info{font-size:12px;color:#8b949e;margin:0 8px}

/* log card */
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;margin-bottom:16px;overflow:hidden;transition:border-color .2s}
.card:hover{border-color:#484f58}
.card-meta{display:flex;gap:16px;padding:14px 16px;font-size:12px;color:#8b949e;border-bottom:1px solid #21262d;flex-wrap:wrap;align-items:center}
.card-meta .tag{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}
.tag-local{background:rgba(56,139,253,.15);color:#58a6ff}
.tag-cloud{background:rgba(163,113,247,.15);color:#d2a8ff}
.tag-model{background:rgba(63,185,80,.12);color:#7ee787}
.tag-kind{background:rgba(210,168,255,.12);color:#d2a8ff}

/* blocks */
.blk{margin:8px;border-radius:6px;border:1px solid #30363d;background:#0d1117;overflow:hidden;position:relative}
.blk:last-child{margin-bottom:12px}
.blk-h{padding:8px 12px;font-size:11px;font-weight:600;letter-spacing:.5px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;transition:background .15s}
.blk-h:hover{background:#161b22}
.blk-b{padding:12px;font-size:13px;white-space:pre-wrap;word-wrap:break-word;overflow:hidden;max-height:var(--preview-h);position:relative;transition:max-height .3s ease}
.blk:not(.open)>.blk-b::after{content:"";position:absolute;bottom:0;left:0;width:100%;height:2em;background:linear-gradient(transparent,#0d1117);pointer-events:none}
.blk.open>.blk-b{max-height:40000px;padding-bottom:24px}
.blk-h::after{content:"\\5C55\\5F00 \\25BC";font-size:10px;opacity:.5}
.blk.open>.blk-h::after{content:"\\6536\\8D77 \\25B2"}

/* block colors */
.b-inputs .blk-h{color:#58a6ff} .b-inputs{border-left:3px solid #388bfd}
.b-system .blk-h{color:#f0883e} .b-system{border-left:3px solid #cb4b16}
.b-user .blk-h{color:#39c5cf} .b-user{border-left:3px solid #00aba9}
.b-assistant .blk-h{color:#d2a8ff} .b-assistant{border-left:3px solid #8957e5}
.b-think .blk-h{color:#ff7b72;font-style:italic} .b-think{border-left:3px solid #db61a2}
.b-resp .blk-h{color:#7ee787} .b-resp{border-left:3px solid #3fb950}
.b-raw .blk-h{color:#e3b341} .b-raw{border-left:3px solid #d29922}
.b-raw-req .blk-h{color:#d2a8ff} .b-raw-req{border-left:3px solid #a371f7}
.b-raw-resp .blk-h{color:#7ee787} .b-raw-resp{border-left:3px solid #3fb950}

.raw-pre{background:transparent;border:none;padding:0;margin:0;font-family:'Consolas','Monaco',monospace;font-size:12px;overflow:auto;white-space:pre;max-height:60vh}
.json-key{color:#79c0ff}.json-string{color:#a5d6ff}.json-number{color:#d2a8ff}.json-boolean{color:#ff7b72}.json-null{color:#8b949e;font-style:italic}

/* inner msg blocks in INPUTS */
.blk-b .blk{margin:4px 0}
.b-inputs>.blk-b,.b-raw>.blk-b{white-space:normal;max-height:none}
.b-inputs:not(.open)>.blk-b,.b-raw:not(.open)>.blk-b{max-height:var(--preview-h)}
.b-inputs.open>.blk-b,.b-raw.open>.blk-b{max-height:none}

/* loading & empty */
.loading{text-align:center;padding:60px 0;color:#8b949e;font-size:14px}
.empty{text-align:center;padding:60px 0;color:#484f58;font-size:14px}

@media(max-width:640px){
  .shell{padding:12px 8px}
  .card-meta{gap:8px;padding:10px 12px}
  .toolbar{flex-direction:column}
  .toolbar .stats{margin-left:0}
}
</style>
</head>
<body>
<div class="shell">
  <div class="hdr">
    <h1>LM Core Monitor</h1>
    <p id="subtitle"></p>
  </div>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Search logs..." oninput="onSearch()">
    <select id="previewLines" onchange="onPreviewChange()">
      <option value="2">2 lines</option>
      <option value="3" selected>3 lines</option>
      <option value="5">5 lines</option>
      <option value="8">8 lines</option>
      <option value="15">15 lines</option>
    </select>
    <select id="pageSize" onchange="onPageSizeChange()">
      <option value="5">5 / page</option>
      <option value="10" selected>10 / page</option>
      <option value="20">20 / page</option>
      <option value="50">50 / page</option>
    </select>
    <span class="stats" id="stats"></span>
  </div>
  <div id="logs"></div>
  <div class="pager" id="pager"></div>
</div>

<script>
let state={page:1,size:10,pages:0,total:0,entries:[],q:""};
const $=id=>document.getElementById(id);

async function load(){
  $("logs").innerHTML='<div class="loading">Loading...</div>';
  try{
    const r=await fetch(`/api/logs?page=${state.page}&size=${state.size}`);
    const d=await r.json();
    state.entries=d.entries;state.total=d.total;state.pages=d.pages;
    render();
  }catch(e){
    $("logs").innerHTML='<div class="empty">Failed to load logs</div>';
  }
}

function esc(s){
  if(!s)return"";
  const d=document.createElement("div");d.textContent=s;return d.innerHTML;
}

function highlightJson(text){
  return text.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,function(m){
    let c="json-number";
    if(/^"/.test(m)){c=/:$/.test(m)?"json-key":"json-string"}
    else if(/true|false/.test(m))c="json-boolean";
    else if(/null/.test(m))c="json-null";
    return'<span class="'+c+'">'+m+"</span>";
  });
}

function mkBlk(cls,title,body,startOpen){
  return`<div class="blk b-${cls}${startOpen?" open":""}"><div class="blk-h" onclick="this.parentElement.classList.toggle('open')">${title}</div><div class="blk-b">${body}</div></div>`;
}

function renderEntry(e){
  const upstream=e.upstream||"-";
  const tagCls=upstream.startsWith("local")?"tag-local":"tag-cloud";
  const requestModel=e.request_model||"-";
  const requestKind=e.request_kind||"request";
  let h=`<div class="card"><div class="card-meta">`;
  h+=`<span>${esc(e.timestamp)}</span>`;
  h+=`<span>${e.duration_sec}s</span>`;
  h+=`<span>${esc(e.path)}</span>`;
  h+=`<span class="tag tag-model">model=${esc(requestModel)}</span>`;
  h+=`<span class="tag tag-kind">${esc(requestKind)}</span>`;
  h+=`<span class="tag ${tagCls}">${esc(upstream)}</span>`;
  h+=`</div>`;

  // INPUTS
  let inputsBody="";
  (e.messages||[]).forEach(m=>{
    inputsBody+=mkBlk(m.role,m.role.toUpperCase(),`<div>${m.body}</div>`,false);
  });
  h+=mkBlk("inputs","INPUTS",inputsBody,false);

  // REASONING
  if(e.reasoning){
    h+=mkBlk("think","REASONING",`<div>${esc(e.reasoning)}</div>`,false);
  }

  // FINAL OUTPUT
  h+=mkBlk("resp","OUTPUT",`<div>${esc(e.content)}</div>`,true);

  // RAW DATA
  const reqJson=highlightJson(esc(JSON.stringify(e.request_raw,null,2)));
  const respJson=highlightJson(esc(JSON.stringify(e.response_raw,null,2)));
  const rawBody=mkBlk("raw-req","RAW REQUEST",`<pre class="raw-pre"><code>${reqJson}</code></pre>`,false)
               +mkBlk("raw-resp","RAW RESPONSE",`<pre class="raw-pre"><code>${respJson}</code></pre>`,false);
  h+=mkBlk("raw","RAW DATA",rawBody,false);

  h+=`</div>`;
  return h;
}

function render(){
  $("subtitle").textContent=`${state.total} entries`;
  $("stats").textContent=`Page ${state.page} of ${state.pages}`;

  let entries=state.entries;
  if(state.q){
    const q=state.q.toLowerCase();
    entries=entries.filter(e=>{
      const txt=JSON.stringify(e).toLowerCase();
      return txt.includes(q);
    });
  }

  if(!entries.length){
    $("logs").innerHTML='<div class="empty">No matching logs</div>';
  }else{
    $("logs").innerHTML=entries.map(renderEntry).join("");
  }

  // pager
  let pg="";
  pg+=`<button onclick="go(1)" ${state.page<=1?"disabled":""}>&#171;</button>`;
  pg+=`<button onclick="go(${state.page-1})" ${state.page<=1?"disabled":""}>&#8249;</button>`;

  const maxBtns=5;
  let start=Math.max(1,state.page-Math.floor(maxBtns/2));
  let end=Math.min(state.pages,start+maxBtns-1);
  start=Math.max(1,end-maxBtns+1);
  for(let i=start;i<=end;i++){
    pg+=`<button onclick="go(${i})" class="${i===state.page?"cur":""}">${i}</button>`;
  }

  pg+=`<button onclick="go(${state.page+1})" ${state.page>=state.pages?"disabled":""}>&#8250;</button>`;
  pg+=`<button onclick="go(${state.pages})" ${state.page>=state.pages?"disabled":""}>&#187;</button>`;
  $("pager").innerHTML=pg;
}

function go(p){
  if(p<1||p>state.pages||p===state.page)return;
  state.page=p;load();
  window.scrollTo({top:0,behavior:"smooth"});
}

function onSearch(){state.q=$("search").value;render();}
function onPageSizeChange(){state.size=parseInt($("pageSize").value);state.page=1;load();}
function onPreviewChange(){document.documentElement.style.setProperty("--preview-lines",$("previewLines").value);}

load();
</script>
</body></html>""")


@app.get("/runtime-config", response_class=JSONResponse)
async def runtime_config():
    return JSONResponse(build_runtime_config())


@app.get("/healthz", response_class=JSONResponse)
async def healthz():
    result = {
        "proxy": "ok",
        "started_at": SERVICE_STARTED_AT,
        "llama_port": LLAMA_PORT,
        "proxy_port": PROXY_PORT,
        "local_model_name": LOCAL_MODEL_NAME,
        "upstream_model_name": UPSTREAM_MODEL_NAME,
        "display_model_name": DISPLAY_MODEL_NAME,
        "video_adapter": {
            "enabled": VIDEO_ADAPTER_ENABLED,
            "default_fps": VIDEO_DEFAULT_FPS,
            "max_frames": VIDEO_MAX_FRAMES,
            "max_side": VIDEO_MAX_SIDE,
            "keep_temp": VIDEO_KEEP_TEMP,
            "tmp_dir": VIDEO_TMP_DIR,
        },
        "runtime": summarize_runtime_config(),
        "pids": {
            "proxy": os.getpid(),
            "llama": llama_process.pid if llama_process and llama_process.poll() is None else None,
        },
    }

    async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
        try:
            llama_res = await client.get(f"{TARGET_URL}/health")
            result["llama_status"] = llama_res.status_code
        except Exception as ex:
            result["llama_status"] = repr(ex)

    return JSONResponse(result)


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_handler(request: Request, path: str):
    start_t = time.time()
    upstream_kind = "openai"
    upstream_provider = "local"

    body = await request.body()
    video_workdir = None
    try:
        req_j = json.loads(body) if body else {}
    except Exception:
        req_j = {}

    if isinstance(req_j, dict):
        try:
            req_j, video_workdir, video_rewritten = await maybe_rewrite_video_request(req_j, path)
            original_model = get_request_model(req_j)
            req_j = maybe_rewrite_model_for_local(req_j)
            req_j = maybe_rewrite_model_for_cloud(req_j)
            req_j = maybe_normalize_cloud_reasoning(req_j)
            req_j, stripped_thinking_blocks, dropped_history_messages = maybe_strip_cloud_history_thinking(req_j)
            model_rewritten = get_request_model(req_j) != original_model
            history_sanitized = stripped_thinking_blocks > 0 or dropped_history_messages > 0
            if body or video_rewritten or model_rewritten or history_sanitized:
                body = json.dumps(req_j, ensure_ascii=False).encode("utf-8")
            if video_rewritten:
                print(f"🎬 video adapter 已接管请求: /{path.lstrip('/')} | workdir={video_workdir}")
            if history_sanitized:
                print(
                    "🧼 cloud history sanitized: "
                    f"removed_blocks={stripped_thinking_blocks} "
                    f"dropped_messages={dropped_history_messages} "
                    f"path=/{path.lstrip('/')}"
                )
        except Exception as ex:
            cleanup_video_workdir(video_workdir)
            error_text = f"video adapter failed: {repr(ex)}"
            save_raw_log(
                req_j=req_j,
                reasoning="",
                content=error_text,
                duration=time.time() - start_t,
                path="/" + path.lstrip("/"),
                upstream=f"{upstream_provider}:{upstream_kind}",
            )
            return JSONResponse(
                status_code=400,
                content={
                    "error": "video_adapter_error",
                    "message": error_text,
                    "upstream": f"{upstream_provider}:{upstream_kind}",
                },
            )

    upstream_base, upstream_kind, upstream_provider = choose_upstream(path, req_j)
    upstream_url = f"{upstream_base}/{path.lstrip('/')}"

    if upstream_provider != "local" and not upstream_base:
        cleanup_video_workdir(video_workdir)
        error_text = f"cloud provider not configured: {upstream_provider}"
        save_raw_log(
            req_j=req_j,
            reasoning="",
            content=error_text,
            duration=time.time() - start_t,
            path="/" + path.lstrip("/"),
            upstream=f"{upstream_provider}:{upstream_kind}",
        )
        return JSONResponse(
            status_code=503,
            content={
                "error": "cloud_provider_unconfigured",
                "message": error_text,
                "upstream": f"{upstream_provider}:{upstream_kind}",
            },
        )

    headers = remove_hop_by_hop_headers(dict(request.headers))
    if upstream_provider != "local":
        cloud_cfg = CLOUD_PROVIDER_CONFIGS.get(upstream_provider, ACTIVE_CLOUD_PROVIDER_CONFIG)
        for key in list(headers.keys()):
            if key.lower() in {"authorization", "x-api-key"}:
                headers.pop(key, None)
        auth_token = cloud_cfg.get("auth_token", "")
        if auth_token:
            auth_header = cloud_cfg.get("auth_header", "Authorization")
            auth_prefix = cloud_cfg.get("auth_prefix", "")
            headers[auth_header] = f"{auth_prefix}{auth_token}"
        for key, value in cloud_cfg.get("extra_headers", {}).items():
            headers.setdefault(key, value)

    client = _http_cloud if upstream_provider != "local" else _http_local
    try:
        upstream_req = client.build_request(
            request.method,
            upstream_url,
            headers=headers,
            params=request.query_params,
            content=body,
        )
        rp_resp = await client.send(upstream_req, stream=True)
    except httpx.HTTPError as ex:
        cleanup_video_workdir(video_workdir)
        error_text = f"upstream request failed: {repr(ex)}"
        save_raw_log(
            req_j=req_j,
            reasoning="",
            content=error_text,
            duration=time.time() - start_t,
            path="/" + path.lstrip("/"),
            upstream=f"{upstream_provider}:{upstream_kind}",
        )
        return JSONResponse(
            status_code=502,
            content={
                "error": "bad_gateway",
                "message": error_text,
                "upstream": f"{upstream_provider}:{upstream_kind}",
            },
        )
    except Exception as ex:
        cleanup_video_workdir(video_workdir)
        error_text = f"proxy internal error: {repr(ex)}"
        save_raw_log(
            req_j=req_j,
            reasoning="",
            content=error_text,
            duration=time.time() - start_t,
            path="/" + path.lstrip("/"),
            upstream=f"{upstream_provider}:{upstream_kind}",
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "proxy_error",
                "message": error_text,
                "upstream": f"{upstream_provider}:{upstream_kind}",
            },
        )

    clean_headers = {
        k: v
        for k, v in rp_resp.headers.items()
        if k.lower() not in ("content-length", "transfer-encoding", "content-encoding", "connection")
    }

    RAW_LOG_MAX_BYTES = 4 * 1024 * 1024  # 非 SSE 响应最多缓存 4MB 用于日志

    async def stream_and_log():
        reasoning_parts = []
        content_parts = []
        raw_b = bytearray()
        raw_b_truncated = False

        is_sse = "text/event-stream" in rp_resp.headers.get("content-type", "").lower()
        normalize_anthropic_sse = is_sse and upstream_kind == "anthropic" and upstream_provider == "or"
        sse_buffer = ""
        sse_decoder = codecs.getincrementaldecoder("utf-8")() if is_sse else None

        try:
            async for chunk in rp_resp.aiter_bytes():
                if is_sse:
                    sse_buffer += sse_decoder.decode(chunk)
                    sse_buffer = sse_buffer.replace("\r\n", "\n")
                    while "\n\n" in sse_buffer:
                        event_text, sse_buffer = sse_buffer.split("\n\n", 1)
                        if normalize_anthropic_sse:
                            normalized = normalize_anthropic_sse_event(event_text)
                            if normalized is not None:
                                yield normalized
                        else:
                            yield (event_text + "\n\n").encode("utf-8")
                        parse_sse_event_block(event_text, upstream_kind, reasoning_parts, content_parts)
                else:
                    yield chunk
                    if not raw_b_truncated:
                        if len(raw_b) + len(chunk) > RAW_LOG_MAX_BYTES:
                            raw_b_truncated = True
                        else:
                            raw_b.extend(chunk)

            # SSE 尾部处理：flush decoder 并处理剩余 buffer
            if is_sse:
                sse_buffer += sse_decoder.decode(b"", final=True)
                sse_buffer = sse_buffer.replace("\r\n", "\n")
                while "\n\n" in sse_buffer:
                    event_text, sse_buffer = sse_buffer.split("\n\n", 1)
                    if normalize_anthropic_sse:
                        normalized = normalize_anthropic_sse_event(event_text)
                        if normalized is not None:
                            yield normalized
                    else:
                        yield (event_text + "\n\n").encode("utf-8")
                    parse_sse_event_block(event_text, upstream_kind, reasoning_parts, content_parts)
                if sse_buffer.strip():
                    if normalize_anthropic_sse:
                        normalized = normalize_anthropic_sse_event(sse_buffer)
                        if normalized is not None:
                            yield normalized
                    else:
                        yield (sse_buffer + "\n\n").encode("utf-8")
                    parse_sse_event_block(sse_buffer, upstream_kind, reasoning_parts, content_parts)
            elif raw_b and not raw_b_truncated:
                try:
                    payload = json.loads(raw_b.decode(errors="ignore"))
                    if upstream_kind == "anthropic":
                        parse_anthropic_payload_for_log(payload, reasoning_parts, content_parts)
                    else:
                        parse_openai_payload_for_log(payload, reasoning_parts, content_parts)
                except Exception:
                    content_parts.append(raw_b.decode(errors="ignore"))
        finally:
            try:
                save_raw_log(
                    req_j=req_j,
                    reasoning="".join(reasoning_parts),
                    content="".join(content_parts),
                    duration=time.time() - start_t,
                    path="/" + path.lstrip("/"),
                    upstream=f"{upstream_provider}:{upstream_kind}",
                )
            finally:
                await rp_resp.aclose()
                cleanup_video_workdir(video_workdir)

    return StreamingResponse(stream_and_log(), status_code=rp_resp.status_code, headers=clean_headers)


if __name__ == "__main__":
    kill_existing_listener_on_port(PROXY_PORT, label="proxy")
    print(f"🌐 Proxy 目标端口: http://127.0.0.1:{PROXY_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PROXY_PORT, log_level="info", access_log=False)
