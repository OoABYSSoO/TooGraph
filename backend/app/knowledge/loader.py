from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import tempfile
import time
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.error import URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

from app.core.storage.database import get_connection


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = Path(__file__).resolve().parents[2]
KNOWLEDGE_ROOT = BACKEND_DIR / "data" / "kb"
DOWNLOAD_ROOT = KNOWLEDGE_ROOT / "_downloads"
DEFAULT_KNOWLEDGE_BASE = "langgraph-official-v1"
HTTP_USER_AGENT = "GraphiteUI-KB-Importer/1.0"
PYTHON_DOCS_DOWNLOAD_URL = "https://docs.python.org/3/download.html"
PYTHON_DOCS_BASE_URL = "https://docs.python.org/3/"
LANGGRAPH_DOCS_START_URL = "https://docs.langchain.com/oss/python/langgraph/overview"
LANGGRAPH_DOCS_ALLOWED_PREFIX = "https://docs.langchain.com/oss/python/langgraph/"
BLOCK_TEXT_TAGS = ("h1", "h2", "h3", "h4", "p", "li", "pre", "dt", "dd", "blockquote")


@dataclass(slots=True)
class KnowledgeBaseRecord:
    kb_id: str
    label: str
    description: str
    source_kind: str
    source_url: str
    version: str
    payload: dict[str, object]


@dataclass(slots=True)
class KnowledgeDocument:
    doc_id: str
    title: str
    url: str
    section: str
    content: str
    source_path: str
    metadata: dict[str, object]


def list_knowledge_bases() -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT kb_id, label, description, source_kind, source_url, version, document_count, chunk_count, imported_at
            FROM knowledge_bases
            ORDER BY updated_at DESC, kb_id ASC
            """
        ).fetchall()

    return [
        {
            "name": row["kb_id"],
            "kb_id": row["kb_id"],
            "label": row["label"],
            "description": row["description"],
            "sourceKind": row["source_kind"],
            "sourceUrl": row["source_url"],
            "version": row["version"],
            "documentCount": row["document_count"],
            "chunkCount": row["chunk_count"],
            "importedAt": row["imported_at"],
        }
        for row in rows
    ]


def load_knowledge_documents(knowledge_base: str | None = None) -> list[dict[str, str]]:
    kb_id = _resolve_knowledge_base_id(knowledge_base)
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT title, url, section, source_path, content
            FROM knowledge_documents
            WHERE kb_id = ?
            ORDER BY title ASC, doc_id ASC
            """,
            (kb_id,),
        ).fetchall()

    return [
        {
            "title": row["title"],
            "source": row["url"] or row["source_path"],
            "summary": _summarize_text(row["content"], limit=180),
            "content": row["content"],
            "section": row["section"],
            "url": row["url"],
            "kb_id": kb_id,
        }
        for row in rows
    ]


def search_knowledge(query: str, *, knowledge_base: str | None = None, limit: int = 3) -> list[dict[str, object]]:
    kb_id = _resolve_knowledge_base_id(knowledge_base)
    normalized_limit = max(1, min(int(limit or 3), 8))
    normalized_query = query.strip()

    with get_connection() as connection:
        kb_row = connection.execute(
            "SELECT kb_id, label FROM knowledge_bases WHERE kb_id = ?",
            (kb_id,),
        ).fetchone()
        if kb_row is None:
            raise ValueError(f"Unknown knowledge base '{kb_id}'.")

        if normalized_query:
            ranked_rows = _search_ranked_rows(connection, kb_id, normalized_query, normalized_limit)
        else:
            ranked_rows = connection.execute(
                """
                SELECT chunk_id, title, section, url, summary, content, metadata_json
                FROM knowledge_chunks
                WHERE kb_id = ?
                ORDER BY doc_id ASC, ordinal ASC
                LIMIT ?
                """,
                (kb_id, normalized_limit),
            ).fetchall()

    return [
        {
            "title": row["title"],
            "section": row["section"],
            "source": row["url"],
            "url": row["url"],
            "summary": row["summary"],
            "content": row["content"],
            "score": float(row["score"]) if "score" in row.keys() and row["score"] is not None else 0.0,
            "kb_id": kb_id,
            "kb_label": kb_row["label"],
            "chunk_id": row["chunk_id"],
            "metadata": json.loads(row["metadata_json"] or "{}"),
        }
        for row in ranked_rows
    ]


def import_official_knowledge_bases() -> list[dict[str, object]]:
    imported = [
        import_python_official_knowledge_base(),
        import_langgraph_official_knowledge_base(),
    ]
    return imported


def import_python_official_knowledge_base() -> dict[str, object]:
    archive_url = _resolve_python_archive_url()
    archive_name = Path(urlparse(archive_url).path).name
    version_match = re.search(r"python-(?P<version>\d+(?:\.\d+)*)-docs-html\.zip", archive_name)
    version = version_match.group("version") if version_match else "3"
    kb_id = f"python-official-{version}"
    archive_path = DOWNLOAD_ROOT / archive_name
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    _download_file(archive_url, archive_path)

    documents: list[KnowledgeDocument] = []
    with tempfile.TemporaryDirectory(prefix="graphiteui-python-docs-") as temp_dir:
        temp_path = Path(temp_dir)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(temp_path)
        html_root = _resolve_extracted_html_root(temp_path)
        for path in sorted(html_root.rglob("*.html")):
            relative_path = path.relative_to(html_root)
            if not _should_index_python_html(relative_path):
                continue
            document = _parse_html_document(
                path.read_text(encoding="utf-8", errors="ignore"),
                url=urljoin(PYTHON_DOCS_BASE_URL, relative_path.as_posix()),
                doc_id=relative_path.with_suffix("").as_posix(),
                source_path=relative_path.as_posix(),
            )
            if document is not None:
                documents.append(document)

    record = KnowledgeBaseRecord(
        kb_id=kb_id,
        label=f"Python Official Docs {version}",
        description=f"Official Python documentation imported from {archive_url}.",
        source_kind="python_docs_archive",
        source_url=archive_url,
        version=version,
        payload={
            "download_url": archive_url,
            "imported_at": _utc_now_iso(),
        },
    )
    return _replace_knowledge_base(record, documents)


def import_langgraph_official_knowledge_base() -> dict[str, object]:
    documents = _crawl_langgraph_docs()
    record = KnowledgeBaseRecord(
        kb_id="langgraph-official-v1",
        label="LangGraph Official Docs",
        description="Official LangGraph OSS Python documentation crawled from docs.langchain.com.",
        source_kind="langgraph_docs_site",
        source_url=LANGGRAPH_DOCS_START_URL,
        version="v1",
        payload={
            "start_url": LANGGRAPH_DOCS_START_URL,
            "imported_at": _utc_now_iso(),
        },
    )
    return _replace_knowledge_base(record, documents)


def _resolve_knowledge_base_id(knowledge_base: str | None) -> str:
    requested = (knowledge_base or "").strip()
    with get_connection() as connection:
        if requested:
            row = connection.execute(
                "SELECT kb_id FROM knowledge_bases WHERE kb_id = ?",
                (requested,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Unknown knowledge base '{requested}'.")
            return str(row["kb_id"])

        default_row = connection.execute(
            """
            SELECT kb_id
            FROM knowledge_bases
            ORDER BY CASE WHEN kb_id = ? THEN 0 ELSE 1 END, updated_at DESC, kb_id ASC
            LIMIT 1
            """,
            (DEFAULT_KNOWLEDGE_BASE,),
        ).fetchone()
        if default_row is not None:
            return str(default_row["kb_id"])

    raise ValueError("No knowledge bases are currently imported.")


def _search_ranked_rows(connection: sqlite3.Connection, kb_id: str, query: str, limit: int) -> list[sqlite3.Row]:
    candidate_limit = max(limit * 6, 12)
    fts_query = _build_fts_query(query)
    ranked_rows: list[sqlite3.Row] = []

    if fts_query:
        try:
            ranked_rows = connection.execute(
                """
                SELECT
                    c.chunk_id,
                    c.title,
                    c.section,
                    c.url,
                    c.summary,
                    c.content,
                    c.metadata_json,
                    bm25(knowledge_chunks_fts, 8.0, 4.0, 1.0, 0.5) AS score
                FROM knowledge_chunks_fts
                JOIN knowledge_chunks c ON c.chunk_id = knowledge_chunks_fts.chunk_id
                WHERE knowledge_chunks_fts MATCH ?
                  AND c.kb_id = ?
                ORDER BY score
                LIMIT ?
                """,
                (fts_query, kb_id, candidate_limit),
            ).fetchall()
        except sqlite3.OperationalError:
            ranked_rows = []

    query_like = f"%{query.lower()}%"
    fallback_rows = connection.execute(
        """
        SELECT chunk_id, title, section, url, summary, content, metadata_json, 0.0 AS score
        FROM knowledge_chunks
        WHERE kb_id = ?
          AND (
            lower(title) LIKE ?
            OR lower(section) LIKE ?
            OR lower(url) LIKE ?
            OR lower(content) LIKE ?
          )
        LIMIT ?
        """,
        (kb_id, query_like, query_like, query_like, query_like, candidate_limit),
    ).fetchall()

    combined_rows = {row["chunk_id"]: row for row in [*ranked_rows, *fallback_rows]}
    query_lower = query.lower()
    search_terms = _extract_search_terms(query_lower)

    reranked = sorted(
        combined_rows.values(),
        key=lambda row: _score_chunk_row(row, query_lower, search_terms),
        reverse=True,
    )
    return reranked[:limit]


def _score_chunk_row(row: sqlite3.Row, query_lower: str, search_terms: list[str]) -> float:
    title = str(row["title"]).lower()
    section = str(row["section"]).lower()
    url = str(row["url"]).lower()
    content = str(row["content"]).lower()
    metadata = json.loads(row["metadata_json"] or "{}")
    source_path = str(metadata.get("source_path") or "").lower().lstrip("/")
    score = 0.0
    base_rank = row["score"] if "score" in row.keys() else 0.0
    if isinstance(base_rank, (float, int)):
        score += -float(base_rank)
    if query_lower in title:
        score += 18
    if query_lower in section:
        score += 10
    if query_lower in url:
        score += 8
    if query_lower in content:
        score += 5
    for term in search_terms:
        if term in title:
            score += 6
        elif term in section:
            score += 4
        elif term in url:
            score += 3
        elif term in content:
            score += 1
    if source_path.startswith("library/"):
        score += 8
    elif source_path.startswith("reference/"):
        score += 5
    elif source_path.startswith("howto/"):
        score += 3
    elif source_path.startswith("tutorial/"):
        score += 1
    elif source_path.startswith("whatsnew/") and "what" not in query_lower and "new" not in query_lower:
        score -= 6
    return score


def _replace_knowledge_base(record: KnowledgeBaseRecord, documents: list[KnowledgeDocument]) -> dict[str, object]:
    KNOWLEDGE_ROOT.mkdir(parents=True, exist_ok=True)
    kb_dir = KNOWLEDGE_ROOT / record.kb_id
    kb_dir.mkdir(parents=True, exist_ok=True)
    chunks = _chunk_documents(record.kb_id, documents)
    imported_at = _utc_now_iso()

    with get_connection() as connection:
        connection.execute("DELETE FROM knowledge_chunks_fts WHERE kb_id = ?", (record.kb_id,))
        connection.execute("DELETE FROM knowledge_chunks WHERE kb_id = ?", (record.kb_id,))
        connection.execute("DELETE FROM knowledge_documents WHERE kb_id = ?", (record.kb_id,))

        for document in documents:
            connection.execute(
                """
                INSERT INTO knowledge_documents (
                    kb_id, doc_id, title, url, section, source_path, content, content_hash, metadata_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    record.kb_id,
                    document.doc_id,
                    document.title,
                    document.url,
                    document.section,
                    document.source_path,
                    document.content,
                    hashlib.sha256(document.content.encode("utf-8")).hexdigest(),
                    json.dumps(document.metadata, ensure_ascii=False),
                ),
            )

        for chunk in chunks:
            connection.execute(
                """
                INSERT INTO knowledge_chunks (
                    chunk_id, kb_id, doc_id, ordinal, title, section, url, summary, content, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk["chunk_id"],
                    chunk["kb_id"],
                    chunk["doc_id"],
                    chunk["ordinal"],
                    chunk["title"],
                    chunk["section"],
                    chunk["url"],
                    chunk["summary"],
                    chunk["content"],
                    json.dumps(chunk["metadata"], ensure_ascii=False),
                ),
            )
            connection.execute(
                """
                INSERT INTO knowledge_chunks_fts (chunk_id, kb_id, doc_id, title, section, url, content)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk["chunk_id"],
                    chunk["kb_id"],
                    chunk["doc_id"],
                    chunk["title"],
                    chunk["section"],
                    chunk["url"],
                    chunk["content"],
                ),
            )

        connection.execute(
            """
            INSERT INTO knowledge_bases (
                kb_id, label, description, source_kind, source_url, version,
                document_count, chunk_count, imported_at, payload_json, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(kb_id) DO UPDATE SET
                label = excluded.label,
                description = excluded.description,
                source_kind = excluded.source_kind,
                source_url = excluded.source_url,
                version = excluded.version,
                document_count = excluded.document_count,
                chunk_count = excluded.chunk_count,
                imported_at = excluded.imported_at,
                payload_json = excluded.payload_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                record.kb_id,
                record.label,
                record.description,
                record.source_kind,
                record.source_url,
                record.version,
                len(documents),
                len(chunks),
                imported_at,
                json.dumps(record.payload, ensure_ascii=False),
            ),
        )
        connection.commit()

    manifest = {
        "kb_id": record.kb_id,
        "label": record.label,
        "description": record.description,
        "source_kind": record.source_kind,
        "source_url": record.source_url,
        "version": record.version,
        "document_count": len(documents),
        "chunk_count": len(chunks),
        "imported_at": imported_at,
    }
    (kb_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "name": record.kb_id,
        "kb_id": record.kb_id,
        "label": record.label,
        "description": record.description,
        "sourceKind": record.source_kind,
        "sourceUrl": record.source_url,
        "version": record.version,
        "documentCount": len(documents),
        "chunkCount": len(chunks),
        "importedAt": imported_at,
    }


def _chunk_documents(kb_id: str, documents: list[KnowledgeDocument]) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    for document in documents:
        for ordinal, content in enumerate(_split_text_into_chunks(document.content), start=1):
            chunks.append(
                {
                    "chunk_id": f"{kb_id}:{document.doc_id}:{ordinal}",
                    "kb_id": kb_id,
                    "doc_id": document.doc_id,
                    "ordinal": ordinal,
                    "title": document.title,
                    "section": document.section,
                    "url": document.url,
                    "summary": _summarize_text(content, limit=240),
                    "content": content,
                    "metadata": document.metadata,
                }
            )
    return chunks


def _split_text_into_chunks(text: str, *, max_chars: int = 1400, overlap: int = 180) -> list[str]:
    normalized = _normalize_whitespace(text)
    if not normalized:
        return []

    if len(normalized) <= max_chars:
        return [normalized]

    chunks: list[str] = []
    cursor = 0
    text_length = len(normalized)
    min_break = max_chars // 2

    while cursor < text_length:
        end = min(cursor + max_chars, text_length)
        if end < text_length:
            break_candidates = [
                normalized.rfind("\n", cursor + min_break, end),
                normalized.rfind(". ", cursor + min_break, end),
                normalized.rfind("。", cursor + min_break, end),
                normalized.rfind(" ", cursor + min_break, end),
            ]
            break_at = max(candidate for candidate in break_candidates if candidate != -1) if any(candidate != -1 for candidate in break_candidates) else -1
            if break_at != -1 and break_at > cursor:
                end = break_at + 1

        chunk = normalized[cursor:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_length:
            break
        cursor = max(end - overlap, cursor + 1)

    return chunks


def _resolve_python_archive_url() -> str:
    html = _http_get_text(PYTHON_DOCS_DOWNLOAD_URL)
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[str] = []
    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href") or "").strip()
        if "docs-html.zip" not in href:
            continue
        candidates.append(urljoin(PYTHON_DOCS_DOWNLOAD_URL, href))

    if not candidates:
        raise RuntimeError("Could not find the Python HTML docs archive URL.")
    return sorted(candidates, reverse=True)[0]


def _crawl_langgraph_docs() -> list[KnowledgeDocument]:
    queue = [LANGGRAPH_DOCS_START_URL]
    visited: set[str] = set()
    documents: list[KnowledgeDocument] = []

    while queue and len(visited) < 160:
        current_url = queue.pop(0)
        normalized_url = _normalize_crawl_url(current_url)
        if not normalized_url or normalized_url in visited:
            continue
        visited.add(normalized_url)
        try:
            html = _http_get_text(normalized_url)
        except URLError:
            continue
        document = _parse_html_document(
            html,
            url=normalized_url,
            doc_id=_doc_id_from_url(normalized_url),
            source_path=urlparse(normalized_url).path,
        )
        if document is not None:
            documents.append(document)

        soup = BeautifulSoup(html, "html.parser")
        for anchor in soup.select("a[href]"):
            href = str(anchor.get("href") or "").strip()
            next_url = _normalize_crawl_url(urljoin(normalized_url, href))
            if next_url and next_url not in visited and next_url not in queue:
                queue.append(next_url)

    return documents


def _normalize_crawl_url(url: str) -> str | None:
    if not url or url.startswith(("mailto:", "javascript:")):
        return None
    normalized, _ = urldefrag(url)
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not normalized.startswith(LANGGRAPH_DOCS_ALLOWED_PREFIX):
        return None
    path = parsed.path.rstrip("/") or parsed.path
    return parsed._replace(path=path, query="", fragment="").geturl()


def _doc_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/") or "index"
    return path.replace("/", "__")


def _download_file(url: str, destination: Path) -> None:
    request = Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    with urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def _http_get_text(url: str) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        request = Request(url, headers={"User-Agent": HTTP_USER_AGENT})
        try:
            with urlopen(request, timeout=60) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception as exc:  # pragma: no cover - network retry path
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    if isinstance(last_error, Exception):
        raise URLError(last_error)
    raise URLError("Unknown network error")


def _resolve_extracted_html_root(root: Path) -> Path:
    html_roots = [path for path in root.iterdir() if path.is_dir()]
    if len(html_roots) == 1:
        return html_roots[0]
    return root


def _should_index_python_html(relative_path: Path) -> bool:
    normalized = relative_path.as_posix()
    if normalized.startswith(("_static/", "_images/", "_sources/")):
        return False
    if relative_path.name in {"genindex.html", "modindex.html", "search.html", "download.html"}:
        return False
    return True


def _parse_html_document(html: str, *, url: str, doc_id: str, source_path: str) -> KnowledgeDocument | None:
    soup = BeautifulSoup(html, "html.parser")
    main = (
        soup.select_one("main")
        or soup.select_one('[role="main"]')
        or soup.select_one("article")
        or soup.select_one("div.body")
        or soup.body
    )
    if main is None:
        return None

    for selector in ("script", "style", "nav", "footer", "aside", "button", ".headerlink", ".copy", ".sr-only"):
        for node in main.select(selector):
            node.decompose()

    title = ""
    heading = main.find(["h1", "h2"])
    if heading is not None:
        title = heading.get_text(" ", strip=True)
    if not title and soup.title is not None:
        title = soup.title.get_text(" ", strip=True).split("—")[0].split("-")[0].strip()
    title = title or doc_id

    content = _extract_block_text(main)
    if len(content) < 200:
        return None

    return KnowledgeDocument(
        doc_id=doc_id,
        title=title,
        url=url,
        section=title,
        content=content,
        source_path=source_path,
        metadata={
            "source_path": source_path,
        },
    )


def _extract_block_text(main: BeautifulSoup) -> str:
    blocks: list[str] = []
    for element in main.find_all(BLOCK_TEXT_TAGS):
        if element.find_parent(BLOCK_TEXT_TAGS):
            continue
        text = _normalize_whitespace(element.get_text(" ", strip=True))
        if text and (not blocks or blocks[-1] != text):
            blocks.append(text)

    if blocks:
        return "\n\n".join(blocks)
    return _normalize_whitespace(main.get_text(" ", strip=True))


def _build_fts_query(query: str) -> str:
    terms = _extract_search_terms(query.lower())
    if not terms:
        return ""
    return " OR ".join(json.dumps(term) for term in terms[:12])


def _extract_search_terms(query: str) -> list[str]:
    raw_terms = re.findall(r"[a-z0-9_]+(?:\.[a-z0-9_]+)*|[\u4e00-\u9fff]{2,}", query)
    expanded: list[str] = []
    for term in raw_terms:
        expanded.append(term)
        if "." in term:
            expanded.extend(part for part in term.split(".") if part)
    return list(dict.fromkeys(item for item in expanded if item))


def _normalize_whitespace(text: str) -> str:
    cleaned = text.replace("\r", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _summarize_text(text: str, *, limit: int) -> str:
    condensed = re.sub(r"\s+", " ", text).strip()
    if len(condensed) <= limit:
        return condensed
    return condensed[: limit - 3].rstrip() + "..."


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
