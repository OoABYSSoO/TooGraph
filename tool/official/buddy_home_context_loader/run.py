from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_SELECTED_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"]
DEFAULT_MAX_CHARS = 24000
# The workspace instruction note is frozen for automated maintenance, but still
# participates in context assembly when selected by official Buddy templates.
FILE_AUTHORITY = {
    "AGENTS.md": "context_only",
    "SOUL.md": "identity",
    "USER.md": "preference",
    "MEMORY.md": "preference",
}


def buddy_home_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.buddy.home import ensure_buddy_home, get_default_buddy_home_dir

        selection = inputs.get("buddy_home_selection")
        selected_files = _selected_files(selection)
        home_dir = _resolve_home_dir(selection, get_default_buddy_home_dir())
        buddy_home = ensure_buddy_home(home_dir)
        max_chars = _bounded_int(inputs.get("max_chars"), default=DEFAULT_MAX_CHARS, minimum=512, maximum=200000)

        warnings: list[dict[str, Any]] = []
        source_refs: list[dict[str, Any]] = []
        rendered_sections: list[str] = []
        source_chars = 0
        used_chars = 0
        omitted_count = 0

        for relative_path in selected_files:
            file_path = _safe_buddy_home_file(buddy_home, relative_path)
            if file_path is None or not file_path.is_file():
                warnings.append(_warning("buddy_home_file_missing", f"Buddy Home file is missing: {relative_path}"))
                continue
            content = file_path.read_text(encoding="utf-8", errors="replace")
            source_chars += len(content)
            authority = FILE_AUTHORITY.get(relative_path, "context_only")
            remaining = max_chars - used_chars
            if remaining <= 0:
                omitted_count += 1
                continue
            section = _render_file_section(relative_path=relative_path, authority=authority, content=content)
            if len(section) > remaining:
                section = section[: max(0, remaining)] + "\n[Buddy Home context omitted by max_chars budget.]"
                omitted_count += 1
            used_chars += len(section)
            rendered_sections.append(section)
            source_refs.append(
                {
                    "source_kind": "buddy_home_file",
                    "source_id": relative_path,
                    "source_content_hash": _content_hash(content),
                    "label": relative_path,
                    "ordinal": len(source_refs),
                    "metadata": {
                        "authority": authority,
                        "root": "buddy_home",
                    },
                }
            )

        rendered_text = "\n\n".join(rendered_sections)
        context_ref = _build_context_ref(source_refs=source_refs, max_chars=max_chars, rendered_text=rendered_text)
        package = {
            "kind": "context_package",
            "package_id": _context_package_id(context_ref),
            "source_kind": "buddy_home",
            "authority": "context_only",
            "title": "Buddy Home context",
            "items": _build_items(source_refs),
            "source_refs": source_refs,
            "source_count": len(source_refs),
            "context_ref": context_ref,
            "budget": {
                "max_chars": max_chars,
                "source_chars": source_chars,
                "used_chars": len(rendered_text),
                "omitted_count": omitted_count,
            },
            "warnings": warnings,
            "metadata": {
                "renderer_key": "buddy_home",
                "renderer_version": "1",
                "selected_files": selected_files,
            },
        }
        return {
            "status": "succeeded",
            "buddy_context": package,
            "buddy_home_context_report": {
                "scope": "buddy_home",
                "selected_files": selected_files,
                "source_refs": source_refs,
                "source_count": len(source_refs),
                "max_chars": max_chars,
                "source_chars": source_chars,
                "used_chars": len(rendered_text),
                "omitted_count": omitted_count,
                "warnings": warnings,
            },
        }
    except Exception as exc:
        warning = _warning("buddy_home_context_load_failed", str(exc))
        return {
            "status": "failed",
            "error_type": "buddy_home_context_load_failed",
            "error": str(exc),
            "buddy_context": _empty_package([warning]),
            "buddy_home_context_report": {
                "scope": "buddy_home",
                "selected_files": [],
                "source_refs": [],
                "source_count": 0,
                "warnings": [warning],
            },
        }


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _selected_files(selection: Any) -> list[str]:
    selected = selection.get("selected") if isinstance(selection, dict) else None
    raw_files = selected if isinstance(selected, list) else DEFAULT_SELECTED_FILES
    files: list[str] = []
    seen: set[str] = set()
    for item in raw_files:
        relative_path = str(item or "").strip().replace("\\", "/")
        if not relative_path or relative_path.startswith("/") or ".." in Path(relative_path).parts:
            continue
        if relative_path in seen:
            continue
        seen.add(relative_path)
        files.append(relative_path)
    return files or list(DEFAULT_SELECTED_FILES)


def _resolve_home_dir(selection: Any, default_home: Path) -> Path:
    if not isinstance(selection, dict):
        return default_home
    root = str(selection.get("root") or selection.get("path") or "").strip()
    if not root or root == "buddy_home":
        return default_home
    candidate = Path(root).expanduser()
    if not candidate.is_absolute():
        repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path.cwd()).expanduser().resolve()
        candidate = repo_root / candidate
    return candidate.resolve()


def _safe_buddy_home_file(home_dir: Path, relative_path: str) -> Path | None:
    try:
        candidate = (home_dir / relative_path).resolve()
        candidate.relative_to(home_dir.resolve())
        return candidate
    except ValueError:
        return None


def _build_context_ref(*, source_refs: list[dict[str, Any]], max_chars: int, rendered_text: str) -> dict[str, Any]:
    source_key = [
        [ref.get("source_kind"), ref.get("source_id"), ref.get("source_content_hash"), ref.get("metadata", {}).get("authority")]
        for ref in source_refs
    ]
    assembly_key = json.dumps({"source_refs": source_key, "max_chars": max_chars}, ensure_ascii=False, sort_keys=True)
    assembly_hash = hashlib.sha256(assembly_key.encode("utf-8")).hexdigest()[:16]
    return {
        "kind": "context_assembly_ref",
        "assembly_id": f"ctx_buddy_home_{assembly_hash}",
        "target_state_key": "buddy_context",
        "renderer_key": "buddy_home",
        "renderer_version": "1",
        "rendered_content_hash": _content_hash(rendered_text) if rendered_text else "",
        "source_count": len(source_refs),
        "source_refs": source_refs,
        "budget": {"max_chars": max_chars},
        "metadata": {"scope": "buddy_home"},
        "preview": f"Buddy Home files: {len(source_refs)}",
    }


def _build_items(source_refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for source_ref in source_refs:
        authority = str(source_ref.get("metadata", {}).get("authority") or "context_only")
        source_id = str(source_ref.get("source_id") or "")
        items.append(
            {
                "id": source_id,
                "title": source_id,
                "source_ref": source_ref,
                "metadata": {
                    "source_kind": "buddy_home_file",
                    "authority": authority,
                    "ordinal": source_ref.get("ordinal"),
                },
            }
        )
    return items


def _empty_package(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "pkg_buddy_home_empty",
        "source_kind": "buddy_home",
        "authority": "context_only",
        "title": "Buddy Home context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": {
            "kind": "context_assembly_ref",
            "assembly_id": "ctx_buddy_home_empty",
            "target_state_key": "buddy_context",
            "renderer_key": "buddy_home",
            "renderer_version": "1",
            "rendered_content_hash": "",
            "source_count": 0,
            "source_refs": [],
        },
        "budget": {"source_chars": 0, "used_chars": 0, "omitted_count": 0},
        "warnings": warnings,
        "metadata": {"renderer_key": "buddy_home", "renderer_version": "1"},
    }


def _render_file_section(*, relative_path: str, authority: str, content: str) -> str:
    return f"source: {relative_path}\nauthority: {authority}\n{content.strip()}"


def _context_package_id(context_ref: dict[str, Any]) -> str:
    assembly_id = str(context_ref.get("assembly_id") or "")
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    return "pkg_buddy_home"


def _content_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def _warning(code: str, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


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
    print(json.dumps(buddy_home_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
