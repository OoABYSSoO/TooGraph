import html
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_ITEMS = 100
MAX_ITEMS = 500
MAX_ERROR_CHARS = 1200
USER_AGENT = "GraphiteUI/1.0 web_media_downloader"

IMAGE_EXTS = {".avif", ".bmp", ".gif", ".heic", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"}
VIDEO_EXTS = {".3gp", ".avi", ".flv", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm", ".m3u8", ".mpd"}
AUDIO_EXTS = {".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav"}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS | AUDIO_EXTS
MEDIA_ATTRS = {
    "content",
    "data-bg",
    "data-background",
    "data-full",
    "data-full-size",
    "data-href",
    "data-image",
    "data-lazy",
    "data-lazy-src",
    "data-original",
    "data-poster",
    "data-src",
    "data-url",
    "data-video",
    "href",
    "poster",
    "src",
}
PRIMARY_SOURCES = ("[src]", "[href]", "[content]", "json-ld")
MEDIA_KEYS = {"contenturl", "embedurl", "image", "images", "poster", "thumbnail", "thumbnailurl", "url"}
CSS_URL_RE = re.compile(r"url\((?P<quote>['\"]?)(?P<url>.*?)(?P=quote)\)", re.IGNORECASE)
URL_RE = re.compile(
    r"""(?P<url>https?://[^\s"'<>\\)]+?\.(?:avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp|"""
    r"""3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm|m3u8|mpd|aac|flac|m4a|mp3|oga|ogg|opus|wav)"""
    r"""(?:\?[^\s"'<>\\)]*)?)""",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class MediaItem:
    url: str
    kind: str
    source: str
    order: int
    priority: int

    def public_dict(self) -> dict[str, Any]:
        return {"url": self.url, "kind": self.kind, "source": self.source}


class MediaHTMLParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.items: list[MediaItem] = []
        self._order = 0
        self._in_json_ld = False
        self._json_ld_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {name.lower(): value or "" for name, value in attrs}
        tag_name = tag.lower()
        if tag_name == "script" and "ld+json" in attr_map.get("type", "").lower():
            self._in_json_ld = True
            self._json_ld_chunks = []

        for attr_name, raw_value in attr_map.items():
            if not raw_value:
                continue
            value = html.unescape(raw_value).strip()
            if attr_name == "srcset":
                for candidate in _parse_srcset(value):
                    self._add_url(candidate, f"{tag_name}[srcset]", priority=40)
            elif attr_name == "style":
                for candidate in _parse_css_urls(value):
                    self._add_url(candidate, f"{tag_name}[style]", priority=45)
            elif attr_name in MEDIA_ATTRS:
                priority = _source_priority(tag_name, attr_name)
                self._add_url(value, f"{tag_name}[{attr_name}]", priority=priority)

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._json_ld_chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._in_json_ld:
            self._in_json_ld = False
            content = "".join(self._json_ld_chunks).strip()
            for candidate in _extract_json_media_urls(content):
                self._add_url(candidate, "json-ld", priority=20)
            self._json_ld_chunks = []

    def _add_url(self, value: str, source: str, *, priority: int) -> None:
        normalized = _normalize_url(value, self.base_url)
        kind = _media_kind(normalized)
        if not kind:
            return
        self._order += 1
        self.items.append(MediaItem(normalized, kind, source, self._order, priority))


def web_media_downloader_skill(**skill_inputs: Any) -> dict[str, Any]:
    urls = _parse_urls(skill_inputs.get("urls") or skill_inputs.get("url"))
    if not urls:
        return _failed_response("At least one URL is required.")

    artifact_dir_text = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_DIR"))
    artifact_relative_dir = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR")).replace("\\", "/").strip("/")
    if not artifact_dir_text or not artifact_relative_dir:
        return _failed_response("Skill artifact directory is not configured.")

    output_dir = Path(artifact_dir_text)
    output_dir.mkdir(parents=True, exist_ok=True)

    media_types = _parse_media_types(skill_inputs.get("media_types") or skill_inputs.get("types"))
    max_items = _parse_int(skill_inputs.get("max_items"), default=DEFAULT_MAX_ITEMS, minimum=1, maximum=MAX_ITEMS)
    timeout_seconds = _parse_float(skill_inputs.get("timeout_seconds"), default=DEFAULT_TIMEOUT_SECONDS, minimum=1.0, maximum=120.0)
    discover_only = _parse_bool(skill_inputs.get("discover_only"))
    use_playwright = _parse_bool(skill_inputs.get("use_playwright"))
    use_ytdlp = _parse_bool(skill_inputs.get("use_ytdlp") or skill_inputs.get("use_yt_dlp"))

    warnings: list[str] = []
    items: list[MediaItem] = []
    for url in urls:
        try:
            items.extend(_discover_from_url(url, timeout_seconds=timeout_seconds))
        except Exception as exc:
            warnings.append(f"Static discovery failed for {url}: {exc}")
        if use_playwright:
            playwright_items, playwright_warning = _discover_with_playwright(url, skill_dir=_skill_dir())
            items.extend(playwright_items)
            if playwright_warning:
                warnings.append(playwright_warning)

    items = _filter_items(_dedupe_items(items), media_types)[:max_items]
    media_items = [item.public_dict() for item in items]

    if discover_only:
        return _result(
            status="succeeded",
            summary=f"Discovered {len(items)} media item(s). No files were downloaded.",
            discovered_count=len(items),
            downloaded_files=[],
            failed_downloads=[],
            media_items=media_items,
            output_dir=output_dir,
            artifact_relative_dir=artifact_relative_dir,
            warnings=warnings,
        )

    downloaded_files: list[dict[str, Any]] = []
    failed_downloads: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        destination = _destination_for_item(item, output_dir, index)
        record = _download_item(item, destination, timeout_seconds=timeout_seconds, artifact_relative_dir=artifact_relative_dir)
        if record["status"] == "downloaded":
            downloaded_files.append(record)
        else:
            failed_downloads.append(record)

    if use_ytdlp:
        ytdlp_files, ytdlp_warnings = _run_ytdlp(urls, output_dir=output_dir, artifact_relative_dir=artifact_relative_dir)
        downloaded_files.extend(ytdlp_files)
        warnings.extend(ytdlp_warnings)

    manifest_file = _write_manifest(
        output_dir,
        artifact_relative_dir,
        media_items=media_items,
        downloaded_files=downloaded_files,
        failed_downloads=failed_downloads,
        warnings=warnings,
    )
    paths_file = _write_paths_file(output_dir, artifact_relative_dir, downloaded_files)

    if downloaded_files and failed_downloads:
        status = "partial"
    elif downloaded_files or not items:
        status = "succeeded"
    else:
        status = "failed"
    summary = (
        f"Downloaded {len(downloaded_files)} file(s) to {artifact_relative_dir}. "
        f"Discovered {len(items)} media item(s); {len(failed_downloads)} download(s) failed."
    )
    return _result(
        status=status,
        summary=summary,
        discovered_count=len(items),
        downloaded_files=downloaded_files,
        failed_downloads=failed_downloads,
        media_items=media_items,
        output_dir=output_dir,
        artifact_relative_dir=artifact_relative_dir,
        warnings=warnings,
        manifest_file=manifest_file,
        paths_file=paths_file,
    )


def _discover_from_url(url: str, *, timeout_seconds: float) -> list[MediaItem]:
    if _media_kind(url):
        return [MediaItem(url, _media_kind(url), "direct-url", 1, 5)]
    text = _fetch_html(url, timeout_seconds=timeout_seconds)
    if not text:
        return []
    return _discover_from_html(text, url)


def _discover_from_html(html_text: str, base_url: str) -> list[MediaItem]:
    parser = MediaHTMLParser(base_url)
    parser.feed(html_text)
    regex_items = [
        MediaItem(match.group("url"), _media_kind(match.group("url")), "html-regex", index, 60)
        for index, match in enumerate(URL_RE.finditer(html_text), start=1)
        if _media_kind(match.group("url"))
    ]
    return sorted([*parser.items, *regex_items], key=lambda item: (item.priority, item.order))


def _fetch_html(url: str, *, timeout_seconds: float) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
    with urlopen(request, timeout=timeout_seconds) as response:
        data = response.read()
        content_type = response.headers.get("content-type", "")
        charset = response.headers.get_content_charset() or "utf-8"
    if "html" not in content_type.lower() and b"<html" not in data[:500].lower():
        return ""
    return data.decode(charset, errors="replace")


def _download_item(item: MediaItem, destination: Path, *, timeout_seconds: float, artifact_relative_dir: str) -> dict[str, Any]:
    request = Request(item.url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response, destination.open("wb") as handle:
            shutil.copyfileobj(response, handle)
            content_type = response.headers.get("content-type") or mimetypes.guess_type(destination.name)[0] or "application/octet-stream"
        return {
            "status": "downloaded",
            "url": item.url,
            "kind": item.kind,
            "source": item.source,
            "filename": destination.name,
            "local_path": f"{artifact_relative_dir}/{destination.name}",
            "size": destination.stat().st_size,
            "content_type": content_type,
        }
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        if destination.exists() and destination.stat().st_size == 0:
            destination.unlink()
        return {
            "status": "failed",
            "url": item.url,
            "kind": item.kind,
            "source": item.source,
            "filename": destination.name,
            "error": str(exc)[:MAX_ERROR_CHARS],
        }


def _destination_for_item(item: MediaItem, output_dir: Path, index: int) -> Path:
    parsed = urlparse(item.url)
    basename = Path(unquote(parsed.path)).name or f"{item.kind}-{index}"
    stem = _slugify(Path(basename).stem)
    ext = _extension_for_url(item.url)
    if not ext:
        ext = mimetypes.guess_extension(item.kind) or ".bin"
    if ext == ".jpeg":
        ext = ".jpg"
    candidate = output_dir / f"{index:03d}-{stem}{ext.lower()}"
    suffix = 1
    while candidate.exists():
        candidate = output_dir / f"{index:03d}-{stem}-{suffix}{ext.lower()}"
        suffix += 1
    return candidate


def _discover_with_playwright(url: str, *, skill_dir: Path) -> tuple[list[MediaItem], str]:
    script = skill_dir / "scripts" / "discover_media_playwright.py"
    if not script.is_file():
        return [], "Playwright discovery skipped because bundled helper is missing."
    try:
        completed = subprocess.run(
            [sys.executable, str(script), url],
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return [], f"Playwright discovery failed for {url}: {exc}"
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or f"exit code {completed.returncode}").strip()
        return [], f"Playwright discovery failed for {url}: {detail[:MAX_ERROR_CHARS]}"
    try:
        payload = json.loads(completed.stdout or "[]")
    except json.JSONDecodeError as exc:
        return [], f"Playwright discovery returned invalid JSON for {url}: {exc}"
    items = []
    for index, item in enumerate(payload if isinstance(payload, list) else [], start=1):
        if not isinstance(item, dict):
            continue
        media_url = _compact_text(item.get("url"))
        kind = _compact_text(item.get("kind")) or _media_kind(media_url)
        if media_url and kind:
            items.append(MediaItem(media_url, kind, _compact_text(item.get("source")) or "playwright", index, 15))
    return items, ""


def _run_ytdlp(urls: list[str], *, output_dir: Path, artifact_relative_dir: str) -> tuple[list[dict[str, Any]], list[str]]:
    executable = shutil.which("yt-dlp")
    if not executable:
        return [], ["yt-dlp was requested but is not available on PATH."]
    before = {path.resolve() for path in output_dir.iterdir()} if output_dir.exists() else set()
    command = [
        executable,
        "--write-info-json",
        "--write-thumbnail",
        "-P",
        str(output_dir),
        "-o",
        "%(title).200B [%(id)s].%(ext)s",
        *urls,
    ]
    completed = subprocess.run(command, cwd=output_dir, capture_output=True, text=True, timeout=180, check=False)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or f"exit code {completed.returncode}").strip()
        return [], [f"yt-dlp failed: {detail[:MAX_ERROR_CHARS]}"]
    records = []
    for path in sorted(output_dir.iterdir(), key=lambda candidate: candidate.name):
        if path.resolve() in before or not path.is_file() or path.name in {"manifest.jsonl", "downloaded_paths.txt"}:
            continue
        records.append(
            {
                "status": "downloaded",
                "url": "",
                "kind": _media_kind(path.name) or "file",
                "source": "yt-dlp",
                "filename": path.name,
                "local_path": f"{artifact_relative_dir}/{path.name}",
                "size": path.stat().st_size,
                "content_type": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            }
        )
    return records, []


def _write_manifest(
    output_dir: Path,
    artifact_relative_dir: str,
    *,
    media_items: list[dict[str, Any]],
    downloaded_files: list[dict[str, Any]],
    failed_downloads: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, Any]:
    path = output_dir / "manifest.jsonl"
    rows = [
        {"type": "media_item", **item}
        for item in media_items
    ] + [
        {"type": "downloaded_file", **item}
        for item in downloaded_files
    ] + [
        {"type": "failed_download", **item}
        for item in failed_downloads
    ]
    if warnings:
        rows.append({"type": "warnings", "warnings": warnings})
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + ("\n" if rows else ""), encoding="utf-8")
    return {
        "local_path": f"{artifact_relative_dir}/{path.name}",
        "content_type": "application/jsonl",
        "filename": path.name,
    }


def _write_paths_file(output_dir: Path, artifact_relative_dir: str, downloaded_files: list[dict[str, Any]]) -> dict[str, Any]:
    path = output_dir / "downloaded_paths.txt"
    lines = [str(item["local_path"]) for item in downloaded_files if item.get("local_path")]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return {
        "local_path": f"{artifact_relative_dir}/{path.name}",
        "content_type": "text/plain",
        "filename": path.name,
    }


def _result(
    *,
    status: str,
    summary: str,
    discovered_count: int,
    downloaded_files: list[dict[str, Any]],
    failed_downloads: list[dict[str, Any]],
    media_items: list[dict[str, Any]],
    output_dir: Path,
    artifact_relative_dir: str,
    warnings: list[str],
    manifest_file: dict[str, Any] | None = None,
    paths_file: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "summary": summary,
        "discovered_count": discovered_count,
        "downloaded_count": len(downloaded_files),
        "failed_count": len(failed_downloads),
        "output_dir": str(output_dir),
        "artifact_relative_dir": artifact_relative_dir,
        "downloaded_files": downloaded_files,
        "failed_downloads": failed_downloads,
        "media_items": media_items,
        "paths_file": paths_file or {},
        "manifest_file": manifest_file or {},
        "warnings": warnings,
        "error": "" if status in {"succeeded", "partial"} else "No files were downloaded.",
    }


def _failed_response(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "summary": "",
        "discovered_count": 0,
        "downloaded_count": 0,
        "failed_count": 0,
        "output_dir": "",
        "artifact_relative_dir": "",
        "downloaded_files": [],
        "failed_downloads": [],
        "media_items": [],
        "paths_file": {},
        "manifest_file": {},
        "warnings": [],
        "error": error,
    }


def _dedupe_items(items: list[MediaItem]) -> list[MediaItem]:
    seen: set[str] = set()
    result: list[MediaItem] = []
    for item in sorted(items, key=lambda candidate: (candidate.priority, candidate.order)):
        if item.url in seen:
            continue
        seen.add(item.url)
        result.append(item)
    return result


def _filter_items(items: list[MediaItem], media_types: set[str]) -> list[MediaItem]:
    if "all" in media_types:
        return items
    return [item for item in items if item.kind in media_types]


def _parse_urls(value: object) -> list[str]:
    if isinstance(value, list):
        candidates = value
    else:
        text = _compact_multiline_text(value)
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                candidates = parsed if isinstance(parsed, list) else [text]
            except json.JSONDecodeError:
                candidates = re.split(r"[\n,]+", text)
        else:
            candidates = re.split(r"[\n,]+", text)
    urls = []
    for candidate in candidates:
        url = _compact_text(candidate)
        if urlparse(url).scheme in {"http", "https"}:
            urls.append(url)
    return urls


def _parse_media_types(value: object) -> set[str]:
    text = _compact_text(value).lower() or "image,video,audio"
    parsed = {item.strip() for item in text.split(",") if item.strip()}
    allowed = {"image", "video", "audio", "all"}
    selected = parsed & allowed
    return selected or {"image", "video", "audio"}


def _parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _parse_int(value: object, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _parse_float(value: object, *, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _parse_srcset(value: str) -> list[str]:
    return [part.strip().split(maxsplit=1)[0] for part in value.split(",") if part.strip()]


def _parse_css_urls(value: str) -> list[str]:
    return [match.group("url").strip() for match in CSS_URL_RE.finditer(value)]


def _source_priority(tag_name: str, attr_name: str) -> int:
    if tag_name == "source" and attr_name == "src":
        return 10
    if tag_name in {"img", "video", "audio"} and attr_name == "src":
        return 10
    if attr_name in {"href", "content"}:
        return 20
    if "poster" in attr_name or "thumb" in attr_name:
        return 50
    if attr_name.startswith("data-"):
        return 30
    return 35


def _normalize_url(value: str, base_url: str) -> str:
    value = value.strip()
    if not value or value.startswith(("data:", "blob:", "javascript:", "mailto:", "#")):
        return ""
    return urljoin(base_url, value)


def _extension_for_url(url: str) -> str:
    return Path(unquote(urlparse(url).path)).suffix.lower()


def _media_kind(url: str) -> str:
    ext = _extension_for_url(url)
    if ext in IMAGE_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    return ""


def _extract_json_media_urls(content: str) -> list[str]:
    if not content:
        return []
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return [match.group("url") for match in URL_RE.finditer(content)]

    found: list[str] = []

    def walk(value: object, key: str = "") -> None:
        normalized_key = key.replace("@", "").replace("_", "").replace("-", "").lower()
        if isinstance(value, str):
            if normalized_key in MEDIA_KEYS or _media_kind(value):
                found.append(value)
        elif isinstance(value, list):
            for item in value:
                walk(item, key)
        elif isinstance(value, dict):
            for child_key, child_value in value.items():
                walk(child_value, str(child_key))

    walk(data)
    return found


def _slugify(value: str) -> str:
    value = unquote(value).strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-._")
    return value or "media"


def _skill_dir() -> Path:
    env_value = _compact_text(os.getenv("GRAPHITE_SKILL_DIR"))
    return Path(env_value).resolve() if env_value else Path(__file__).resolve().parent


def _compact_text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _compact_multiline_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\r\n", "\n").replace("\r", "\n").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        payload = {"urls": "", "error": f"Invalid JSON input: {exc}"}
    if not isinstance(payload, dict):
        payload = {"urls": "", "error": "Skill input must be a JSON object."}
    result = web_media_downloader_skill(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
