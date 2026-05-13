from __future__ import annotations

import importlib
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_RUNTIME_TOOLS_DIR = BACKEND_DIR / "data" / "runtime_tools"
IMAGEIO_FFMPEG_REQUIREMENT = "imageio-ffmpeg>=0.6,<1.0"
AUTO_INSTALL_ENV = "TOOGRAPH_AUTO_INSTALL_FFMPEG"


@dataclass(frozen=True)
class FfmpegTools:
    ffmpeg: str
    ffprobe: str | None
    source: str


RunFunc = Callable[..., subprocess.CompletedProcess[str]]
WhichFunc = Callable[[str], str | None]
InstallFunc = Callable[..., FfmpegTools | None]


def resolve_ffmpeg_tools(
    *,
    auto_install: bool | None = None,
    runtime_root: str | Path | None = None,
    platform_tag: str | None = None,
    which_func: WhichFunc = shutil.which,
    run_func: RunFunc = subprocess.run,
    install_func: InstallFunc | None = None,
    environ: Mapping[str, str] | None = None,
) -> FfmpegTools:
    env = os.environ if environ is None else environ
    root = Path(runtime_root) if runtime_root is not None else DEFAULT_RUNTIME_TOOLS_DIR
    tag = platform_tag or _platform_tag()

    explicit = _resolve_explicit_tools(env, run_func=run_func)
    if explicit is not None:
        return explicit

    system = _resolve_system_tools(which_func=which_func, run_func=run_func)
    if system is not None:
        return system

    private = _resolve_private_tools(root, platform_tag=tag, run_func=run_func)
    if private is not None:
        return private

    packaged = _resolve_imageio_ffmpeg(root, run_func=run_func)
    if packaged is not None:
        return packaged

    if _auto_install_enabled(auto_install, env):
        installer = install_func or install_imageio_ffmpeg
        installed = installer(root, run_func=run_func)
        if installed is not None and _is_valid_executable(installed.ffmpeg, run_func=run_func):
            return installed

    raise RuntimeError(
        "ffmpeg is required for video frame fallback. Install ffmpeg, place an app-private ffmpeg binary under "
        f"{root / 'ffmpeg' / tag}, or set {AUTO_INSTALL_ENV}=1 to allow TooGraph to install a private runtime package."
    )


def install_imageio_ffmpeg(
    runtime_root: str | Path,
    *,
    run_func: RunFunc = subprocess.run,
) -> FfmpegTools | None:
    root = Path(runtime_root)
    target_dir = root / "python"
    target_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--upgrade",
        "--target",
        str(target_dir),
        IMAGEIO_FFMPEG_REQUIREMENT,
    ]
    try:
        completed = run_func(command, text=True, capture_output=True, timeout=300, check=False)
    except OSError as exc:
        raise RuntimeError(f"Private ffmpeg runtime install failed: {exc}") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown pip error").strip()
        raise RuntimeError(f"Private ffmpeg runtime install failed: {detail[:600]}")
    return _resolve_imageio_ffmpeg(root, run_func=run_func)


def _resolve_explicit_tools(env: Mapping[str, str], *, run_func: RunFunc) -> FfmpegTools | None:
    ffmpeg = _first_env_path(env, "TOOGRAPH_FFMPEG_PATH", "TOOGRAPH_FFMPEG")
    ffprobe = _first_env_path(env, "TOOGRAPH_FFPROBE_PATH", "TOOGRAPH_FFPROBE")
    if not ffmpeg:
        return None
    if not _is_valid_executable(ffmpeg, run_func=run_func):
        raise RuntimeError(f"Configured ffmpeg path is not executable: {ffmpeg}")
    if ffprobe and not _is_valid_executable(ffprobe, run_func=run_func):
        raise RuntimeError(f"Configured ffprobe path is not executable: {ffprobe}")
    return FfmpegTools(ffmpeg=ffmpeg, ffprobe=ffprobe or None, source="env")


def _resolve_system_tools(*, which_func: WhichFunc, run_func: RunFunc) -> FfmpegTools | None:
    ffmpeg = which_func("ffmpeg")
    if not ffmpeg or not _is_valid_executable(ffmpeg, run_func=run_func):
        return None
    ffprobe = which_func("ffprobe")
    if ffprobe and not _is_valid_executable(ffprobe, run_func=run_func):
        ffprobe = None
    return FfmpegTools(ffmpeg=ffmpeg, ffprobe=ffprobe, source="system")


def _resolve_private_tools(root: Path, *, platform_tag: str, run_func: RunFunc) -> FfmpegTools | None:
    executable_suffix = ".exe" if sys.platform == "win32" else ""
    candidate_dirs = [
        root / "ffmpeg" / platform_tag,
        root / "ffmpeg" / platform_tag / "bin",
        root / "ffmpeg" / "bin",
        root / "ffmpeg",
    ]
    for candidate_dir in candidate_dirs:
        ffmpeg = candidate_dir / f"ffmpeg{executable_suffix}"
        if not ffmpeg.is_file() or not _is_valid_executable(str(ffmpeg), run_func=run_func):
            continue
        ffprobe_path = candidate_dir / f"ffprobe{executable_suffix}"
        ffprobe = str(ffprobe_path) if ffprobe_path.is_file() and _is_valid_executable(str(ffprobe_path), run_func=run_func) else None
        return FfmpegTools(ffmpeg=str(ffmpeg), ffprobe=ffprobe, source="private")
    return None


def _resolve_imageio_ffmpeg(root: Path, *, run_func: RunFunc) -> FfmpegTools | None:
    module = _import_imageio_ffmpeg(root / "python")
    if module is None:
        return None
    try:
        ffmpeg = str(module.get_ffmpeg_exe())
    except Exception:
        return None
    if not ffmpeg or not _is_valid_executable(ffmpeg, run_func=run_func):
        return None
    return FfmpegTools(ffmpeg=ffmpeg, ffprobe=None, source="imageio-ffmpeg")


def _import_imageio_ffmpeg(target_dir: Path) -> Any | None:
    if target_dir.is_dir():
        target = str(target_dir)
        if target not in sys.path:
            sys.path.insert(0, target)
    try:
        return importlib.import_module("imageio_ffmpeg")
    except Exception:
        return None


def _is_valid_executable(command: str, *, run_func: RunFunc) -> bool:
    try:
        completed = run_func([command, "-version"], text=True, capture_output=True, timeout=5, check=False)
    except (OSError, subprocess.SubprocessError):
        return False
    return int(getattr(completed, "returncode", 1)) == 0


def _first_env_path(env: Mapping[str, str], *keys: str) -> str:
    for key in keys:
        value = str(env.get(key) or "").strip()
        if value:
            return value
    return ""


def _auto_install_enabled(auto_install: bool | None, env: Mapping[str, str]) -> bool:
    if auto_install is not None:
        return bool(auto_install)
    value = str(env.get(AUTO_INSTALL_ENV) or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _platform_tag() -> str:
    system = platform.system().lower() or sys.platform
    machine = platform.machine().lower() or "unknown"
    normalized_machine = {
        "amd64": "x86_64",
        "x64": "x86_64",
        "arm64": "aarch64",
    }.get(machine, machine)
    return f"{system}-{normalized_machine}"
