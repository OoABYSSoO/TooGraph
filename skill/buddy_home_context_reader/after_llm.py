from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def buddy_home_context_reader(**_skill_inputs: Any) -> dict[str, Any]:
    repo_root = _resolve_repo_root()
    build_context_pack, buddy_home_dir_name = _load_buddy_home_helpers()
    context_pack = build_context_pack(repo_root / buddy_home_dir_name)
    return {"context_pack": context_pack}


def _load_buddy_home_helpers() -> tuple[Any, str]:
    backend_dir = Path(__file__).resolve().parents[2] / "backend"
    backend_path = str(backend_dir)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    from app.buddy.home import BUDDY_HOME_DIR_NAME, build_buddy_home_context_pack

    return build_buddy_home_context_pack, BUDDY_HOME_DIR_NAME


def _resolve_repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(buddy_home_context_reader(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
