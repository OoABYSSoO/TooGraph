from __future__ import annotations

import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
KB_DIR = BASE_DIR / "data" / "kb"


def load_knowledge_documents() -> list[dict[str, str]]:
    KB_DIR.mkdir(parents=True, exist_ok=True)
    documents: list[dict[str, str]] = []

    for path in sorted(KB_DIR.glob("*")):
        if not path.is_file():
            continue
        documents.append(_read_document(path))

    return documents


def search_knowledge(query: str, limit: int = 3) -> list[dict[str, str]]:
    query_lower = query.lower().strip()
    documents = load_knowledge_documents()
    if not query_lower:
        return documents[:limit]

    matched = [
        document
        for document in documents
        if query_lower in document["title"].lower() or query_lower in document["content"].lower()
    ]
    if matched:
        return matched[:limit]
    return documents[:limit]


def _read_document(path: Path) -> dict[str, str]:
    if path.suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        title = str(payload.get("title", path.stem))
        content = json.dumps(payload, ensure_ascii=False)
    else:
        title = path.stem.replace("_", " ").strip() or path.name
        content = path.read_text(encoding="utf-8")

    summary = content.strip().replace("\n", " ")[:180]
    return {
        "title": title,
        "source": path.name,
        "summary": summary,
        "content": content,
    }
