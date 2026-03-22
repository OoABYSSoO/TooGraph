from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


DEFAULT_VIDEO_FRAME_COUNT = 8
MAX_VIDEO_FRAME_COUNT = 16
VIDEO_FALLBACK_ERROR_MARKERS = (
    "video",
    "video_url",
    "input_video",
    "unsupported content",
    "unsupported input",
    "unsupported media",
    "unsupported file",
    "invalid content",
    "invalid image",
    "file too large",
    "payload too large",
    "request too large",
    "context size",
    "maximum context",
    "exceeds",
)


def has_video_attachments(input_attachments: list[dict[str, Any]] | None) -> bool:
    return any(_attachment_type(item) == "video" for item in input_attachments or [])


def should_fallback_video_to_frames(exc: Exception, input_attachments: list[dict[str, Any]] | None) -> bool:
    if not has_video_attachments(input_attachments):
        return False
    message = str(exc or "").lower()
    return any(marker in message for marker in VIDEO_FALLBACK_ERROR_MARKERS)


def build_video_frame_fallback_attachments(
    input_attachments: list[dict[str, Any]] | None,
    *,
    frame_count: int = DEFAULT_VIDEO_FRAME_COUNT,
    output_dir: str | Path | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    fallback_attachments: list[dict[str, Any]] = []
    video_count = 0
    generated_frame_count = 0
    frame_root = Path(output_dir) if output_dir is not None else None
    for attachment in input_attachments or []:
        if _attachment_type(attachment) != "video":
            fallback_attachments.append(attachment)
            continue
        video_count += 1
        video_output_dir = frame_root / f"video_{video_count:03d}" if frame_root is not None else None
        frames = extract_video_frame_attachments(attachment, frame_count=frame_count, output_dir=video_output_dir)
        generated_frame_count += len(frames)
        fallback_attachments.extend(frames)
    if video_count and generated_frame_count == 0:
        raise RuntimeError("Video frame fallback did not extract any frames.")
    return fallback_attachments, {
        "used": bool(video_count),
        "video_count": video_count,
        "frame_count": generated_frame_count,
        "strategy": "native_video_then_frames",
    }


def extract_video_frame_attachments(
    attachment: dict[str, Any],
    *,
    frame_count: int = DEFAULT_VIDEO_FRAME_COUNT,
    output_dir: str | Path | None = None,
) -> list[dict[str, Any]]:
    source_path = _resolve_source_video_path(attachment)
    if source_path is None:
        raise RuntimeError("Video fallback requires a local filesystem path or file:// video attachment.")

    requested_frame_count = max(1, min(int(frame_count or DEFAULT_VIDEO_FRAME_COUNT), MAX_VIDEO_FRAME_COUNT))
    frame_dir = Path(output_dir) if output_dir is not None else Path(tempfile.mkdtemp(prefix="graphite_video_frames_"))
    frame_dir.mkdir(parents=True, exist_ok=True)
    duration = _probe_video_duration(source_path)
    frame_paths = _extract_frame_files(source_path, frame_dir, duration=duration, frame_count=requested_frame_count)
    return [
        _build_frame_attachment(attachment, frame_path, index=index, timestamp=_frame_timestamp(duration, index, len(frame_paths)))
        for index, frame_path in enumerate(frame_paths, start=1)
    ]


def _resolve_source_video_path(attachment: dict[str, Any]) -> Path | None:
    filesystem_path = str(attachment.get("filesystem_path") or "").strip()
    if not filesystem_path:
        file_url = str(attachment.get("file_url") or attachment.get("url") or "").strip()
        parsed = urlparse(file_url)
        if parsed.scheme != "file" or not parsed.path:
            return None
        filesystem_path = unquote(parsed.path)
    path = Path(filesystem_path)
    if not path.is_file():
        raise RuntimeError("Video fallback local filesystem path does not exist.")
    mime_type = str(attachment.get("mime_type") or "").strip().lower()
    if mime_type and not mime_type.startswith("video/"):
        raise RuntimeError("Video fallback local filesystem path must reference a video attachment.")
    return path


def _extract_frame_files(
    video_path: Path,
    frame_dir: Path,
    *,
    duration: float | None,
    frame_count: int,
) -> list[Path]:
    frame_paths: list[Path] = []
    if duration is not None and duration > 0:
        for index in range(1, frame_count + 1):
            timestamp = _frame_timestamp(duration, index, frame_count)
            frame_path = frame_dir / f"frame_{index:03d}.jpg"
            command = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-y",
                str(frame_path),
            ]
            _run_media_command(command)
            if frame_path.is_file() and frame_path.stat().st_size > 0:
                frame_paths.append(frame_path)
        if frame_paths:
            return frame_paths

    pattern = frame_dir / "frame_%03d.jpg"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-vf",
        "fps=1",
        "-frames:v",
        str(frame_count),
        "-y",
        str(pattern),
    ]
    _run_media_command(command)
    return sorted(path for path in frame_dir.glob("frame_*.jpg") if path.stat().st_size > 0)[:frame_count]


def _probe_video_duration(video_path: Path) -> float | None:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(video_path),
    ]
    try:
        completed = subprocess.run(command, text=True, capture_output=True, timeout=10, check=False)
    except OSError:
        return None
    if completed.returncode != 0:
        return None
    try:
        payload = json.loads(completed.stdout or "{}")
        duration = float(payload.get("format", {}).get("duration") or 0)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return duration if duration > 0 else None


def _build_frame_attachment(
    video_attachment: dict[str, Any],
    frame_path: Path,
    *,
    index: int,
    timestamp: float | None,
) -> dict[str, Any]:
    resolved_frame_path = frame_path.resolve()
    state_key = str(video_attachment.get("state_key") or "video").strip() or "video"
    name_stem = Path(str(video_attachment.get("name") or state_key)).stem or state_key
    return {
        "type": "image",
        "state_key": f"{state_key}#frame_{index:03d}",
        "name": f"{name_stem}_frame_{index:03d}.jpg",
        "mime_type": "image/jpeg",
        "filesystem_path": str(resolved_frame_path),
        "file_url": resolved_frame_path.as_uri(),
        "source": {
            "type": "video_frame",
            "video_state_key": state_key,
            "timestamp_seconds": timestamp,
        },
    }


def _run_media_command(command: list[str]) -> None:
    try:
        completed = subprocess.run(command, text=True, capture_output=True, timeout=30, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg and ffprobe are required for video frame fallback.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Video frame extraction timed out.") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown ffmpeg error").strip()
        raise RuntimeError(f"Video frame extraction failed: {detail[:600]}")


def _frame_timestamp(duration: float | None, index: int, frame_count: int) -> float | None:
    if duration is None or duration <= 0 or frame_count <= 0:
        return None
    return duration * index / (frame_count + 1)


def _attachment_type(attachment: dict[str, Any]) -> str:
    return str(attachment.get("type") or "").strip().lower() if isinstance(attachment, dict) else ""
