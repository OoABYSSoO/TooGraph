from __future__ import annotations

from typing import Any

from app.knowledge.loader import DEFAULT_KNOWLEDGE_BASE, search_knowledge


def retrieve_knowledge_base_context(
    *,
    knowledge_base: str | None,
    query: str | None,
    limit: int = 3,
) -> dict[str, Any]:
    normalized_query = str(query or "").strip()
    resolved_knowledge_base = str(knowledge_base or DEFAULT_KNOWLEDGE_BASE).strip() or DEFAULT_KNOWLEDGE_BASE
    normalized_limit = max(1, min(int(limit or 3), 8))

    results = search_knowledge(normalized_query, knowledge_base=resolved_knowledge_base, limit=normalized_limit)
    formatted_results = [
        {
            "title": item["title"],
            "section": item.get("section", ""),
            "summary": item["summary"],
            "source": item["source"],
            "url": item.get("url") or item["source"],
            "score": item.get("score", 0.0),
        }
        for item in results
    ]
    citations = [
        {
            "index": index,
            "title": item["title"],
            "section": item.get("section", ""),
            "source": item["source"],
            "url": item.get("url") or item["source"],
        }
        for index, item in enumerate(results, start=1)
    ]
    context = "\n\n".join(
        (
            f"[{index}] {item['title']}\n"
            f"Knowledge Base: {item.get('kb_label') or item.get('kb_id') or resolved_knowledge_base}\n"
            f"Section: {item.get('section') or 'Overview'}\n"
            f"Source: {item.get('url') or item['source']}\n"
            f"Excerpt:\n{item['content']}"
        )
        for index, item in enumerate(results, start=1)
    )
    return {
        "knowledge_base": results[0].get("kb_id", resolved_knowledge_base) if results else resolved_knowledge_base,
        "query": normalized_query,
        "result_count": len(results),
        "context": context,
        "results": formatted_results,
        "citations": citations,
    }
