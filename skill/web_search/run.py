from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup


TAVILY_SEARCH_URL = "https://api.tavily.com/search"
DUCKDUCKGO_SEARCH_URL = "https://duckduckgo.com/html/"
DEFAULT_MAX_RESULTS = 5
DEFAULT_SEARCH_DEPTH = "basic"
DEFAULT_INCLUDE_RAW_CONTENT = False
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_MAX_PAGES = 3
DEFAULT_MAX_CHARS_PER_PAGE = 200_000
PAGE_FETCH_USER_AGENT = "GraphiteUI/1.0 (+https://github.com/AbyssBadger0/GraphiteUI)"


def web_search_skill(**skill_inputs: Any) -> dict[str, Any]:
    query = _compact_text(skill_inputs.get("query"))
    if not query:
        return _final_response(source_urls=[], artifact_paths=[], errors=["Search query is required."])
    query = _enrich_time_sensitive_web_search_query(query)

    api_key = _resolve_tavily_api_key(skill_inputs)

    try:
        if api_key:
            raw_response = _search_with_tavily(
                query=query,
                max_results=DEFAULT_MAX_RESULTS,
                search_depth=DEFAULT_SEARCH_DEPTH,
                include_raw_content=DEFAULT_INCLUDE_RAW_CONTENT,
                api_key=api_key,
                timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            )
        else:
            raw_response = _search_with_duckduckgo(
                query=query,
                max_results=DEFAULT_MAX_RESULTS,
                timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            )
    except Exception as exc:
        return _final_response(source_urls=[], artifact_paths=[], errors=[str(exc)])

    results = _normalize_results(raw_response.get("results", []), max_results=DEFAULT_MAX_RESULTS)
    source_documents = _fetch_source_documents(
        results,
        max_pages=DEFAULT_MAX_PAGES,
        max_chars_per_page=DEFAULT_MAX_CHARS_PER_PAGE,
        timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
    )
    source_urls = [result["url"] for result in results if result.get("url")]
    artifact_paths = [
        str(document.get("local_path"))
        for document in source_documents
        if document.get("status") == "succeeded" and document.get("local_path")
    ]
    errors = [
        str(document.get("error"))
        for document in source_documents
        if document.get("status") == "failed" and document.get("error")
    ]
    return _final_response(source_urls=source_urls, artifact_paths=artifact_paths, errors=errors)


def _search_with_tavily(
    *,
    query: str,
    max_results: int,
    search_depth: str,
    include_raw_content: bool,
    api_key: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    payload = {
        "query": query,
        "search_depth": search_depth,
        "max_results": max_results,
        "include_answer": True,
        "include_raw_content": include_raw_content,
        "include_images": False,
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(TAVILY_SEARCH_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
    return data if isinstance(data, dict) else {"results": []}


def _search_with_duckduckgo(*, query: str, max_results: int, timeout_seconds: float) -> dict[str, Any]:
    headers = {
        "User-Agent": "GraphiteUI/1.0 (+https://github.com/AbyssBadger0/GraphiteUI)",
    }
    with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
        response = client.get(DUCKDUCKGO_SEARCH_URL, params={"q": query}, headers=headers)
        response.raise_for_status()
        html = response.text
    return {"results": _parse_duckduckgo_results(html, max_results=max_results)}


def _parse_duckduckgo_results(html: str, *, max_results: int) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict[str, Any]] = []
    for result_node in soup.select(".result"):
        link = result_node.select_one("a.result__a")
        if link is None:
            continue
        title = _compact_text(link.get_text(" ", strip=True))
        url = _resolve_duckduckgo_url(str(link.get("href") or ""))
        if not title or not url:
            continue
        snippet_node = result_node.select_one(".result__snippet")
        snippet = _compact_text(snippet_node.get_text(" ", strip=True) if snippet_node else "")
        results.append(
            {
                "title": title,
                "url": url,
                "content": snippet,
                "score": None,
            }
        )
        if len(results) >= max_results:
            break
    return results


def _normalize_results(raw_results: object, *, max_results: int) -> list[dict[str, Any]]:
    if not isinstance(raw_results, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in raw_results[:max_results]:
        if not isinstance(item, dict):
            continue
        title = _compact_text(item.get("title"))
        url = _compact_text(item.get("url"))
        if not title or not url:
            continue
        normalized_item: dict[str, Any] = {
            "title": title,
            "url": url,
            "content": _compact_text(item.get("content") or item.get("snippet") or item.get("body")),
            "score": item.get("score"),
        }
        raw_content = item.get("raw_content")
        if raw_content:
            normalized_item["raw_content"] = str(raw_content)
        normalized.append(normalized_item)
    return normalized


def _fetch_source_documents(
    results: list[dict[str, Any]],
    *,
    max_pages: int,
    max_chars_per_page: int,
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    if not results:
        return []
    artifact_dir = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_DIR"))
    artifact_relative_dir = _compact_text(os.getenv("GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR")).replace("\\", "/").strip("/")
    if not artifact_dir or not artifact_relative_dir:
        return []

    output_dir = Path(artifact_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    documents: list[dict[str, Any]] = []
    for index, result in enumerate(results[:max_pages], start=1):
        documents.append(
            _fetch_and_store_source_document(
                result,
                index=index,
                output_dir=output_dir,
                artifact_relative_dir=artifact_relative_dir,
                max_chars=max_chars_per_page,
                timeout_seconds=timeout_seconds,
            )
        )
    return documents


def _fetch_and_store_source_document(
    result: dict[str, Any],
    *,
    index: int,
    output_dir: Path,
    artifact_relative_dir: str,
    max_chars: int,
    timeout_seconds: float,
) -> dict[str, Any]:
    title = _compact_text(result.get("title")) or f"Source {index}"
    url = _compact_text(result.get("url"))
    document: dict[str, Any] = {
        "index": index,
        "title": title,
        "url": url,
        "status": "failed",
        "error": "",
    }
    try:
        parsed_url = urlparse(url)
        if parsed_url.scheme not in {"http", "https"}:
            raise ValueError("Only http and https source URLs can be fetched.")
        extracted_title, page_text = _load_source_page_text(
            url=url,
            fallback_title=title,
            raw_content=_compact_multiline_text(result.get("raw_content")),
            timeout_seconds=timeout_seconds,
        )
        page_text = _truncate_text(page_text, max_chars)
        if not page_text:
            raise ValueError("Fetched page did not contain readable text.")
        document_title = extracted_title or title
        file_name = f"doc_{index:03d}.md"
        document_path = output_dir / file_name
        document_path.write_text(_render_source_document_markdown(content=page_text), encoding="utf-8")
        return {
            **document,
            "title": document_title,
            "status": "succeeded",
            "error": "",
            "local_path": f"{artifact_relative_dir}/{file_name}",
        }
    except Exception as exc:
        return {
            **document,
            "error": str(exc),
        }


def _load_source_page_text(
    *,
    url: str,
    fallback_title: str,
    raw_content: str,
    timeout_seconds: float,
) -> tuple[str, str]:
    if raw_content:
        return fallback_title, raw_content
    headers = {"User-Agent": PAGE_FETCH_USER_AGENT}
    with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
        response = client.get(url, headers=headers)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        html = response.text
    return _extract_readable_page_text(html, content_type=content_type, fallback_title=fallback_title)


def _extract_readable_page_text(html: str, *, content_type: str, fallback_title: str) -> tuple[str, str]:
    if "html" not in content_type.lower():
        return fallback_title, _compact_multiline_text(html)
    soup = BeautifulSoup(html, "html.parser")
    for selector in ("script", "style", "noscript", "svg", "nav", "header", "footer", "form", "aside"):
        for node in soup.select(selector):
            node.decompose()
    title = _compact_text(soup.title.get_text(" ", strip=True) if soup.title else "") or fallback_title
    body = soup.select_one("article") or soup.select_one("main") or soup.select_one("[role='main']") or soup.body or soup
    return title, _compact_multiline_text(body.get_text("\n", strip=True))


def _render_source_document_markdown(*, content: str) -> str:
    return f"{content.rstrip()}\n"


def _final_response(
    *,
    source_urls: list[str],
    artifact_paths: list[str],
    errors: list[str],
) -> dict[str, Any]:
    return {
        "source_urls": source_urls,
        "artifact_paths": artifact_paths,
        "errors": errors,
    }


def _resolve_tavily_api_key(skill_inputs: dict[str, Any]) -> str:
    return _compact_text(skill_inputs.get("api_key")) or _compact_text(os.getenv("TAVILY_API_KEY"))


def _enrich_time_sensitive_web_search_query(query: str, *, now: datetime | None = None) -> str:
    normalized_query = _compact_text(query)
    if not normalized_query:
        return ""
    current_time = now.astimezone() if now is not None else datetime.now().astimezone()
    current_date = current_time.date().isoformat()
    if current_date in normalized_query:
        return normalized_query
    if not _looks_time_sensitive_query(normalized_query):
        return normalized_query
    return f"{normalized_query} {current_date}"


def _looks_time_sensitive_query(query: str) -> bool:
    query_lower = query.lower()
    time_sensitive_terms = (
        "今天",
        "今日",
        "现在",
        "当前",
        "最新",
        "最近",
        "近期",
        "发布日期",
        "发布时间",
        "价格",
        "新闻",
        "版本",
        "更新",
        "today",
        "current",
        "latest",
        "recent",
        "release date",
        "released",
        "price",
        "pricing",
        "news",
        "version",
        "update",
    )
    return any(term in query_lower for term in time_sensitive_terms)


def _compact_text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _compact_multiline_text(value: object) -> str:
    if value is None:
        return ""
    lines = [line.strip() for line in str(value).replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    compacted: list[str] = []
    previous_empty = False
    for line in lines:
        if not line:
            if not previous_empty and compacted:
                compacted.append("")
            previous_empty = True
            continue
        compacted.append(" ".join(line.split()))
        previous_empty = False
    return "\n".join(compacted).strip()


def _truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}\n\n[Content truncated by web_search skill at {max_chars} characters.]"


def _resolve_duckduckgo_url(href: str) -> str:
    if href.startswith("//"):
        href = f"https:{href}"
    parsed = urlparse(href)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        return unquote(target)
    return href


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        payload = {"query": "", "error": f"Invalid JSON input: {exc}"}
    if not isinstance(payload, dict):
        payload = {"query": "", "error": "Skill input must be a JSON object."}
    result = web_search_skill(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
