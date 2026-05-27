from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_MAX_CHARS = 24000


def web_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        query = _as_text(inputs.get("query"))
        source_urls = _list_text(inputs.get("source_urls"))
        artifact_paths = _list_text(inputs.get("artifact_paths"))
        search_results = _list_records(inputs.get("search_results") or inputs.get("results"))
        errors = _list_text(inputs.get("errors"))
        run_id = _as_text(inputs.get("source_run_id") or inputs.get("run_id"))
        max_chars = _bounded_int(inputs.get("max_chars"), default=DEFAULT_MAX_CHARS, minimum=512, maximum=200000)

        rendered_text, source_refs, used_chars, source_chars, omitted_count, warnings = _render_web_context(
            query=query,
            source_urls=source_urls,
            artifact_paths=artifact_paths,
            search_results=search_results,
            errors=errors,
            run_id=run_id,
            max_chars=max_chars,
        )
        context_ref = _build_context_ref(
            source_refs=source_refs,
            query=query,
            run_id=run_id,
            max_chars=max_chars,
            rendered_text=rendered_text,
        )
        used_chars = _context_ref_rendered_chars(context_ref, fallback=used_chars)
        package = _build_context_package(
            query=query,
            source_refs=source_refs,
            context_ref=context_ref,
            run_id=run_id,
            max_chars=max_chars,
            used_chars=used_chars,
            source_chars=source_chars,
            omitted_count=omitted_count,
            warnings=warnings,
        )
        return {
            "status": "succeeded",
            "web_context_package": package,
            "web_context_report": {
                "scope": "web",
                "query": query,
                "run_id": run_id,
                "source_refs": source_refs,
                "source_count": len(source_refs),
                "artifact_paths": artifact_paths,
                "source_urls": source_urls,
                "max_chars": max_chars,
                "source_chars": source_chars,
                "used_chars": used_chars,
                "omitted_count": omitted_count,
                "warnings": warnings,
            },
        }
    except Exception as exc:
        warning = _warning("web_context_load_failed", str(exc))
        return {
            "status": "failed",
            "error_type": "web_context_load_failed",
            "error": str(exc),
            "web_context_package": _empty_package([warning]),
            "web_context_report": {
                "scope": "web",
                "source_refs": [],
                "source_count": 0,
                "warnings": [warning],
            },
        }


def _render_web_context(
    *,
    query: str,
    source_urls: list[str],
    artifact_paths: list[str],
    search_results: list[dict[str, Any]],
    errors: list[str],
    run_id: str,
    max_chars: int,
) -> tuple[str, list[dict[str, Any]], int, int, int, list[dict[str, Any]]]:
    sections: list[tuple[str, dict[str, Any]]] = []
    warnings = [_warning("web_source_error", error) for error in errors if error]
    for index, artifact_path in enumerate(artifact_paths):
        artifact = _read_artifact(artifact_path)
        if not artifact:
            warnings.append(_warning("web_artifact_unavailable", f"Web artifact '{artifact_path}' could not be read."))
            continue
        source_url = source_urls[index] if index < len(source_urls) else _extract_source_url(artifact)
        section = _format_web_source_document(
            name=Path(artifact_path.replace("\\", "/")).name or artifact_path,
            query=query,
            url=source_url,
            artifact_path=artifact_path,
            content=artifact,
        )
        sections.append(
            (
                section,
                _source_ref_from_artifact(
                    query=query,
                    run_id=run_id,
                    artifact_path=artifact_path,
                    source_url=source_url,
                    content=section,
                    ordinal=len(sections),
                ),
            )
        )
    if not sections:
        for result in search_results:
            title = _as_text(result.get("title")) or "Web result"
            url = _as_text(result.get("url"))
            snippet = _as_text(result.get("content") or result.get("snippet") or result.get("body"))
            if not (title or url or snippet):
                continue
            lines = [f"Web result: {title}"]
            if query:
                lines.append(f"query: {query}")
            if url:
                lines.append(f"url: {url}")
            if snippet:
                lines.append(snippet)
            section = "\n".join(lines)
            sections.append(
                (
                    section,
                    _source_ref_from_search_result(
                        query=query,
                        run_id=run_id,
                        title=title,
                        url=url,
                        snippet=snippet,
                        content=section,
                        ordinal=len(sections),
                    ),
                )
            )
    if not sections and source_urls:
        for source_url in source_urls:
            section = "\n".join(part for part in ["Web source URL", f"query: {query}" if query else "", f"url: {source_url}"] if part)
            sections.append(
                (
                    section,
                    _source_ref_from_search_result(
                        query=query,
                        run_id=run_id,
                        title=source_url,
                        url=source_url,
                        snippet="",
                        content=section,
                        ordinal=len(sections),
                    ),
                )
            )
    rendered_sections: list[str] = []
    source_refs: list[dict[str, Any]] = []
    used_chars = 0
    source_chars = 0
    omitted_count = 0
    for section, source_ref in sections:
        source_chars += len(section)
        separator = "\n\n" if rendered_sections else ""
        remaining = max_chars - used_chars
        if remaining <= 0:
            omitted_count += 1
            continue
        section_with_separator = f"{separator}{section}"
        if len(section_with_separator) > remaining:
            section_with_separator = section_with_separator[: max(0, remaining)] + "\n[Web context omitted by max_chars budget.]"
            omitted_count += 1
        used_chars += len(section_with_separator)
        rendered_sections.append(section_with_separator if not separator else section_with_separator[len(separator):])
        source_refs.append(source_ref)
    if not source_refs:
        warnings.append(_warning("empty_web_context", "No web evidence sources were available."))
    return "\n\n".join(rendered_sections), source_refs, used_chars, source_chars, omitted_count, warnings


def _source_ref_from_artifact(
    *,
    query: str,
    run_id: str,
    artifact_path: str,
    source_url: str,
    content: str,
    ordinal: int,
) -> dict[str, Any]:
    content_hash = _put_source_blob(content, kind="web_source_document", run_id=run_id, source_id=artifact_path)
    return {
        "source_kind": "web_source_document",
        "source_id": artifact_path,
        "source_content_hash": content_hash,
        "label": Path(artifact_path.replace("\\", "/")).name or artifact_path,
        "ordinal": ordinal,
        "metadata": {
            "run_id": run_id,
            "query": query,
            "artifact_path": artifact_path,
            "source_url": source_url,
        },
    }


def _source_ref_from_search_result(
    *,
    query: str,
    run_id: str,
    title: str,
    url: str,
    snippet: str,
    content: str,
    ordinal: int,
) -> dict[str, Any]:
    content_hash = _put_source_blob(content, kind="web_search_result", run_id=run_id, source_id=url or title)
    source_id = url or f"{query}:{ordinal}"
    return {
        "source_kind": "web_search_result",
        "source_id": source_id,
        "source_content_hash": content_hash,
        "label": title or url,
        "ordinal": ordinal,
        "metadata": {
            "run_id": run_id,
            "query": query,
            "title": title,
            "source_url": url,
            "snippet": snippet,
        },
    }


def _build_context_ref(
    *,
    source_refs: list[dict[str, Any]],
    query: str,
    run_id: str,
    max_chars: int,
    rendered_text: str,
) -> dict[str, Any]:
    if not source_refs:
        return _empty_context_ref()
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="web_context_package",
            renderer_key="web_context",
            renderer_version="1",
            rendered_text=rendered_text,
            sources=source_refs,
            budget={"max_chars": max_chars},
            metadata={
                "scope": "web",
                "query": query,
                "run_id": run_id,
                "context_security_policy": {"block_high_risk": True},
            },
        )
    except Exception:
        source_key = [[ref.get("source_kind"), ref.get("source_id"), ref.get("source_content_hash")] for ref in source_refs]
        key = json.dumps({"source_refs": source_key, "max_chars": max_chars}, ensure_ascii=False, sort_keys=True)
        return {
            "kind": "context_assembly_ref",
            "assembly_id": f"ctx_web_{hashlib.sha256(key.encode('utf-8')).hexdigest()[:16]}",
            "target_state_key": "web_context_package",
            "renderer_key": "web_context",
            "renderer_version": "1",
            "rendered_content_hash": _content_hash(rendered_text) if rendered_text else "",
            "source_count": len(source_refs),
            "source_refs": source_refs,
            "budget": {"max_chars": max_chars},
            "metadata": {
                "scope": "web",
                "query": query,
                "run_id": run_id,
                "context_security_policy": {"block_high_risk": True},
            },
        }


def _build_context_package(
    *,
    query: str,
    source_refs: list[dict[str, Any]],
    context_ref: dict[str, Any],
    run_id: str,
    max_chars: int,
    used_chars: int,
    source_chars: int,
    omitted_count: int,
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    items = [
        {
            "id": _as_text(ref.get("source_id")),
            "title": _as_text(ref.get("label")),
            "source_ref": ref,
            "metadata": {
                "run_id": run_id,
                "query": query,
                "source_url": _as_text(_coerce_dict(ref.get("metadata")).get("source_url")),
                "artifact_path": _as_text(_coerce_dict(ref.get("metadata")).get("artifact_path")),
            },
        }
        for ref in source_refs
    ]
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref),
        "source_kind": "web",
        "authority": "evidence",
        "title": "Web context",
        "items": items,
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "context_ref": context_ref,
        "budget": {
            "max_chars": max_chars,
            "source_chars": source_chars,
            "used_chars": used_chars,
            "omitted_count": omitted_count,
        },
        "warnings": warnings,
        "metadata": {
            "renderer_key": "web_context",
            "renderer_version": "1",
            "run_id": run_id,
            "query": query,
        },
    }


def _empty_package(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "pkg_web_empty",
        "source_kind": "web",
        "authority": "evidence",
        "title": "Web context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": _empty_context_ref(),
        "budget": {"source_chars": 0, "used_chars": 0, "omitted_count": 0},
        "warnings": warnings,
        "metadata": {"renderer_key": "web_context", "renderer_version": "1"},
    }


def _empty_context_ref() -> dict[str, Any]:
    return {
        "kind": "context_assembly_ref",
        "assembly_id": "ctx_web_empty",
        "target_state_key": "web_context_package",
        "renderer_key": "web_context",
        "renderer_version": "1",
        "rendered_content_hash": "",
        "source_count": 0,
        "source_refs": [],
    }


def _context_ref_rendered_chars(context_ref: dict[str, Any], *, fallback: int) -> int:
    try:
        from app.core.storage.context_assembly_store import expand_context_assembly_ref

        expanded = expand_context_assembly_ref(context_ref)
        return len(str(expanded.get("text") or ""))
    except Exception:
        return fallback


def _read_artifact(relative_path: str) -> str:
    try:
        from app.core.storage.capability_artifact_store import read_capability_artifact_text_for_prompt

        artifact = read_capability_artifact_text_for_prompt(relative_path)
        return _as_text(artifact.get("content"))
    except Exception:
        return ""


def _put_source_blob(content: str, *, kind: str, run_id: str, source_id: str) -> str:
    try:
        from app.core.storage.content_blob_store import put_content_blob

        blob = put_content_blob(
            content,
            "text/plain",
            {
                "kind": kind,
                "run_id": run_id,
                "source_id": source_id,
            },
        )
        return _as_text(blob.get("content_hash"))
    except Exception:
        return _content_hash(content)


def _format_web_source_document(*, name: str, query: str, url: str, artifact_path: str, content: str) -> str:
    lines = [f"Web source: {name or artifact_path}"]
    if query:
        lines.append(f"query: {query}")
    if url:
        lines.append(f"url: {url}")
    if artifact_path:
        lines.append(f"artifact_path: {artifact_path}")
    lines.append(content)
    return "\n".join(lines)


def _extract_source_url(content: str) -> str:
    for line in content.splitlines():
        normalized = line.strip()
        if normalized.lower().startswith("source url:"):
            return normalized.split(":", 1)[1].strip()
    return ""


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _context_package_id(context_ref: dict[str, Any]) -> str:
    assembly_id = _as_text(context_ref.get("assembly_id"))
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    if assembly_id:
        return f"pkg_{assembly_id}"
    return "pkg_web_empty"


def _content_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def _warning(code: str, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _list_text(value: Any) -> list[str]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return [text]
        return _list_text(parsed)
    if not isinstance(value, list):
        return []
    return [_as_text(item) for item in value if _as_text(item)]


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "failed", "error_type": "invalid_json", "error": str(exc)}, ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(
            json.dumps(
                {"status": "failed", "error_type": "invalid_input", "error": "stdin must be a JSON object."},
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps(web_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
