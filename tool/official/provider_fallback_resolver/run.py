from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def provider_fallback_resolver(payload: dict[str, Any] | None) -> dict[str, Any]:
    _ensure_backend_path()
    from app.core.provider_fallback import resolve_provider_fallback

    return resolve_provider_fallback(payload)


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


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
    print(json.dumps(provider_fallback_resolver(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
