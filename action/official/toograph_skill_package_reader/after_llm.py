from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any


VALID_SCOPE = {"user", "official"}
SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".mypy_cache", ".pytest_cache"}
SKIP_SUFFIXES = {".pyc", ".pyo", ".so", ".dll", ".dylib"}
MAX_FILE_BYTES = 200_000
MAX_TOTAL_BYTES = 800_000


def toograph_skill_package_reader(**skill_inputs: Any) -> dict[str, Any]:
    skill_key = _normalize_skill_key(skill_inputs.get("skill_key") or skill_inputs.get("target_skill_key"))
    if not skill_key:
        return _failure("Invalid skill_key. Use letters, numbers, underscores, or hyphens only.")

    requested_scope = _normalize_scope(skill_inputs.get("source_scope"))
    repo_root = _repo_root()
    candidates = _candidate_roots(repo_root, skill_key, requested_scope)
    for scope, skill_dir in candidates:
        if skill_dir.is_dir():
            package = _read_package(skill_key=skill_key, source_scope=scope, skill_dir=skill_dir, repo_root=repo_root)
            return {
                "success": True,
                "skill_package": package,
                "result": f"Read {package['file_count']} files from {scope} action '{skill_key}'.",
                "activity_events": [
                    {
                        "kind": "skill_package_read",
                        "summary": f"Read Action package {skill_key}.",
                        "status": "succeeded",
                        "detail": {
                            "skill_key": skill_key,
                            "source_scope": scope,
                            "file_count": package["file_count"],
                            "omitted_count": len(package["omitted_files"]),
                        },
                    }
                ],
            }

    scope_text = requested_scope or "user or official"
    return _failure(f"Action '{skill_key}' was not found in {scope_text} packages.")


def _read_package(*, skill_key: str, source_scope: str, skill_dir: Path, repo_root: Path) -> dict[str, Any]:
    files: dict[str, str] = {}
    omitted: list[dict[str, str]] = []
    total_bytes = 0
    for path in sorted(item for item in skill_dir.rglob("*") if item.is_file()):
        relative = path.relative_to(skill_dir).as_posix()
        if _should_skip(path, relative):
            omitted.append({"path": relative, "reason": "runtime_artifact"})
            continue
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            omitted.append({"path": relative, "reason": "file_too_large"})
            continue
        if total_bytes + size > MAX_TOTAL_BYTES:
            omitted.append({"path": relative, "reason": "package_budget_exceeded"})
            continue
        try:
            files[relative] = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            omitted.append({"path": relative, "reason": "not_utf8"})
            continue
        total_bytes += size

    return {
        "kind": "skill_package",
        "skill_key": skill_key,
        "source_scope": source_scope,
        "root": skill_dir.relative_to(repo_root).as_posix(),
        "files": files,
        "omitted_files": omitted,
        "file_count": len(files),
        "total_bytes": total_bytes,
    }


def _should_skip(path: Path, relative: str) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    if relative.startswith("."):
        return True
    return False


def _candidate_roots(repo_root: Path, skill_key: str, requested_scope: str) -> list[tuple[str, Path]]:
    roots = {
        "user": repo_root / "action" / "user" / skill_key,
        "official": repo_root / "action" / "official" / skill_key,
    }
    if requested_scope in VALID_SCOPE:
        return [(requested_scope, roots[requested_scope])]
    return [("user", roots["user"]), ("official", roots["official"])]


def _normalize_skill_key(value: Any) -> str:
    text = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", text):
        return ""
    return text


def _normalize_scope(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in VALID_SCOPE else ""


def _failure(result: str) -> dict[str, Any]:
    return {"success": False, "skill_package": {}, "result": result}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(toograph_skill_package_reader(**payload), ensure_ascii=False))
