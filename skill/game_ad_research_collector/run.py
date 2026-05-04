import json
import mimetypes
import os
import re
import shutil
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_FEEDS = {
    "PocketGamer.biz": "https://www.pocketgamer.biz/rss/",
    "GameDeveloper": "https://www.gamedeveloper.com/rss.xml",
    "GamesIndustry.biz": "https://www.gamesindustry.biz/feed",
}
DEFAULT_COUNTRY = "US"
DEFAULT_DAYS_BACK = 7
DEFAULT_TOP_FETCH_PER_TERM = 2
DEFAULT_MAX_NEWS_ITEMS = 12
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_TOP_FETCH_PER_TERM = 10
MAX_NEWS_ITEMS = 50
MAX_ERROR_CHARS = 1200
USER_AGENT = "GraphiteUI/1.0 game_ad_research_collector"
BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
VIDEO_EXTS = {".3gp", ".avi", ".flv", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm"}

@dataclass(frozen=True)
class CollectorConfig:
    genre: str
    search_terms: list[str]
    country: str
    days_back: int
    top_fetch_per_term: int
    feed_urls: dict[str, str]
    max_news_items: int
    enable_rss: bool
    enable_ads: bool
    use_playwright: bool
    timeout_seconds: float


@dataclass(frozen=True)
class PlaywrightVideoDiscovery:
    video_urls: list[str]
    cookies: list[dict[str, Any]]
    warning: str
    user_agent: str = BROWSER_USER_AGENT


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._skip_depth = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized = tag.lower()
        if normalized == "title":
            self._in_title = True
        if normalized in {"script", "style", "nav", "footer", "header", "aside", "noscript"}:
            self._skip_depth += 1
        if normalized in {"p", "div", "article", "section", "br", "li", "h1", "h2", "h3"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()
        if normalized == "title":
            self._in_title = False
        if normalized in {"script", "style", "nav", "footer", "header", "aside", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        if normalized in {"p", "div", "article", "section", "li", "h1", "h2", "h3"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        text = _compact_text(data)
        if not text:
            return
        if self._in_title:
            self.title = _compact_text(f"{self.title} {text}")
            return
        if self._skip_depth:
            return
        self._chunks.append(text)

    @property
    def text(self) -> str:
        lines = [_compact_text(line) for line in "\n".join(self._chunks).splitlines()]
        return "\n\n".join(line for line in lines if line)


def game_ad_research_collector_skill(**skill_inputs: Any) -> dict[str, Any]:
    cfg = _build_config(skill_inputs)
    if not cfg.genre:
        return _failed_response("Genre is required.")

    artifact_dir_text = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_DIR"))
    artifact_relative_dir = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR")).replace("\\", "/").strip("/")
    if not artifact_dir_text or not artifact_relative_dir:
        return _failed_response("Skill artifact directory is not configured.")

    output_dir = Path(artifact_dir_text)
    output_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    source_documents: list[dict[str, Any]] = []
    downloaded_files: list[dict[str, Any]] = []

    rss_items: list[dict[str, Any]] = []
    if cfg.enable_rss:
        rss_items = _fetch_rss_items(cfg, output_dir=output_dir, artifact_relative_dir=artifact_relative_dir, warnings=warnings)
        source_documents.extend(item["source_document"] for item in rss_items if isinstance(item.get("source_document"), dict))
    _write_json_artifact(output_dir / "rss_raw.json", rss_items)

    ad_items: list[dict[str, Any]] = []
    if cfg.enable_ads:
        ad_items = _collect_ad_items(
            cfg,
            output_dir=output_dir,
            artifact_relative_dir=artifact_relative_dir,
            warnings=warnings,
        )
        for ad_item in ad_items:
            downloaded_files.extend(item for item in ad_item.get("downloaded_files", []) if isinstance(item, dict))
    _write_json_artifact(output_dir / "ads_raw.json", ad_items)

    _write_json_artifact(output_dir / "source_documents.json", source_documents)
    manifest_file = _write_manifest(
        output_dir,
        artifact_relative_dir,
        cfg=cfg,
        rss_items=rss_items,
        ad_items=ad_items,
        downloaded_files=downloaded_files,
        source_documents=source_documents,
        warnings=warnings,
    )
    paths_file = _write_paths_file(output_dir, artifact_relative_dir, downloaded_files)

    status = "succeeded"
    if cfg.enable_ads and ad_items and not downloaded_files:
        status = "partial"
    if not rss_items and not ad_items and not downloaded_files:
        status = "failed"
    summary = _build_summary(
        cfg=cfg,
        status=status,
        rss_items=rss_items,
        ad_items=ad_items,
        downloaded_files=downloaded_files,
        artifact_relative_dir=artifact_relative_dir,
        warnings=warnings,
    )
    return {
        "status": status,
        "genre": cfg.genre,
        "summary": summary,
        "news_count": len(rss_items),
        "ad_count": len(ad_items),
        "downloaded_count": len(downloaded_files),
        "failed_count": sum(len(item.get("failed_downloads", [])) for item in ad_items),
        "rss_items": rss_items,
        "ad_items": ad_items,
        "downloaded_files": downloaded_files,
        "source_documents": source_documents,
        "manifest_file": manifest_file,
        "paths_file": paths_file,
        "warnings": warnings,
        "error": "" if status in {"succeeded", "partial"} else "No RSS items, ad records, or media files were collected.",
    }


def _build_config(skill_inputs: dict[str, Any]) -> CollectorConfig:
    genre = _compact_text(skill_inputs.get("genre") or skill_inputs.get("game_type"))
    search_terms = _parse_string_list(skill_inputs.get("search_terms"))
    if not search_terms and genre:
        search_terms = [genre]
    return CollectorConfig(
        genre=genre,
        search_terms=search_terms,
        country=(_compact_text(skill_inputs.get("country")) or DEFAULT_COUNTRY).upper(),
        days_back=_parse_int(skill_inputs.get("days_back"), default=DEFAULT_DAYS_BACK, minimum=1, maximum=365),
        top_fetch_per_term=_parse_int(
            skill_inputs.get("top_fetch_per_term"),
            default=DEFAULT_TOP_FETCH_PER_TERM,
            minimum=0,
            maximum=MAX_TOP_FETCH_PER_TERM,
        ),
        feed_urls=_parse_feed_urls(skill_inputs.get("feed_urls")),
        max_news_items=_parse_int(
            skill_inputs.get("max_news_items"),
            default=DEFAULT_MAX_NEWS_ITEMS,
            minimum=0,
            maximum=MAX_NEWS_ITEMS,
        ),
        enable_rss=_parse_bool(skill_inputs.get("enable_rss"), default=True),
        enable_ads=_parse_bool(skill_inputs.get("enable_ads"), default=True),
        use_playwright=_parse_bool(skill_inputs.get("use_playwright"), default=False),
        timeout_seconds=_parse_float(skill_inputs.get("timeout_seconds"), default=DEFAULT_TIMEOUT_SECONDS, minimum=1.0, maximum=120.0),
    )


def _fetch_rss_items(
    cfg: CollectorConfig,
    *,
    output_dir: Path,
    artifact_relative_dir: str,
    warnings: list[str],
) -> list[dict[str, Any]]:
    if cfg.max_news_items <= 0:
        return []
    items: list[dict[str, Any]] = []
    feeds = cfg.feed_urls or DEFAULT_FEEDS
    for feed_name, feed_url in feeds.items():
        if len(items) >= cfg.max_news_items:
            break
        try:
            xml_text = _fetch_text(feed_url, timeout_seconds=cfg.timeout_seconds)
            feed_items = _parse_feed(xml_text, source=feed_name, feed_url=feed_url)
        except Exception as exc:
            warnings.append(f"RSS fetch failed for {feed_url}: {str(exc)[:MAX_ERROR_CHARS]}")
            continue
        for item in feed_items:
            if len(items) >= cfg.max_news_items:
                break
            source_document = _fetch_and_write_article_document(
                item,
                output_dir=output_dir,
                artifact_relative_dir=artifact_relative_dir,
                index=len(items) + 1,
                timeout_seconds=cfg.timeout_seconds,
                warnings=warnings,
            )
            if source_document:
                item["source_document"] = source_document
                item["local_path"] = source_document["local_path"]
            items.append(item)
    return items


def _parse_feed(xml_text: str, *, source: str, feed_url: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    items: list[dict[str, Any]] = []
    rss_items = root.findall(".//item")
    if rss_items:
        for node in rss_items:
            title = _xml_child_text(node, "title")
            link = _xml_child_text(node, "link")
            summary = _xml_child_text(node, "description")
            published = _xml_child_text(node, "pubDate")
            if title or link:
                items.append(
                    {
                        "source": source,
                        "feed_url": feed_url,
                        "title": title,
                        "url": link,
                        "summary": _strip_html(summary),
                        "published_at": published,
                    }
                )
        return items

    namespace = {"atom": "http://www.w3.org/2005/Atom"}
    for node in root.findall(".//atom:entry", namespace):
        title = _xml_child_text(node, "{http://www.w3.org/2005/Atom}title")
        link = _atom_link(node)
        summary = _xml_child_text(node, "{http://www.w3.org/2005/Atom}summary") or _xml_child_text(node, "{http://www.w3.org/2005/Atom}content")
        published = _xml_child_text(node, "{http://www.w3.org/2005/Atom}published") or _xml_child_text(node, "{http://www.w3.org/2005/Atom}updated")
        if title or link:
            items.append(
                {
                    "source": source,
                    "feed_url": feed_url,
                    "title": title,
                    "url": link,
                    "summary": _strip_html(summary),
                    "published_at": published,
                }
            )
    return items


def _fetch_and_write_article_document(
    item: dict[str, Any],
    *,
    output_dir: Path,
    artifact_relative_dir: str,
    index: int,
    timeout_seconds: float,
    warnings: list[str],
) -> dict[str, Any] | None:
    url = _compact_text(item.get("url"))
    if not url:
        return None
    title = _compact_text(item.get("title")) or f"article-{index}"
    markdown_text = ""
    try:
        html_text = _fetch_text(url, timeout_seconds=timeout_seconds)
        extractor = _TextExtractor()
        extractor.feed(html_text)
        extracted_title = extractor.title or title
        body = extractor.text or _strip_html(html_text)
        markdown_text = f"# {extracted_title}\n\nSource: {url}\n\n{body.strip()}\n"
    except Exception as exc:
        warnings.append(f"Article fetch failed for {url}: {str(exc)[:MAX_ERROR_CHARS]}")
        markdown_text = f"# {title}\n\nSource: {url}\n\n{_compact_text(item.get('summary'))}\n"
    filename = f"{index:03d}-{_slugify(title)}.md"
    path = output_dir / filename
    path.write_text(markdown_text, encoding="utf-8")
    return _artifact_record(path=path, artifact_relative_dir=artifact_relative_dir, content_type="text/markdown", source_url=url)


def _collect_ad_items(
    cfg: CollectorConfig,
    *,
    output_dir: Path,
    artifact_relative_dir: str,
    warnings: list[str],
) -> list[dict[str, Any]]:
    start_date = date.today() - timedelta(days=cfg.days_back)
    end_date = date.today()
    ad_items: list[dict[str, Any]] = []
    videos_dir = output_dir / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    for term_index, term in enumerate(cfg.search_terms, start=1):
        search_url = _build_facebook_ad_library_url(term, country=cfg.country, start_date=start_date, end_date=end_date)
        discovered_video_urls: list[str] = []
        ad_warning = ""
        if cfg.use_playwright:
            discovery = _discover_public_ad_videos_with_playwright(
                search_url,
                top_n=cfg.top_fetch_per_term,
                timeout_seconds=cfg.timeout_seconds,
            )
            if isinstance(discovery, tuple):
                discovered_video_urls, ad_warning = discovery
                download_cookies: list[dict[str, Any]] = []
                download_user_agent = USER_AGENT
            else:
                discovered_video_urls = list(getattr(discovery, "video_urls", []) or [])
                ad_warning = _compact_text(getattr(discovery, "warning", ""))
                download_cookies = list(getattr(discovery, "cookies", []) or [])
                download_user_agent = _compact_text(getattr(discovery, "user_agent", "")) or BROWSER_USER_AGENT
            if ad_warning:
                warnings.append(ad_warning)
        else:
            ad_warning = "Playwright ad discovery skipped because use_playwright is false."
            download_cookies = []
            download_user_agent = USER_AGENT
        downloaded_files: list[dict[str, Any]] = []
        failed_downloads: list[dict[str, Any]] = []
        for video_index, video_url in enumerate(discovered_video_urls[: cfg.top_fetch_per_term], start=1):
            destination = videos_dir / f"{term_index:02d}-{video_index:02d}-{_slugify(term)}{_extension_for_url(video_url) or '.mp4'}"
            record = _download_video(
                video_url,
                destination=destination,
                timeout_seconds=cfg.timeout_seconds,
                artifact_relative_dir=f"{artifact_relative_dir}/videos",
                cookies=download_cookies,
                referer=search_url,
                user_agent=download_user_agent,
            )
            if record["status"] == "downloaded":
                downloaded_files.append(record)
            else:
                failed_downloads.append(record)
        ad_items.append(
            {
                "genre": cfg.genre,
                "keyword": term,
                "country": cfg.country,
                "days_back": cfg.days_back,
                "search_url": search_url,
                "top_video_urls": discovered_video_urls[: cfg.top_fetch_per_term],
                "downloaded_files": downloaded_files,
                "failed_downloads": failed_downloads,
                "warning": ad_warning,
                "collected_at": _timestamp(),
            }
        )
    return ad_items


def _discover_public_ad_videos_with_playwright(
    url: str,
    *,
    top_n: int,
    timeout_seconds: float,
) -> PlaywrightVideoDiscovery:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return PlaywrightVideoDiscovery(video_urls=[], cookies=[], warning=f"Playwright is not available for ad discovery: {exc}")

    discovered: list[str] = []
    cookies: list[dict[str, Any]] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = None
            try:
                context = browser.new_context(user_agent=BROWSER_USER_AGENT, locale="en-US")
                page = context.new_page()

                def on_response(response: Any) -> None:
                    response_url = str(getattr(response, "url", "") or "")
                    headers = getattr(response, "headers", {}) or {}
                    content_type = str(headers.get("content-type") or "").lower()
                    request = getattr(response, "request", None)
                    resource_type = str(getattr(request, "resource_type", "") or "").lower()
                    if resource_type == "media" or _is_video_url(response_url) or "video" in content_type:
                        discovered.append(response_url)

                page.on("response", on_response)
                page.goto(url, wait_until="domcontentloaded", timeout=max(10_000, int(timeout_seconds * 1000)))
                page.wait_for_timeout(3000)
                for _round in range(4):
                    dom_urls = page.evaluate(
                        """() => {
                            const urls = [];
                            for (const video of Array.from(document.querySelectorAll('video'))) {
                                if (video.currentSrc) urls.push(video.currentSrc);
                                if (video.src) urls.push(video.src);
                                for (const source of Array.from(video.querySelectorAll('source'))) {
                                    if (source.src) urls.push(source.src);
                                }
                            }
                            return urls;
                        }"""
                    )
                    if isinstance(dom_urls, list):
                        discovered.extend(str(item) for item in dom_urls)
                    if len(_dedupe_strings(discovered)) >= top_n:
                        break
                    page.mouse.wheel(0, 1800)
                    page.wait_for_timeout(1200)
                cookies = [dict(item) for item in context.cookies()]
            finally:
                if context is not None:
                    context.close()
                browser.close()
    except Exception as exc:
        return PlaywrightVideoDiscovery(
            video_urls=_dedupe_video_urls(discovered),
            cookies=cookies,
            warning=f"Playwright ad discovery failed: {str(exc)[:MAX_ERROR_CHARS]}",
        )
    return PlaywrightVideoDiscovery(video_urls=_dedupe_video_urls(discovered), cookies=cookies, warning="")


def _build_facebook_ad_library_url(term: str, *, country: str, start_date: date, end_date: date) -> str:
    params = {
        "active_status": "active",
        "ad_type": "all",
        "country": country,
        "is_targeted_country": "false",
        "media_type": "all",
        "q": term,
        "search_type": "keyword_unordered",
        "sort_data[direction]": "desc",
        "sort_data[mode]": "total_impressions",
        "start_date[min]": start_date.isoformat(),
        "start_date[max]": end_date.isoformat(),
    }
    return "https://www.facebook.com/ads/library/?" + urllib.parse.urlencode(params)


def _cookie_header_for_url(cookies: list[dict[str, Any]], url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    request_path = parsed.path or "/"
    pairs: list[str] = []
    for cookie in cookies:
        name = _compact_text(cookie.get("name"))
        value = _compact_text(cookie.get("value"))
        if not name:
            continue
        domain = _compact_text(cookie.get("domain")).lstrip(".").lower()
        if domain and host != domain and not host.endswith(f".{domain}"):
            continue
        path = _compact_text(cookie.get("path")) or "/"
        if not request_path.startswith(path):
            continue
        if cookie.get("secure") and parsed.scheme != "https":
            continue
        pairs.append(f"{name}={value}")
    return "; ".join(pairs)


def _download_video(
    url: str,
    *,
    destination: Path,
    timeout_seconds: float,
    artifact_relative_dir: str,
    cookies: list[dict[str, Any]] | None = None,
    referer: str = "",
    user_agent: str = USER_AGENT,
) -> dict[str, Any]:
    headers = {"User-Agent": user_agent or USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    cookie_header = _cookie_header_for_url(cookies or [], url)
    if cookie_header:
        headers["Cookie"] = cookie_header
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = response.headers.get("content-type") or mimetypes.guess_type(destination.name)[0] or "video/mp4"
            if "video" not in content_type.lower() and not _is_video_url(url):
                raise OSError(f"Download response is not a video: {content_type}")
            with destination.open("wb") as handle:
                shutil.copyfileobj(response, handle)
        return {
            "status": "downloaded",
            "url": url,
            "kind": "video",
            "source": "facebook_ad_library",
            "filename": destination.name,
            "local_path": f"{artifact_relative_dir}/{destination.name}",
            "size": destination.stat().st_size,
            "content_type": content_type,
        }
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        if destination.exists():
            destination.unlink()
        return {
            "status": "failed",
            "url": url,
            "kind": "video",
            "source": "facebook_ad_library",
            "filename": destination.name,
            "error": str(exc)[:MAX_ERROR_CHARS],
        }


def _write_manifest(
    output_dir: Path,
    artifact_relative_dir: str,
    *,
    cfg: CollectorConfig,
    rss_items: list[dict[str, Any]],
    ad_items: list[dict[str, Any]],
    downloaded_files: list[dict[str, Any]],
    source_documents: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, Any]:
    path = output_dir / "manifest.json"
    payload = {
        "genre": cfg.genre,
        "search_terms": cfg.search_terms,
        "country": cfg.country,
        "days_back": cfg.days_back,
        "rss_items": rss_items,
        "ad_items": ad_items,
        "downloaded_files": downloaded_files,
        "source_documents": source_documents,
        "warnings": warnings,
        "created_at": _timestamp(),
    }
    _write_json_artifact(path, payload)
    return _artifact_record(path=path, artifact_relative_dir=artifact_relative_dir, content_type="application/json")


def _write_paths_file(output_dir: Path, artifact_relative_dir: str, downloaded_files: list[dict[str, Any]]) -> dict[str, Any]:
    path = output_dir / "downloaded_video_paths.txt"
    lines = [str(item["local_path"]) for item in downloaded_files if item.get("local_path")]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return _artifact_record(path=path, artifact_relative_dir=artifact_relative_dir, content_type="text/plain")


def _write_json_artifact(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _artifact_record(
    *,
    path: Path,
    artifact_relative_dir: str,
    content_type: str,
    source_url: str = "",
) -> dict[str, Any]:
    record = {
        "filename": path.name,
        "local_path": f"{artifact_relative_dir}/{path.name}",
        "content_type": content_type,
        "size": path.stat().st_size if path.exists() else 0,
    }
    if source_url:
        record["url"] = source_url
    return record


def _build_summary(
    *,
    cfg: CollectorConfig,
    status: str,
    rss_items: list[dict[str, Any]],
    ad_items: list[dict[str, Any]],
    downloaded_files: list[dict[str, Any]],
    artifact_relative_dir: str,
    warnings: list[str],
) -> str:
    lines = [
        f"Status: {status}",
        f"Genre: {cfg.genre}",
        f"Artifact directory: {artifact_relative_dir}",
        f"RSS items: {len(rss_items)}",
        f"Ad search records: {len(ad_items)}",
        f"Downloaded videos: {len(downloaded_files)}",
    ]
    if warnings:
        lines.append("Warnings:")
        lines.extend(f"- {warning}" for warning in warnings[:10])
    return "\n".join(lines)


def _fetch_text(url: str, *, timeout_seconds: float) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/rss+xml,application/atom+xml,*/*"})
    with urlopen(request, timeout=timeout_seconds) as response:
        data = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return data.decode(charset, errors="replace")


def _xml_child_text(node: ET.Element, child_name: str) -> str:
    child = node.find(child_name)
    if child is None or child.text is None:
        return ""
    return _compact_text(child.text)


def _atom_link(node: ET.Element) -> str:
    for child in node.findall("{http://www.w3.org/2005/Atom}link"):
        href = _compact_text(child.attrib.get("href"))
        if href:
            return href
    return ""


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return _compact_text(text)


def _parse_feed_urls(value: object) -> dict[str, str]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return {
            _compact_text(name) or f"Feed {index}": _compact_text(url)
            for index, (name, url) in enumerate(value.items(), start=1)
            if _is_http_url(_compact_text(url))
        }
    urls = _parse_string_list(value)
    return {f"Feed {index}": url for index, url in enumerate(urls, start=1) if _is_http_url(url)}


def _parse_string_list(value: object) -> list[str]:
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
    return _dedupe_strings(_compact_text(item) for item in candidates if _compact_text(item))


def _parse_bool(value: object, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
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


def _dedupe_strings(values: Any) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value:
            continue
        marker = value.lower()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def _dedupe_video_urls(values: list[str]) -> list[str]:
    return [value for value in _dedupe_strings(values) if _is_video_url(value)]


def _is_video_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(str(url or ""))
    if parsed.scheme not in {"http", "https"}:
        return False
    suffix = Path(urllib.parse.unquote(parsed.path)).suffix.lower()
    if suffix in VIDEO_EXTS:
        return True
    lowered = url.lower()
    return any(marker in lowered for marker in ("bytestart", "mime_type=video", "content-type=video", "content_type=video"))


def _is_http_url(url: str) -> bool:
    return urllib.parse.urlparse(url).scheme in {"http", "https"}


def _extension_for_url(url: str) -> str:
    suffix = Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).suffix.lower()
    return suffix if suffix in VIDEO_EXTS else ""


def _slugify(value: str) -> str:
    value = urllib.parse.unquote(value).strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-._")
    return value or "item"


def _compact_text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _compact_multiline_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\r\n", "\n").replace("\r", "\n").strip()


def _timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def _failed_response(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "genre": "",
        "summary": "",
        "news_count": 0,
        "ad_count": 0,
        "downloaded_count": 0,
        "failed_count": 0,
        "rss_items": [],
        "ad_items": [],
        "downloaded_files": [],
        "source_documents": [],
        "manifest_file": {},
        "paths_file": {},
        "warnings": [],
        "error": error,
    }


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        payload = {"genre": "", "error": f"Invalid JSON input: {exc}"}
    if not isinstance(payload, dict):
        payload = {"genre": "", "error": "Skill input must be a JSON object."}
    result = game_ad_research_collector_skill(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
