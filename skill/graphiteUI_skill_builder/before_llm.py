from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


MAX_GUIDE_CHARS = 24000


def graphiteui_skill_builder_before_llm(**payload: Any) -> dict[str, str]:
    guide = _read_authoring_guide()
    if not guide:
        return {
            "context": (
                "GraphiteUI Skill authoring guide was not found. "
                "Generate only skill_json, skill_md, before_llm_py and after_llm_py. "
                "Do not write files or install the generated Skill."
            )
        }
    trimmed = guide[:MAX_GUIDE_CHARS]
    suffix = "\n\n[Guide truncated. Follow the visible rules.]" if len(guide) > MAX_GUIDE_CHARS else ""
    return {
        "context": (
            "Use the following active GraphiteUI Skill authoring guide. "
            "Generate file contents only; do not write files, install, test, repair or create templates.\n\n"
            f"{trimmed}{suffix}"
        )
    }


def _read_authoring_guide() -> str:
    for root in _candidate_repo_roots():
        guide_path = root / "skill" / "SKILL_AUTHORING_GUIDE.md"
        if guide_path.is_file():
            return guide_path.read_text(encoding="utf-8").strip()
    return ""


def _candidate_repo_roots() -> list[Path]:
    candidates: list[Path] = []
    env_root = str(os.getenv("GRAPHITE_REPO_ROOT") or "").strip()
    if env_root:
        candidates.append(Path(env_root))
    current = Path(__file__).resolve()
    candidates.extend(current.parents)
    seen: set[Path] = set()
    unique: list[Path] = []
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_skill_builder_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
