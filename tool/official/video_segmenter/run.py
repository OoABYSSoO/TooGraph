from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse


DEFAULT_SEGMENT_SECONDS = 30.0
MIN_SEGMENT_SECONDS = 0.1
OUTPUT_MIME_TYPE = "video/mp4"


class VideoSegmenterError(RuntimeError):
    def __init__(self, error_type: str, message: str):
        super().__init__(message)
        self.error_type = error_type


def video_segmenter(video: Any, *, segment_seconds: float = DEFAULT_SEGMENT_SECONDS) -> dict[str, Any]:
    try:
        return _segment_video(video, segment_seconds=segment_seconds)
    except VideoSegmenterError as exc:
        return _failed_result(exc.error_type, str(exc))
    except Exception as exc:
        return _failed_result("video_segmenter_error", str(exc))


def _segment_video(video: Any, *, segment_seconds: float) -> dict[str, Any]:
    if not _is_positive_number(segment_seconds) or float(segment_seconds) < MIN_SEGMENT_SECONDS:
        raise VideoSegmenterError("invalid_segment_seconds", "Segment length must be a positive number.")

    backend_root = _ensure_backend_on_sys_path()
    source_path = _resolve_video_path(video, backend_root=backend_root)

    from app.tools.ffmpeg_resolver import resolve_ffmpeg_tools
    from app.tools.video_frame_fallback import probe_video_duration_seconds

    duration = probe_video_duration_seconds(source_path)
    if duration is None or duration <= 0:
        raise VideoSegmenterError("duration_probe_failed", "Could not determine the video duration.")

    tools = resolve_ffmpeg_tools()
    artifact_dir = _resolve_artifact_dir()
    artifact_relative_dir = _artifact_relative_dir()
    segments: list[dict[str, Any]] = []
    segment_length = float(segment_seconds)
    segment_count = max(1, int(math.ceil(duration / segment_length)))

    for index in range(segment_count):
        start_sec = index * segment_length
        if start_sec >= duration:
            break
        end_sec = min((index + 1) * segment_length, duration)
        output_path = artifact_dir / f"segment_{index:03d}.mp4"
        _write_segment(
            ffmpeg=tools.ffmpeg,
            source_path=source_path,
            output_path=output_path,
            start_sec=start_sec,
            duration_sec=end_sec - start_sec,
        )
        segments.append(
            {
                "index": index,
                "start_sec": _round_seconds(start_sec),
                "end_sec": _round_seconds(end_sec),
                "local_path": _join_artifact_path(artifact_relative_dir, output_path.name),
                "mime_type": OUTPUT_MIME_TYPE,
            }
        )

    if not segments:
        raise VideoSegmenterError("no_segments_created", "Video segmenter did not create any segments.")
    return {"status": "succeeded", "segments": segments}


def _write_segment(
    *,
    ffmpeg: str,
    source_path: Path,
    output_path: Path,
    start_sec: float,
    duration_sec: float,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    copy_command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration_sec:.3f}",
        "-map",
        "0",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-avoid_negative_ts",
        "make_zero",
        "-y",
        str(output_path),
    ]
    copy_error = _run_media_command(copy_command, timeout_seconds=_segment_timeout(duration_sec))
    if copy_error is None and output_path.is_file() and output_path.stat().st_size > 0:
        return

    reencode_command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration_sec:.3f}",
        "-map",
        "0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        str(output_path),
    ]
    reencode_error = _run_media_command(reencode_command, timeout_seconds=_segment_timeout(duration_sec))
    if reencode_error is None and output_path.is_file() and output_path.stat().st_size > 0:
        return

    detail = reencode_error or copy_error or "ffmpeg did not create an output file."
    raise VideoSegmenterError("segment_write_failed", detail[:800])


def _run_media_command(command: list[str], *, timeout_seconds: int) -> str | None:
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return f"ffmpeg timed out after {timeout_seconds} seconds."
    except OSError as exc:
        return str(exc)
    if completed.returncode == 0:
        return None
    detail = (completed.stderr or completed.stdout or f"ffmpeg exited with code {completed.returncode}.").strip()
    return detail


def _resolve_video_path(video: Any, *, backend_root: Path) -> Path:
    filesystem_path = ""
    local_path = ""
    file_url = ""
    mime_type = ""

    if isinstance(video, dict):
        filesystem_path = _first_text(video, ("filesystem_path", "filesystemPath"))
        local_path = _first_text(video, ("local_path", "localPath", "path"))
        file_url = _first_text(video, ("file_url", "fileUrl", "url"))
        mime_type = _first_text(video, ("mime_type", "mimeType", "content_type", "contentType"))
    elif isinstance(video, str):
        local_path = video.strip()
    else:
        raise VideoSegmenterError("invalid_video_input", "Video input must be a file reference or path.")

    if mime_type and not mime_type.lower().startswith("video/"):
        raise VideoSegmenterError("invalid_video_input", "Video input must reference a video file.")

    if filesystem_path:
        return _existing_file(Path(filesystem_path), error_type="video_not_found")

    file_url_path = _path_from_file_url(file_url)
    if file_url_path is not None:
        return _existing_file(file_url_path, error_type="video_not_found")

    if not local_path:
        raise VideoSegmenterError("invalid_video_input", "Video input is missing local_path or filesystem_path.")

    raw_path = Path(local_path)
    if raw_path.is_absolute():
        return _existing_file(raw_path, error_type="video_not_found")

    resolved_artifact = _resolve_capability_artifact_path(local_path, backend_root=backend_root)
    if resolved_artifact is not None:
        return _existing_file(resolved_artifact, error_type="video_not_found")

    raise VideoSegmenterError("video_not_found", f"Video input does not exist: {local_path}")


def _resolve_capability_artifact_path(local_path: str, *, backend_root: Path) -> Path | None:
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    try:
        from app.core.storage.capability_artifact_store import resolve_capability_artifact_path

        return resolve_capability_artifact_path(local_path)
    except Exception:
        return None


def _existing_file(path: Path, *, error_type: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise VideoSegmenterError(error_type, f"Video file does not exist: {path}")
    return resolved


def _path_from_file_url(value: str) -> Path | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "file" or not parsed.path:
        return None
    return Path(unquote(parsed.path))


def _resolve_artifact_dir() -> Path:
    raw_dir = str(os.environ.get("TOOGRAPH_ACTION_ARTIFACT_DIR") or "").strip()
    if not raw_dir:
        raise VideoSegmenterError("artifact_dir_missing", "Tool artifact directory is not available.")
    artifact_dir = Path(raw_dir).expanduser().resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir


def _artifact_relative_dir() -> str:
    raw_dir = str(os.environ.get("TOOGRAPH_ACTION_ARTIFACT_RELATIVE_DIR") or "").strip().replace("\\", "/")
    if not raw_dir:
        raise VideoSegmenterError("artifact_dir_missing", "Tool artifact relative directory is not available.")
    path = PurePosixPath(raw_dir)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise VideoSegmenterError("artifact_dir_invalid", "Tool artifact relative directory is invalid.")
    return "/".join(path.parts)


def _join_artifact_path(relative_dir: str, filename: str) -> str:
    return f"{relative_dir.rstrip('/')}/{filename}"


def _ensure_backend_on_sys_path() -> Path:
    repo_root = _repo_root()
    backend_root = repo_root / "backend"
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    return backend_root


def _repo_root() -> Path:
    configured = str(os.environ.get("TOOGRAPH_REPO_ROOT") or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _first_text(payload: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _is_positive_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) > 0
    except (TypeError, ValueError):
        return False


def _round_seconds(value: float) -> float:
    return round(float(value), 3)


def _segment_timeout(duration_sec: float) -> int:
    return max(60, int(math.ceil(float(duration_sec) * 6 + 30)))


def _failed_result(error_type: str, error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_type": error_type,
        "error": str(error or "Unknown video segmenter error."),
    }


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps(_failed_result("invalid_json", f"stdin must be a JSON object: {exc}"), ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(json.dumps(_failed_result("invalid_json", "stdin must be a JSON object."), ensure_ascii=False))
        return
    print(json.dumps(video_segmenter(payload.get("video")), ensure_ascii=False))


if __name__ == "__main__":
    main()
