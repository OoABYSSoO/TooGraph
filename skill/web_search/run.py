from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup


TAVILY_SEARCH_URL = "https://api.tavily.com/search"
DUCKDUCKGO_SEARCH_URL = "https://duckduckgo.com/html/"
DEFAULT_MAX_RESULTS = 5
MAX_RESULTS = 20
DEFAULT_TIMEOUT_SECONDS = 15.0


def web_search_skill(**skill_inputs: Any) -> dict[str, Any]:
    query = _compact_text(skill_inputs.get("query"))
    if not query:
        return _empty_response(query=query, status="failed", error="Search query is required.")
    query = _enrich_time_sensitive_web_search_query(query)

    max_results = _parse_int(skill_inputs.get("max_results"), default=DEFAULT_MAX_RESULTS, minimum=1, maximum=MAX_RESULTS)
    search_depth = _parse_search_depth(skill_inputs.get("search_depth"))
    include_raw_content = _parse_bool(skill_inputs.get("include_raw_content"))
    timeout_seconds = _parse_float(skill_inputs.get("timeout_seconds"), default=DEFAULT_TIMEOUT_SECONDS)
    api_key = _resolve_tavily_api_key(skill_inputs)
    provider = "tavily" if api_key else "duckduckgo"

    try:
        if api_key:
            raw_response = _search_with_tavily(
                query=query,
                max_results=max_results,
                search_depth=search_depth,
                include_raw_content=include_raw_content,
                api_key=api_key,
                timeout_seconds=timeout_seconds,
            )
        else:
            raw_response = _search_with_duckduckgo(
                query=query,
                max_results=max_results,
                timeout_seconds=timeout_seconds,
            )
    except Exception as exc:
        return _empty_response(query=query, provider=provider, status="failed", error=str(exc))

    results = _normalize_results(raw_response.get("results", []), max_results=max_results)
    citations = [
        {"index": index, "title": result["title"], "url": result["url"]}
        for index, result in enumerate(results, start=1)
    ]
    searched_at = _current_search_timestamp()
    searched_date = searched_at[:10]
    return {
        "status": "succeeded",
        "provider": provider,
        "query": query,
        "result_count": len(results),
        "searched_at": searched_at,
        "searched_date": searched_date,
        "summary": _build_summary(str(raw_response.get("answer") or ""), results),
        "context": _build_context(results, searched_at=searched_at, searched_date=searched_date),
        "results": results,
        "citations": citations,
        "error": "",
    }


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


def _build_summary(answer: str, results: list[dict[str, Any]]) -> str:
    answer = _compact_text(answer)
    if answer:
        return answer
    if not results:
        return "No web results found."
    lines = []
    for index, result in enumerate(results[:3], start=1):
        content = _compact_text(result.get("content"))
        lines.append(f"{index}. {result['title']}: {content}" if content else f"{index}. {result['title']}")
    return "\n".join(lines)


def _build_context(results: list[dict[str, Any]], *, searched_at: str, searched_date: str) -> str:
    context_blocks = [
        f"Search executed at: {searched_at}\nSearch date: {searched_date}",
    ]
    for index, result in enumerate(results, start=1):
        content = _compact_text(result.get("content"))
        raw_content = _compact_text(result.get("raw_content"))
        body = raw_content or content
        context_blocks.append(f"[{index}] {result['title']}\nURL: {result['url']}\n{body}".strip())
    return "\n\n".join(context_blocks)


def _empty_response(*, query: str, provider: str = "none", status: str, error: str) -> dict[str, Any]:
    searched_at = _current_search_timestamp()
    return {
        "status": status,
        "provider": provider,
        "query": query,
        "result_count": 0,
        "searched_at": searched_at,
        "searched_date": searched_at[:10],
        "summary": "",
        "context": "",
        "results": [],
        "citations": [],
        "error": error,
    }


def _resolve_tavily_api_key(skill_inputs: dict[str, Any]) -> str:
    return _compact_text(skill_inputs.get("api_key")) or _compact_text(os.getenv("TAVILY_API_KEY"))


def _parse_search_depth(value: object) -> str:
    candidate = _compact_text(value).lower()
    return candidate if candidate in {"advanced", "basic", "fast", "ultra-fast"} else "basic"


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


def _parse_float(value: object, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return parsed if parsed > 0 else default


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


def _current_search_timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


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
