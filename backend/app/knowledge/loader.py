from __future__ import annotations

import json
from pathlib import Path
import re


ROOT_DIR = Path(__file__).resolve().parents[3]
KNOWLEDGE_ROOT = ROOT_DIR / "knowledge"
DEFAULT_KNOWLEDGE_BASE = "GraphiteUI-official"

def load_knowledge_documents(knowledge_base: str | None = None) -> list[dict[str, str]]:
    KNOWLEDGE_ROOT.mkdir(parents=True, exist_ok=True)
    base_dir = _resolve_knowledge_base_dir(knowledge_base)
    documents: list[dict[str, str]] = []

    if not base_dir.exists():
        return documents

    for path in sorted(base_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        documents.append(_read_document(path, base_dir=base_dir))

    return documents


def search_knowledge(query: str, *, knowledge_base: str | None = None, limit: int = 3) -> list[dict[str, str]]:
    query_lower = query.lower().strip()
    documents = load_knowledge_documents(knowledge_base=knowledge_base)
    if not query_lower:
        return documents[:limit]

    ranked: list[tuple[int, dict[str, str]]] = []
    search_terms = _extract_search_terms(query_lower)
    for document in documents:
        title = document["title"].lower()
        content = document["content"].lower()
        score = 0
        if query_lower in title:
            score += 10
        if query_lower in content:
            score += 6
        for term in search_terms:
            if term in title:
                score += 4
            elif term in content:
                score += 2
        if score > 0:
            ranked.append((score, document))

    if ranked:
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [document for _, document in ranked[:limit]]
    return documents[:limit]


def _resolve_knowledge_base_dir(knowledge_base: str | None) -> Path:
    base_name = (knowledge_base or DEFAULT_KNOWLEDGE_BASE).strip() or DEFAULT_KNOWLEDGE_BASE
    candidate = (KNOWLEDGE_ROOT / base_name).resolve()
    root_resolved = KNOWLEDGE_ROOT.resolve()
    if candidate.parent != root_resolved:
        raise ValueError(f"Invalid knowledge base '{base_name}'.")
    return candidate


def _read_document(path: Path, *, base_dir: Path) -> dict[str, str]:
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
        "source": str(path.relative_to(base_dir)),
        "summary": summary,
        "content": content,
    }


def _extract_search_terms(query: str) -> list[str]:
    terms: list[str] = []
    for part in re.split(r"[\s,，。！？!?、:：;；/]+", query):
        normalized = part.strip()
        if not normalized:
            continue
        terms.append(normalized)
        ascii_terms = re.findall(r"[a-z0-9_+-]+", normalized)
        terms.extend(ascii_terms)
        cjk_only = "".join(re.findall(r"[\u4e00-\u9fff]+", normalized))
        if len(cjk_only) >= 2:
            terms.append(cjk_only)
            if len(cjk_only) >= 4:
                terms.extend(cjk_only[index : index + 2] for index in range(len(cjk_only) - 1))
    return list(dict.fromkeys(term for term in terms if term))
