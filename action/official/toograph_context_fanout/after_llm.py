from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
from typing import Any, Callable


DEFAULT_TOTAL_BUDGET_CHARS = 6000
MIN_TOTAL_BUDGET_CHARS = 800
MAX_TOTAL_BUDGET_CHARS = 20000
BRANCH_KEYS = ("memory", "knowledge", "page", "capabilities")


def toograph_context_fanout(**action_inputs: Any) -> dict[str, Any]:
    request = _dict(action_inputs.get("fanout_request"))
    merged_inputs = {**request, **{key: value for key, value in action_inputs.items() if key != "fanout_request"}}
    user_message = _text(merged_inputs.get("user_message"))
    conversation_history = _text(merged_inputs.get("conversation_history"))
    page_context = _text(merged_inputs.get("page_context"))
    buddy_context = merged_inputs.get("buddy_context")
    total_budget = _bounded_int(
        merged_inputs.get("total_budget_chars"),
        default=DEFAULT_TOTAL_BUDGET_CHARS,
        minimum=MIN_TOTAL_BUDGET_CHARS,
        maximum=MAX_TOTAL_BUDGET_CHARS,
    )
    budgets = _branch_budgets(total_budget)

    branch_jobs: dict[str, Callable[[], dict[str, Any]]] = {
        "memory": lambda: _memory_branch(
            query=_text(merged_inputs.get("memory_query")) or user_message,
            scope=_text(merged_inputs.get("memory_scope")),
            buddy_context=buddy_context,
            budget_chars=budgets["memory"],
        ),
        "knowledge": lambda: _knowledge_branch(
            query=_text(merged_inputs.get("knowledge_query")) or user_message,
            knowledge_base=_text(merged_inputs.get("knowledge_base")),
            budget_chars=budgets["knowledge"],
        ),
        "page": lambda: _page_branch(
            page_context=page_context,
            conversation_history=conversation_history,
            buddy_context=buddy_context,
            budget_chars=budgets["page"],
        ),
        "capabilities": lambda: _capabilities_branch(
            query=_text(merged_inputs.get("capability_query")) or user_message,
            origin=_text(merged_inputs.get("capability_origin")) or "buddy",
            budget_chars=budgets["capabilities"],
        ),
    }
    branch_results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=len(BRANCH_KEYS)) as executor:
        futures = {key: executor.submit(job) for key, job in branch_jobs.items()}
        for key in BRANCH_KEYS:
            try:
                branch_results[key] = futures[key].result()
            except Exception as exc:
                branch_results[key] = _failed_branch(key, str(exc))

    context_brief, assembly_report = _merge_context_brief(
        user_message=user_message,
        branch_results=branch_results,
        total_budget=total_budget,
    )
    fanout_context = {
        "kind": "context_fanout",
        "parallelizable": True,
        "branches": [
            {
                "key": key,
                "status": branch_results[key]["status"],
                "used_chars": branch_results[key]["used_chars"],
                "omitted_count": len(branch_results[key].get("omitted", [])),
                "source_count": branch_results[key].get("source_count", 0),
            }
            for key in BRANCH_KEYS
        ],
        "outputs": {
            "memory": branch_results["memory"].get("value", {}),
            "knowledge": branch_results["knowledge"].get("value", {}),
            "page": branch_results["page"].get("value", {}),
            "capabilities": branch_results["capabilities"].get("value", {}),
        },
        "merge_report": assembly_report,
    }
    result_text = (
        "Assembled read-only context fanout: "
        f"{assembly_report['budget']['used_chars']}/{total_budget} chars used, "
        f"{assembly_report['budget']['omitted_count']} omitted item(s)."
    )
    return {
        "success": all(branch_results[key]["status"] in {"succeeded", "empty"} for key in BRANCH_KEYS),
        "context_brief": context_brief,
        "fanout_context": fanout_context,
        "memory_context": branch_results["memory"].get("value", _empty_memory_context()),
        "knowledge_context": branch_results["knowledge"].get("value", _empty_knowledge_context()),
        "page_context_summary": branch_results["page"].get("value", {}),
        "capability_candidates": branch_results["capabilities"].get("value", _empty_capability_candidates()),
        "assembly_report": assembly_report,
        "result": result_text,
        "activity_events": [
            {
                "kind": "context_fanout",
                "summary": result_text,
                "status": "succeeded",
                "detail": {
                    "branches": fanout_context["branches"],
                    "budget": assembly_report["budget"],
                    "merge_policy": assembly_report["merge_policy"],
                },
            }
        ],
    }


def _memory_branch(*, query: str, scope: str, buddy_context: Any, budget_chars: int) -> dict[str, Any]:
    del scope
    memory_markdown = _extract_buddy_memory_markdown(buddy_context)
    if not memory_markdown:
        repo_root = _repo_root()
        backend_path = repo_root / "backend"
        if str(backend_path) not in sys.path:
            sys.path.insert(0, str(backend_path))
        try:
            from app.buddy.home import build_buddy_home_context_pack

            memory_markdown = _text(build_buddy_home_context_pack().get("memory_markdown"))
        except Exception:
            memory_markdown = ""
    summary, omitted = _budget_text(memory_markdown, budget_chars, source="buddy_home/MEMORY.md")
    memory_context = {
        "kind": "buddy_home_memory_context",
        "query": query,
        "source": "buddy_home/MEMORY.md",
        "used_chars": len(summary),
        "source_chars": len(memory_markdown),
        "content": summary,
        "omitted": omitted,
    }
    return _branch_result(
        "memory",
        memory_context,
        summary=summary,
        budget_chars=budget_chars,
        omitted=omitted,
        source_count=1 if memory_markdown else 0,
    )


def _extract_buddy_memory_markdown(buddy_context: Any) -> str:
    if isinstance(buddy_context, dict):
        for key in ("memory_markdown", "memory", "MEMORY.md"):
            value = buddy_context.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        files = buddy_context.get("files")
        if isinstance(files, list):
            for item in files:
                if not isinstance(item, dict):
                    continue
                name = _text(item.get("name") or item.get("path"))
                if name.endswith("MEMORY.md"):
                    content = _text(item.get("content"))
                    if content:
                        return content
    if isinstance(buddy_context, str) and "MEMORY.md" in buddy_context:
        return buddy_context.strip()
    return ""


def _knowledge_branch(*, query: str, knowledge_base: str, budget_chars: int) -> dict[str, Any]:
    repo_root = _repo_root()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))
    from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context

    context = retrieve_knowledge_base_context(
        knowledge_base=knowledge_base or None,
        query=query,
        limit=3,
    )
    summary_parts = []
    for index, item in enumerate(context.get("results") or [], start=1):
        if not isinstance(item, dict):
            continue
        summary_parts.append(
            f"[{index}] {item.get('title', '')} - {item.get('summary', '') or item.get('source', '')}"
        )
    return _branch_result(
        "knowledge",
        context,
        summary="\n".join(summary_parts),
        budget_chars=budget_chars,
        omitted=[],
        source_count=int(context.get("result_count") or 0),
    )


def _page_branch(
    *,
    page_context: str,
    conversation_history: str,
    buddy_context: Any,
    budget_chars: int,
) -> dict[str, Any]:
    buddy_context_summary = _buddy_context_summary(buddy_context)
    raw_sections = [
        _section("page_context", page_context),
        _section("conversation_history", conversation_history),
        _section("buddy_context_refs", buddy_context_summary),
    ]
    raw_summary = "\n".join(section for section in raw_sections if section.strip())
    summary, omitted = _budget_text(raw_summary, budget_chars, source="page")
    value = {
        "kind": "page_context_summary",
        "summary": summary,
        "source_chars": len(raw_summary),
        "used_chars": len(summary),
        "omitted": omitted,
    }
    return _branch_result(
        "page",
        value,
        summary=summary,
        budget_chars=budget_chars,
        omitted=omitted,
        source_count=1 if raw_summary else 0,
    )


def _capabilities_branch(*, query: str, origin: str, budget_chars: int) -> dict[str, Any]:
    templates = [
        {
            "kind": "subgraph",
            "key": "toograph_page_operation_workflow",
            "name": "操作 TooGraph 页面",
            "description": "固定 TooGraph 页面操作入口。",
            "permissions": [],
            "output_contract": [],
            "score": 0,
        }
    ]
    actions: list[dict[str, Any]] = []
    value = {
        "kind": "capability_candidates",
        "origin": origin or "buddy",
        "query": query,
        "templates": templates,
        "actions": actions,
        "counts": {
            "templates": len(templates),
            "actions": 0,
            "errors": 0,
        },
        "errors": [],
    }
    summary_lines = [
        *[f"- template:{item['key']} {item.get('name', '')}" for item in value["templates"][:5]],
    ]
    return _branch_result(
        "capabilities",
        value,
        summary="\n".join(summary_lines),
        budget_chars=budget_chars,
        omitted=[],
        source_count=len(value["templates"]) + len(value["actions"]),
    )


def _merge_context_brief(
    *,
    user_message: str,
    branch_results: dict[str, dict[str, Any]],
    total_budget: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    used_chars = 0
    omitted: list[dict[str, Any]] = []
    sections: dict[str, str] = {}
    for key in BRANCH_KEYS:
        summary = str(branch_results[key].get("summary") or "")
        remaining = max(0, total_budget - used_chars)
        selected, local_omitted = _budget_text(summary, remaining, source=key)
        sections[key] = selected
        used_chars += len(selected)
        omitted.extend(branch_results[key].get("omitted", []))
        omitted.extend(local_omitted)
    conflicts = _detect_conflicts(branch_results)
    context_brief = {
        "kind": "context_brief",
        "instruction_boundary": "context_only",
        "current_task_focus": user_message,
        "memory": sections.get("memory", ""),
        "knowledge": sections.get("knowledge", ""),
        "page": sections.get("page", ""),
        "capabilities": sections.get("capabilities", ""),
        "budget_notes": {
            "total_budget_chars": total_budget,
            "used_chars": used_chars,
            "omitted_count": len(omitted),
            "omitted": omitted,
            "conflicts": conflicts,
        },
    }
    assembly_report = {
        "kind": "context_fanout_assembly_report",
        "merge_policy": "priority_budget_with_conflict_notes",
        "branches": [
            {
                "key": key,
                "status": branch_results[key]["status"],
                "budget_chars": branch_results[key]["budget_chars"],
                "used_chars": branch_results[key]["used_chars"],
                "source_count": branch_results[key].get("source_count", 0),
                "omitted_count": len(branch_results[key].get("omitted", [])),
            }
            for key in BRANCH_KEYS
        ],
        "budget": {
            "total_budget_chars": total_budget,
            "used_chars": used_chars,
            "omitted_count": len(omitted),
            "omitted": omitted,
        },
        "conflicts": conflicts,
        "instruction_boundary": "context_only",
    }
    return context_brief, assembly_report


def _branch_result(
    key: str,
    value: dict[str, Any],
    *,
    summary: str,
    budget_chars: int,
    omitted: list[Any],
    source_count: int,
) -> dict[str, Any]:
    selected_summary, local_omitted = _budget_text(summary, budget_chars, source=key)
    return {
        "key": key,
        "status": "succeeded" if source_count > 0 or selected_summary else "empty",
        "value": value,
        "summary": selected_summary,
        "budget_chars": budget_chars,
        "used_chars": len(selected_summary),
        "omitted": [*_normalize_omitted(omitted, source=key), *local_omitted],
        "source_count": source_count,
    }


def _failed_branch(key: str, error: str) -> dict[str, Any]:
    return {
        "key": key,
        "status": "failed",
        "value": {},
        "summary": "",
        "budget_chars": 0,
        "used_chars": 0,
        "omitted": [],
        "source_count": 0,
        "error": error,
    }


def _branch_budgets(total_budget: int) -> dict[str, int]:
    return {
        "memory": max(120, int(total_budget * 0.25)),
        "knowledge": max(120, int(total_budget * 0.30)),
        "page": max(120, int(total_budget * 0.20)),
        "capabilities": max(120, int(total_budget * 0.20)),
    }


def _budget_text(value: str, max_chars: int, *, source: str) -> tuple[str, list[dict[str, Any]]]:
    text = _text(value)
    if not text or len(text) <= max_chars:
        return text, []
    if max_chars <= 1:
        return "", [{"source": source, "reason": "budget_exhausted", "omitted_chars": len(text)}]
    marker = "..." if max_chars >= 3 else "." * max_chars
    kept_chars = max(0, max_chars - len(marker))
    return (
        f"{text[:kept_chars]}{marker}",
        [
            {
                "source": source,
                "reason": "truncated_by_budget",
                "original_chars": len(text),
                "kept_chars": max_chars,
                "omitted_chars": len(text) - max_chars,
            }
        ],
    )


def _detect_conflicts(branch_results: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    page_summary = str(branch_results.get("page", {}).get("summary") or "").lower()
    capability_summary = str(branch_results.get("capabilities", {}).get("summary") or "").lower()
    if "offline" in page_summary and "web_search" in capability_summary:
        conflicts.append(
            {
                "kind": "context_capability_mismatch",
                "message": "Page context suggests offline mode while capability candidates include web_search.",
            }
        )
    return conflicts


def _normalize_omitted(items: list[Any], *, source: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            normalized.append({"source": source, **item})
        else:
            normalized.append({"source": source, "value": _text(item)})
    return normalized


def _buddy_context_summary(value: Any) -> str:
    if isinstance(value, dict):
        if value.get("kind") == "local_folder":
            selected = value.get("selected") if isinstance(value.get("selected"), list) else []
            return "Buddy Home selected files: " + ", ".join(str(item) for item in selected)
        return json.dumps(_safe_json(value), ensure_ascii=False, sort_keys=True)
    return _text(value)


def _section(name: str, value: str) -> str:
    return f"{name}:\n{value}" if value else ""


def _empty_memory_context() -> dict[str, Any]:
    return {
        "kind": "buddy_home_memory_context",
        "query": "",
        "source": "buddy_home/MEMORY.md",
        "used_chars": 0,
        "source_chars": 0,
        "content": "",
        "omitted": [],
    }


def _empty_knowledge_context() -> dict[str, Any]:
    return {
        "knowledge_base": "",
        "query": "",
        "result_count": 0,
        "context": "",
        "results": [],
        "citations": [],
    }


def _empty_capability_candidates() -> dict[str, Any]:
    return {
        "kind": "capability_candidates",
        "origin": "buddy",
        "query": "",
        "templates": [],
        "actions": [],
        "counts": {"templates": 0, "actions": 0, "errors": 0},
        "errors": [],
    }


def _optional_filter(value: str) -> str | None:
    text = value.strip().lower().replace(" ", "_")
    if not text:
        return None
    return "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in text)


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def _dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _safe_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _safe_json(raw_value) for key, raw_value in value.items()}
    if isinstance(value, list):
        return [_safe_json(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(toograph_context_fanout(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
