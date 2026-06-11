from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


SEARCH_API_URL = "https://sousuo.www.gov.cn/search-gov/data"
DEFAULT_DATASET_ROOT = Path("knowledge") / "action_policy_national_gov_cn"
DEFAULT_SOURCE_TYPES = ("state_council", "department_policy")
SOURCE_TYPE_CONFIG = {
    "state_council": {
        "api_category": "zhengcelibrary_gw",
        "path": "state_council",
        "label": "国务院文件",
    },
    "department_policy": {
        "api_category": "zhengcelibrary_bm",
        "path": "department_policy",
        "label": "部门文件",
    },
}
BLOCK_TAGS = {
    "address",
    "article",
    "blockquote",
    "br",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "p",
    "section",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
    "ol",
}
SKIP_TAGS = {
    "button",
    "footer",
    "form",
    "head",
    "header",
    "iframe",
    "nav",
    "noscript",
    "script",
    "select",
    "style",
    "svg",
}
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
TARGET_IDS = {
    "UCAP-CONTENT",
    "UCAP_CONTENT",
    "UCAP-CONTENT-P",
    "zoom",
    "content",
    "article",
    "articleContent",
}
TARGET_CLASS_KEYWORDS = (
    "pages_content",
    "trs_editor",
    "ucap-content",
    "article-content",
    "article_content",
)
ARTICLE_END_MARKERS = (
    '<div class="pages_content pages_contentm',
    '<div class="pages_contentm',
    "<!--二维码-->",
    '<div id="pageBreak"',
    '<div id="qr_container"',
    "<!--footer-->",
    '<div class="footer',
)
TEXT_STOP_MARKERS = (
    "扫一扫在手机打开当前页",
    "链接：\n\n全国人大",
    "中国政府网|关于本网",
    "版权所有：中国政府网",
    "回到顶部",
)


class PolicyRecord:
    def __init__(
        self,
        *,
        source_type: str,
        source_url: str,
        title: str,
        published_at: str,
        agency: str = "",
        document_number: str = "",
        source_site: str = "",
        api_category: str = "",
        api_id: str = "",
        summary: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.source_type = source_type
        self.source_url = source_url
        self.title = title
        self.published_at = published_at
        self.agency = agency
        self.document_number = document_number
        self.source_site = source_site
        self.api_category = api_category
        self.api_id = api_id
        self.summary = summary
        self.metadata = dict(metadata or {})


class PolicyDocumentOutput:
    def __init__(
        self,
        *,
        source_path: Path,
        archive_html_path: Path,
        metadata_path: Path,
        manifest_path: Path,
    ) -> None:
        self.source_path = source_path
        self.archive_html_path = archive_html_path
        self.metadata_path = metadata_path
        self.manifest_path = manifest_path


class _CleanTextParser(HTMLParser):
    def __init__(self, *, target_only: bool) -> None:
        super().__init__(convert_charrefs=True)
        self.target_only = target_only
        self.capture = not target_only
        self.target_depth = 0
        self.skip_depth = 0
        self.found_target = not target_only
        self.fragments: list[str] = []
        self.image_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.skip_depth:
            if tag not in VOID_TAGS:
                self.skip_depth += 1
            return
        if tag in SKIP_TAGS:
            if tag not in VOID_TAGS:
                self.skip_depth = 1
            return
        if self.capture and tag == "img":
            self.image_count += 1

        is_target = self.target_only and self._is_target(attrs)
        if is_target:
            self.capture = True
            self.found_target = True
            self.target_depth = 1
            self._newline()
            return

        if self.capture and self.target_depth:
            self.target_depth += 1
        if self.capture and tag in BLOCK_TAGS:
            self._newline()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.skip_depth:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.capture and tag in BLOCK_TAGS:
            self._newline()
        if self.capture and self.target_depth:
            self.target_depth -= 1
            if self.target_depth <= 0:
                self.capture = False
                self.target_depth = 0

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.skip_depth or tag in SKIP_TAGS:
            return
        if self.capture and tag == "img":
            self.image_count += 1
        if self.capture and tag in BLOCK_TAGS:
            self._newline()

    def handle_data(self, data: str) -> None:
        if not self.capture or self.skip_depth:
            return
        text = data.replace("\xa0", " ").strip()
        if text:
            self.fragments.append(text)

    def _newline(self) -> None:
        if self.fragments and self.fragments[-1] != "\n":
            self.fragments.append("\n")

    def _is_target(self, attrs: list[tuple[str, str | None]]) -> bool:
        values = {name.lower(): str(value or "") for name, value in attrs}
        element_id = values.get("id", "")
        if element_id in TARGET_IDS:
            return True
        class_name = values.get("class", "").lower()
        return any(keyword in class_name for keyword in TARGET_CLASS_KEYWORDS)


def extract_clean_text(html: str) -> str:
    return str(_extract_article_payload(html).get("text") or "")


def _extract_article_payload(html: str) -> dict[str, Any]:
    preferred_fragment = _preferred_article_fragment(html)
    if preferred_fragment:
        preferred_parser = _CleanTextParser(target_only=False)
        preferred_parser.feed(preferred_fragment)
        preferred_text = _postprocess_article_text(_normalize_extracted_text(preferred_parser.fragments))
        if preferred_text:
            return {
                "text": preferred_text,
                "image_count": preferred_parser.image_count,
                "source": "preferred_fragment",
            }

    target_parser = _CleanTextParser(target_only=True)
    target_parser.feed(html)
    target_text = _postprocess_article_text(_normalize_extracted_text(target_parser.fragments))
    if target_parser.found_target and len(target_text) >= 20:
        return {
            "text": target_text,
            "image_count": target_parser.image_count,
            "source": "target",
        }

    fallback_parser = _CleanTextParser(target_only=False)
    fallback_parser.feed(html)
    return {
        "text": _postprocess_article_text(_normalize_extracted_text(fallback_parser.fragments)),
        "image_count": target_parser.image_count or fallback_parser.image_count,
        "source": "fallback",
    }


def _preferred_article_fragment(html: str) -> str:
    match = re.search(r"<[A-Za-z0-9]+[^>]*\bid=[\"']UCAP-CONTENT[\"'][^>]*>", html, flags=re.IGNORECASE)
    if not match:
        return ""
    start = match.start()
    end_candidates = [
        html.find(marker, match.end())
        for marker in ARTICLE_END_MARKERS
        if html.find(marker, match.end()) >= 0
    ]
    end = min(end_candidates) if end_candidates else len(html)
    return html[start:end]


def _postprocess_article_text(text: str) -> str:
    cleaned = text.strip()
    for marker in TEXT_STOP_MARKERS:
        index = cleaned.find(marker)
        if index >= 0:
            cleaned = cleaned[:index].strip()
    return _dedupe_repeated_paragraphs(cleaned)


def _dedupe_repeated_paragraphs(text: str) -> str:
    paragraphs = [paragraph.strip() for paragraph in text.split("\n\n") if paragraph.strip()]
    if len(paragraphs) < 4:
        return text.strip()
    half = len(paragraphs) // 2
    if len(paragraphs) % 2 == 0 and paragraphs[:half] == paragraphs[half:]:
        return "\n\n".join(paragraphs[:half])
    for span in range(half, 2, -1):
        if paragraphs[:span] == paragraphs[span : span * 2]:
            return "\n\n".join(paragraphs[:span] + paragraphs[span * 2 :])
    return text.strip()


def write_policy_document(
    dataset_root: Path | str,
    record: PolicyRecord,
    html: str,
    *,
    save_archive: bool = True,
    overwrite: bool = True,
) -> PolicyDocumentOutput:
    root = Path(dataset_root)
    article_payload = _extract_article_payload(html)
    clean_text = str(article_payload.get("text") or "").strip()
    if not clean_text:
        raise ValueError(f"Could not extract article body for {record.source_url}")
    if int(article_payload.get("image_count") or 0) > 0 and len(clean_text) < 300:
        raise ValueError(f"Article body appears image-only and needs OCR for {record.source_url}")
    paths = policy_document_paths(root, record)
    source_path = paths.source_path
    archive_html_path = paths.archive_html_path
    metadata_path = paths.metadata_path
    manifest_path = paths.manifest_path

    source_path.parent.mkdir(parents=True, exist_ok=True)
    archive_html_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    metadata = _record_metadata(
        record,
        clean_text=clean_text,
        api_id=paths.api_id,
        published_at=paths.published_at,
        source_site=paths.source_site,
    )
    markdown = _render_policy_markdown(record.title, clean_text, metadata)
    if overwrite or not source_path.exists():
        source_path.write_text(markdown, encoding="utf-8")
    if save_archive:
        archive_html_path.write_text(html, encoding="utf-8")
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_record = {
        **metadata,
        "source_path": source_path.relative_to(root).as_posix(),
        "archive_html_path": archive_html_path.relative_to(root).as_posix() if save_archive else "",
        "metadata_path": metadata_path.relative_to(root).as_posix() if save_archive else "",
    }
    _upsert_manifest_record(manifest_path, manifest_record)
    return PolicyDocumentOutput(
        source_path=source_path,
        archive_html_path=archive_html_path,
        metadata_path=metadata_path,
        manifest_path=manifest_path,
    )


class PolicyDocumentPaths:
    def __init__(
        self,
        *,
        source_path: Path,
        archive_html_path: Path,
        metadata_path: Path,
        manifest_path: Path,
        api_id: str,
        published_at: str,
        source_site: str,
    ) -> None:
        self.source_path = source_path
        self.archive_html_path = archive_html_path
        self.metadata_path = metadata_path
        self.manifest_path = manifest_path
        self.api_id = api_id
        self.published_at = published_at
        self.source_site = source_site


def policy_document_paths(dataset_root: Path | str, record: PolicyRecord) -> PolicyDocumentPaths:
    root = Path(dataset_root)
    api_id = record.api_id.strip() or _short_digest(record.source_url)
    published_at = _normalize_date(record.published_at) or date.today().isoformat()
    year, month = published_at[0:4], published_at[5:7]
    source_site = record.source_site.strip() or urlparse(record.source_url).netloc or "unknown"
    source_site_path = _source_site_path(source_site)
    source_type_path = SOURCE_TYPE_CONFIG.get(record.source_type, {}).get("path", record.source_type)
    filename = f"{published_at}__{_safe_filename(record.title)}__{_safe_filename(api_id)}.md"
    source_path = root / "source" / "national" / source_site_path / source_type_path / year / month / filename
    archive_base = (
        root
        / "archive"
        / "national"
        / source_site_path
        / source_type_path
        / year
        / month
        / source_path.stem
    )
    return PolicyDocumentPaths(
        source_path=source_path,
        archive_html_path=archive_base / "source.html",
        metadata_path=archive_base / "metadata.json",
        manifest_path=root / "registry" / "source_manifest.jsonl",
        api_id=api_id,
        published_at=published_at,
        source_site=source_site,
    )


def search_policy_records(
    *,
    source_type: str,
    start_date: str,
    end_date: str,
    query: str = "",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[PolicyRecord], int]:
    config = SOURCE_TYPE_CONFIG[source_type]
    params = {
        "t": config["api_category"],
        "q": query,
        "timetype": "timezd",
        "mintime": start_date,
        "maxtime": end_date,
        "sort": "pubtime",
        "sortType": "1",
        "searchfield": "title:content:summary",
        "p": str(page),
        "n": str(page_size),
        "inpro": "",
        "bmfl": "",
        "dup": "",
        "orpro": "",
        "type": "gwyzcwjk",
    }
    data = _http_get_json(f"{SEARCH_API_URL}?{urlencode(params)}")
    search_vo = data.get("searchVO") if isinstance(data.get("searchVO"), dict) else data
    raw_items = search_vo.get("listVO") if isinstance(search_vo.get("listVO"), list) else []
    total = _coerce_int(search_vo.get("totalCount") or search_vo.get("total") or len(raw_items))
    records = [_record_from_search_item(item, source_type=source_type, api_category=config["api_category"]) for item in raw_items]
    return [record for record in records if record.source_url and record.title], total


def prepare_dataset(
    *,
    dataset_root: Path,
    source_types: tuple[str, ...],
    start_date: str,
    end_date: str,
    query: str = "",
    max_documents: int = 0,
    page_size: int = 50,
    sleep_seconds: float = 0.3,
    save_archive: bool = True,
    overwrite: bool = True,
    skip_existing_source: bool = False,
) -> dict[str, Any]:
    outputs: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for source_type in source_types:
        page = 1
        total = 0
        while True:
            records, total = search_policy_records(
                source_type=source_type,
                start_date=start_date,
                end_date=end_date,
                query=query,
                page=page,
                page_size=page_size,
            )
            if not records:
                break
            for record in records:
                if record.source_url in seen_urls:
                    continue
                seen_urls.add(record.source_url)
                if skip_existing_source and policy_document_paths(dataset_root, record).source_path.exists():
                    continue
                if max_documents and len(outputs) >= max_documents:
                    return _prepare_summary(dataset_root, outputs, errors)
                try:
                    html = _http_get_text(record.source_url)
                    output = write_policy_document(
                        dataset_root,
                        record,
                        html,
                        save_archive=save_archive,
                        overwrite=overwrite,
                    )
                    outputs.append(
                        {
                            "title": record.title,
                            "source_url": record.source_url,
                            "source_path": output.source_path.relative_to(dataset_root).as_posix(),
                        }
                    )
                    if sleep_seconds > 0:
                        time.sleep(sleep_seconds)
                except Exception as exc:  # pragma: no cover - network dependent CLI path
                    errors.append({"source_url": record.source_url, "error": str(exc)})
            if page * page_size >= total:
                break
            page += 1
    return _prepare_summary(dataset_root, outputs, errors)


def main() -> None:
    args = _parse_args()
    start_date = args.start_date or (date.today() - timedelta(days=365 * 5)).isoformat()
    end_date = args.end_date or date.today().isoformat()
    source_types = tuple(item.strip() for item in args.source_types.split(",") if item.strip())
    unknown = [item for item in source_types if item not in SOURCE_TYPE_CONFIG]
    if unknown:
        raise SystemExit(f"Unknown source types: {', '.join(unknown)}")
    summary = prepare_dataset(
        dataset_root=Path(args.dataset_root),
        source_types=source_types,
        start_date=start_date,
        end_date=end_date,
        query=args.query,
        max_documents=args.max_documents,
        page_size=args.page_size,
        sleep_seconds=args.sleep_seconds,
        save_archive=not args.no_archive,
        overwrite=not args.no_overwrite,
        skip_existing_source=args.skip_existing_source,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare a clean official-policy knowledge dataset.")
    parser.add_argument("--dataset-root", default=str(DEFAULT_DATASET_ROOT), help="Dataset root. Only its source/ child should be ingested.")
    parser.add_argument("--source-types", default=",".join(DEFAULT_SOURCE_TYPES), help="Comma-separated source types.")
    parser.add_argument("--start-date", default="", help="Inclusive start date, YYYY-MM-DD. Defaults to roughly five years ago.")
    parser.add_argument("--end-date", default="", help="Inclusive end date, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--query", default="", help="Optional keyword query.")
    parser.add_argument("--max-documents", type=int, default=0, help="0 means no explicit limit.")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--sleep-seconds", type=float, default=0.3)
    parser.add_argument("--no-archive", action="store_true", help="Do not save raw HTML archives.")
    parser.add_argument("--no-overwrite", action="store_true", help="Keep existing source markdown files unchanged.")
    parser.add_argument("--skip-existing-source", action="store_true", help="Do not refetch records that already have clean source markdown.")
    return parser.parse_args()


def _record_from_search_item(item: dict[str, Any], *, source_type: str, api_category: str) -> PolicyRecord:
    source_url = _absolute_url(_first_text(item, "url", "link", "docpuburl"))
    published_at = _normalize_date(_first_text(item, "pubtimeStr", "pubtime", "date", "time"))
    api_id = _first_text(item, "id", "docid", "url")
    return PolicyRecord(
        source_type=source_type,
        source_url=source_url,
        title=_strip_inline_html(_first_text(item, "title", "doctitle", "name")),
        published_at=published_at,
        agency=_strip_inline_html(_first_text(item, "puborg", "source", "publisher")),
        document_number=_strip_inline_html(_first_text(item, "wenhao", "fileno", "document_number")),
        source_site=urlparse(source_url).netloc,
        api_category=api_category,
        api_id=_safe_filename(api_id) or _short_digest(source_url),
        summary=_strip_inline_html(_first_text(item, "summary", "content")),
        metadata={
            "childtype": _first_text(item, "childtype"),
            "search_item_id": _first_text(item, "id"),
        },
    )


def _record_metadata(
    record: PolicyRecord,
    *,
    clean_text: str,
    api_id: str,
    published_at: str,
    source_site: str,
) -> dict[str, Any]:
    metadata = {
        "title": record.title,
        "source_url": record.source_url,
        "source_site": source_site,
        "source_type": record.source_type,
        "published_at": published_at,
        "agency": record.agency,
        "document_number": record.document_number,
        "api_category": record.api_category,
        "api_id": api_id,
        "summary": record.summary,
        "content_hash": "sha256:" + hashlib.sha256(clean_text.encode("utf-8")).hexdigest(),
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
    }
    for key, value in record.metadata.items():
        if key not in metadata and value not in ("", None, [], {}):
            metadata[key] = value
    return {key: value for key, value in metadata.items() if value not in ("", None, [], {})}


def _render_policy_markdown(title: str, body: str, metadata: dict[str, Any]) -> str:
    front_matter = "\n".join(f"{key}: {_front_matter_value(value)}" for key, value in metadata.items())
    return f"---\n{front_matter}\n---\n\n# {title.strip()}\n\n{body.strip()}\n"


def _front_matter_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _upsert_manifest_record(manifest_path: Path, record: dict[str, Any]) -> None:
    records: list[dict[str, Any]] = []
    if manifest_path.exists():
        for line in manifest_path.read_text(encoding="utf-8").splitlines():
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                records.append(parsed)
    key = (record.get("source_url"), record.get("source_path"))
    replaced = False
    for index, existing in enumerate(records):
        if (existing.get("source_url"), existing.get("source_path")) == key:
            records[index] = record
            replaced = True
            break
    if not replaced:
        records.append(record)
    manifest_path.write_text("\n".join(json.dumps(item, ensure_ascii=False, sort_keys=True) for item in records) + "\n", encoding="utf-8")


def _prepare_summary(dataset_root: Path, outputs: list[dict[str, Any]], errors: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "status": "succeeded" if not errors else "completed_with_errors",
        "dataset_root": str(dataset_root),
        "source_folder": str(dataset_root / "source"),
        "document_count": len(outputs),
        "error_count": len(errors),
        "documents": outputs[:20],
        "errors": errors[:20],
    }


def _normalize_extracted_text(fragments: list[str]) -> str:
    raw = "".join(fragments)
    raw = unescape(raw).replace("\xa0", " ")
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in raw.splitlines()]
    return "\n\n".join(line for line in lines if line)


def _strip_inline_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _first_text(item: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _absolute_url(value: str) -> str:
    return urljoin("https://www.gov.cn/", value.strip())


def _normalize_date(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    match = re.search(r"(\d{4})[-年/\.](\d{1,2})[-月/\.](\d{1,2})", value)
    if match:
        year, month, day = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    if re.fullmatch(r"\d{8}", value):
        return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
    timestamp = _coerce_int(value)
    if timestamp > 10_000_000_000:
        timestamp = timestamp // 1000
    if timestamp > 0:
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return ""
    return ""


def _safe_filename(value: str, *, max_length: int = 90) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", str(value or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ._")
    cleaned = re.sub(r"_+", "_", cleaned)
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip(" ._")
    return cleaned or "untitled"


def _safe_path_part(value: str) -> str:
    return _safe_filename(value, max_length=60).lower()


def _source_site_path(source_site: str) -> str:
    normalized = source_site.lower().strip()
    if normalized.startswith("www."):
        normalized = normalized[4:]
    return _safe_path_part(normalized.replace(".", "_"))


def _short_digest(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()[:12]


def _coerce_int(value: Any) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def _http_get_json(url: str) -> dict[str, Any]:
    text = _http_get_text(url)
    payload = json.loads(text)
    return payload if isinstance(payload, dict) else {}


def _http_get_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "TooGraph policy dataset preparer/1.0 (+local research workflow)",
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


if __name__ == "__main__":
    main()
